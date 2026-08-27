using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.Seed;
using Wasl.Domain.Users;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Auth;

/// <summary>
/// <c>dbo.SupportUsers</c> and the two rows in it. `004` AC-13, AC-14, AC-22, AC-23.
/// </summary>
[Collection(WaslApiCollection.Name)]
public sealed class SupportUserSeedTests(WaslApiFactory factory)
{
    /// <summary>AC-13.</summary>
    /// <remarks>
    /// The factory already seeded once during initialisation, so this run is the second — which is
    /// what makes the hash comparison meaningful. PBKDF2 salts per call, so a seeder that
    /// re-hashed would produce a different value here while looking perfectly correct in the
    /// database.
    /// </remarks>
    [Fact]
    public async Task Seeding_again_writes_nothing_and_leaves_both_hashes_untouched()
    {
        var before = await SnapshotAsync();

        await SupportUserSeeder.SeedAsync(factory.Services);

        var after = await SnapshotAsync();

        after.Should().HaveCount(2);
        after.Should().BeEquivalentTo(before,
            "the seeder is idempotent by email, and re-hashing would change the value silently");
    }

    /// <summary>AC-14.</summary>
    [Fact]
    public async Task The_stored_value_is_a_verifiable_hash_and_not_the_password()
    {
        var stored = (await SnapshotAsync())
            .Single(row => row.Email == SupportUserSeeder.ManagerEmail).Hash;

        stored.Should().NotBe(WaslApiFactory.ManagerPassword);
        stored.Should().NotContain(WaslApiFactory.ManagerPassword);

        // The framework's own verifier, against the framework's own format. Asserting a prefix or
        // a length would pass for a base64-encoded plaintext.
        new PasswordHasher<SupportUser>()
            .VerifyHashedPassword(null!, stored, WaslApiFactory.ManagerPassword)
            .Should().Be(PasswordVerificationResult.Success);
    }

    /// <summary>AC-23, the <c>nvarchar</c> half.</summary>
    /// <remarks>
    /// A <c>varchar</c> column returns <c>??????</c> here, which reads as a font problem and is
    /// not one — ADR-013 names it as the defect that costs the most time to diagnose.
    /// </remarks>
    [Fact]
    public async Task Arabic_in_a_name_round_trips_byte_identical()
    {
        var name = (await SnapshotAsync())
            .Single(row => row.Email == SupportUserSeeder.ManagerEmail).FullName;

        name.Should().Be("منى العتيبي");
    }

    /// <summary>AC-22 — the columns, and the index's filter.</summary>
    /// <remarks>
    /// <para>
    /// <b><c>filter_definition IS NULL</c> is asserted, not assumed.</b> `001` shipped a filtered
    /// index on <c>Customers.Email</c> because the duplicate rule needs one there; this index must
    /// be the opposite, and "unfiltered" is invisible in C# — <c>HasIndex(...).IsUnique()</c> reads
    /// identically whether or not someone later adds a filter. Email is the login identity, so it
    /// must be unique across inactive users too: a filtered index would let a deactivated
    /// address be taken by someone else, and reactivation would then be impossible.
    /// </para>
    /// <para>
    /// The collation is read from <c>INFORMATION_SCHEMA</c> rather than trusted from the
    /// configuration, because a server default of <c>_CS_</c> would make AC-23 fail in production
    /// and pass on a developer's machine.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task The_table_matches_the_data_model()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await using var connection = new SqlConnection(context.Database.GetConnectionString());
        await connection.OpenAsync();

        var columns = new Dictionary<string, (string Type, int? Length, string? Collation)>();

        await using (var command = connection.CreateCommand())
        {
            command.CommandText = """
                SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, COLLATION_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'SupportUsers'
                """;

            await using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                columns[reader.GetString(0)] = (
                    reader.GetString(1),
                    reader.IsDBNull(2) ? null : reader.GetInt32(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3));
            }
        }

        columns.Keys.Should().BeEquivalentTo(
            "Id", "FullName", "Email", "PasswordHash", "Role", "PreferredLanguage",
            "IsActive", "CreatedAtUtc", "RowVersion");

        columns["Id"].Type.Should().Be("uniqueidentifier");
        columns["FullName"].Should().Be(("nvarchar", 200, columns["FullName"].Collation));
        columns["Email"].Type.Should().Be("nvarchar");
        columns["Email"].Length.Should().Be(320);
        columns["Email"].Collation.Should().Be("Latin1_General_100_CI_AS");
        columns["PasswordHash"].Type.Should().Be("nvarchar");
        columns["PasswordHash"].Length.Should().Be(400);
        columns["CreatedAtUtc"].Type.Should().Be("datetime2");
        columns["RowVersion"].Type.Should().Be("timestamp",
            "rowversion reports as timestamp in INFORMATION_SCHEMA — the same type under its "
            + "deprecated name");

        await using var index = connection.CreateCommand();
        index.CommandText = """
            SELECT i.is_unique, i.filter_definition
            FROM sys.indexes i
            WHERE i.name = 'UX_SupportUsers_Email'
              AND i.object_id = OBJECT_ID('dbo.SupportUsers')
            """;

        await using var indexReader = await index.ExecuteReaderAsync();

        (await indexReader.ReadAsync()).Should().BeTrue("UX_SupportUsers_Email must exist");
        indexReader.GetBoolean(0).Should().BeTrue();
        indexReader.IsDBNull(1).Should().BeTrue(
            "this index is deliberately UNFILTERED, unlike the one on Customers.Email");
    }

    private async Task<List<(string Email, string FullName, string Hash, string Role, string Language)>>
        SnapshotAsync()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.SupportUsers
            .AsNoTracking()
            .OrderBy(user => user.Email)
            .Select(user => ValueTuple.Create(
                user.Email, user.FullName, user.PasswordHash,
                user.Role.ToString(), user.PreferredLanguage))
            .ToListAsync();
    }
}
