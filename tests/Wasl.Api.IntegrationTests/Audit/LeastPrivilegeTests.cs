using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Audit;

/// <summary>
/// The audit log is append-only by PERMISSION, not by convention. `003b`, BR-9.5.
/// </summary>
/// <remarks>
/// <para>
/// `003` shipped the trail and said plainly what it had not shipped: *"the audit log is
/// append-only by application convention, not by database permission … AC-12/AC-13 unverified."*
/// Measured on 2026-08-30, before this feature, on the connection the application actually used:
/// </para>
/// <code>
/// ServerPrincipal | IsSysadmin | IsDbOwner | CanUpdate | CanDelete
/// sa              | 1          | 1         | 1         | 1
///
/// UPDATE TOP (1) dbo.AuditLog SET Action = 'TAMPERED';   -- RowsUpdated: 1
/// DELETE TOP (1) FROM dbo.AuditLog;                      -- RowsDeleted: 1
/// </code>
/// <para>
/// Both succeeded. These tests are the same statements, on the principal the application holds
/// now.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class LeastPrivilegeTests(WaslApiFactory factory)
{
    /// <summary>The connection the APPLICATION uses — not the fixture's, not the DBA's.</summary>
    /// <remarks>
    /// Taken from the running host's own <c>WaslDbContext</c>. Opening a connection the test
    /// composed itself would prove what the test can do, which is the distinction the product
    /// owner named as the one that separates this feature from four SQL statements.
    /// </remarks>
    private string ApplicationConnectionString()
    {
        using var scope = factory.Services.CreateScope();

        return scope.ServiceProvider.GetRequiredService<WaslDbContext>()
            .Database.GetConnectionString()!;
    }

    private async Task<T> ScalarAsync<T>(string sql)
    {
        await using var connection = new SqlConnection(ApplicationConnectionString());
        await connection.OpenAsync();

        await using var command = new SqlCommand(sql, connection);

        var value = await command.ExecuteScalarAsync();

        value.Should().NotBeNull(
            "a null here means the permission function returned nothing, which is what "
            + "HAS_PERMS_BY_NAME does for an object the principal cannot even see — a different "
            + "failure from the 0 this feature is asserting, and one a cast would hide");

        return (T)value!;
    }

    // ── AC-1, AC-5 · the tamper probe ──────────────────────────────────────────────

    /// <summary>
    /// AC-1, AC-5 — `UPDATE` and `DELETE` on `dbo.AuditLog` fail with SQL Server error 229.
    /// </summary>
    /// <remarks>
    /// <b>The negative control is the deliverable here, not an afterthought.</b> Every earlier run
    /// of this suite would have passed a `GRANT`/`DENY` pair that did nothing, because `DENY` is
    /// not applied to a member of <c>sysadmin</c> and the suite connected as <c>sa</c>.
    /// <br/>
    /// Wrapped in a transaction and rolled back, so a build in which the DENY is missing does not
    /// also corrupt the shared audit table for every other test in the collection.
    /// </remarks>
    [Theory]
    [InlineData("UPDATE dbo.AuditLog SET Action = 'TAMPERED' WHERE Id = (SELECT MIN(Id) FROM dbo.AuditLog)")]
    [InlineData("DELETE FROM dbo.AuditLog WHERE Id = (SELECT MIN(Id) FROM dbo.AuditLog)")]
    public async Task The_application_cannot_mutate_the_audit_log(string statement)
    {
        await using var connection = new SqlConnection(ApplicationConnectionString());
        await connection.OpenAsync();

        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();
        await using var command = new SqlCommand(statement, connection, transaction);

        var act = async () => await command.ExecuteNonQueryAsync();

        (await act.Should().ThrowAsync<SqlException>())
            .Which.Number.Should().Be(229,
                "229 is SQL Server's permission-denied error. A different number would mean the "
                + "statement failed for some other reason and the DENY was never reached");

        await transaction.RollbackAsync();
    }

    /// <summary>The other half: it CAN read and append. A locked table is not the goal.</summary>
    [Fact]
    public async Task The_application_can_still_read_and_append()
    {
        (await ScalarAsync<int>("SELECT HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','SELECT')"))
            .Should().Be(1);

        (await ScalarAsync<int>("SELECT HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','INSERT')"))
            .Should().Be(1);
    }

    // ── AC-2 · asserted from inside a request ──────────────────────────────────────

    /// <summary>
    /// AC-2 — the principal the API holds **while serving a request** is not privileged.
    /// </summary>
    /// <remarks>
    /// <b>Through the API, not through a connection this test opened.</b> The product owner ruled
    /// it this way and gave the reason: *a test that opens its own connection proves what the test
    /// can do, not what the application does* — and the failure mode this guards against is
    /// precisely the application quietly running as something more powerful than intended.
    /// <br/>
    /// The probe endpoint is a test-only route, mapped the way `004`'s auth probes are, so nothing
    /// in `src/` exists solely to be measured.
    /// </remarks>
    [Fact]
    public async Task The_request_principal_is_neither_sysadmin_nor_db_owner()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync(Probe.LeastPrivilegeProbeEndpoints.PrincipalPath);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        body.GetProperty("user").GetString().Should().Be(LeastPrivilegeProvisioner.AppUser,
            "the API must be connected as the restricted principal while serving a request");

        body.GetProperty("isSysadmin").GetInt32().Should().Be(0);
        body.GetProperty("isDbOwner").GetInt32().Should().Be(0);
        body.GetProperty("canUpdateAuditLog").GetInt32().Should().Be(0,
            "this is the assertion `003` wrote and could not run");
        body.GetProperty("canDeleteAuditLog").GetInt32().Should().Be(0);
    }

    // ── AC-3 · DENY beats the role ─────────────────────────────────────────────────

    /// <summary>
    /// AC-3 — `wasl_app` is in `db_datawriter` **and** cannot touch the audit log.
    /// </summary>
    /// <remarks>
    /// The whole design rests on `DENY` overriding a role `GRANT`, so it is asserted rather than
    /// assumed. Without the role membership the `DENY` would be redundant and this feature would
    /// be proving nothing; without the `DENY` winning, the role would make the table writable.
    /// </remarks>
    [Fact]
    public async Task The_deny_beats_the_role_grant()
    {
        await using var connection = new SqlConnection(factory.MigratorConnectionString);
        await connection.OpenAsync();

        await using var command = new SqlCommand(
            """
            SELECT IS_ROLEMEMBER('db_datawriter', @user)
            """,
            connection);

        command.Parameters.AddWithValue("@user", LeastPrivilegeProvisioner.AppUser);

        ((int)(await command.ExecuteScalarAsync())!).Should().Be(1,
            "the principal must genuinely hold the role the DENY overrides, or the DENY is "
            + "redundant and proves nothing");

        // And it still cannot write, which is the pair that matters.
        (await ScalarAsync<int>("SELECT HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','UPDATE')"))
            .Should().Be(0);
    }

    // ── AC-8 · the trail still works under the new principal ───────────────────────

    /// <summary>
    /// AC-8 — a state-changing request still writes its audit row.
    /// </summary>
    /// <remarks>
    /// A `DENY UPDATE` that also broke `INSERT` would turn every command into a `500`, and a
    /// permissions feature that silently stops the audit trail is worse than no permissions
    /// feature. `003`'s own criteria, re-run under the restricted principal.
    /// </remarks>
    [Fact]
    public async Task A_state_changing_request_still_writes_its_audit_row()
    {
        var before = (await AuditFixture.RowsForAsync(factory, "Customer.Created")).Count;

        var response = await factory.CreateEnglishManagerClient().PostAsJsonAsync(
            "/api/customers",
            new { fullName = "Least privilege probe", email = $"{Guid.CreateVersion7():N}@wasl.local" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        (await AuditFixture.RowsForAsync(factory, "Customer.Created")).Count
            .Should().Be(before + 1, "BR-9.4 still holds on the restricted principal");
    }
}
