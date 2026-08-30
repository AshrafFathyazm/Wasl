using System.Reflection;
using Microsoft.Data.SqlClient;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Domain.Customers;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests;

/// <summary>
/// The conventions from <c>data-model.md</c> that every later table inherits — and every
/// one of which fails <em>silently</em> if it is wrong.
/// </summary>
/// <remarks>
/// All of these need a real engine. EF <c>InMemory</c> would pass every one of them while
/// proving nothing, which is why <c>testing/test-strategy.md</c> forbids it.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class PersistenceConventionTests(WaslApiFactory factory)

{
    /// <summary>TEST-001-03, AC-8. The converter is only as good as this test.</summary>
    [Fact]
    public async Task DateTime_RoundTrips_AsUtc()
    {
        var id = Guid.NewGuid();
        var written = new DateTime(2026, 8, 25, 9, 30, 0, DateTimeKind.Utc);

        await Insert(id, "UTC round trip", createdAtUtc: written);

        var read = await Read(id);

        read.CreatedAtUtc.Kind.Should().Be(DateTimeKind.Utc,
            "SQL Server returns Unspecified; the converter stamps Utc on read, and without "
            + "it a caller comparing against TimeProvider.GetUtcNow() gets an answer that "
            + "depends on the server's time zone");
        read.CreatedAtUtc.Should().BeCloseTo(written, TimeSpan.FromMilliseconds(1),
            "datetime2(3) keeps milliseconds");
    }

    /// <summary>TEST-001-03, AC-8. The dangerous direction: a Local value on write.</summary>
    [Fact]
    public async Task DateTime_WithLocalKind_IsNormalisedOnWrite()
    {
        var id = Guid.NewGuid();
        var local = new DateTime(2026, 8, 25, 12, 0, 0, DateTimeKind.Local);

        await Insert(id, "Local normalised", createdAtUtc: local);

        var read = await Read(id);

        read.CreatedAtUtc.Kind.Should().Be(DateTimeKind.Utc);
        read.CreatedAtUtc.Should().BeCloseTo(local.ToUniversalTime(), TimeSpan.FromMilliseconds(1),
            "a Local value stored as if it were UTC is wrong from then on, silently and "
            + "permanently — this is the defect ADR-013 replaced timestamptz with a "
            + "converter to prevent");
    }

    /// <summary>TEST-001-04, AC-12. varchar would return ????, and it looks like a font bug.</summary>
    [Fact]
    public async Task ArabicText_RoundTrips_ByteIdentical()
    {
        var id = Guid.NewGuid();
        const string arabic = "علي الأحمد";

        await Insert(id, arabic);

        var read = await Read(id);

        read.FullName.Should().Be(arabic,
            "nvarchar is required for anything a human writes. varchar under a non-Arabic "
            + "collation returns ???? and presents as a rendering fault rather than a "
            + "schema one, which is exactly why it survives review (ADR-013 row 4)");
    }

    /// <summary>TEST-001-05, AC-12, BR-4.1. The invariant as a database guarantee.</summary>
    [Fact]
    public async Task Customer_WithNeitherEmailNorPhone_IsRejectedByTheDatabase()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var act = async () => await context.Database.ExecuteSqlRawAsync(
            """
            INSERT INTO dbo.Customers
                (Id, FullName, Email, PhoneE164, IsActive, CreatedAtUtc, UpdatedAtUtc)
            VALUES
                (NEWID(), N'No contact at all', NULL, NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME())
            """,
            CancellationToken.None);

        // SqlException, not DbUpdateException: EF wraps failures from SaveChanges, but
        // this insert is raw SQL and the provider exception surfaces directly. Error 547
        // is a constraint violation, and the message names which constraint.
        var exception = (await act.Should().ThrowAsync<SqlException>(
            "the contact invariant is enforced by the database, not only by the "
            + "application — BR-4.1 must hold for a row inserted by hand during "
            + "support work too")).Which;

        exception.Number.Should().Be(547, "547 is a constraint violation");
        exception.Message.Should().Contain("CK_Customers_Contact");
    }

    /// <summary>TEST-001-05. The constraint exists, checked rather than assumed.</summary>
    [Fact]
    public async Task CheckConstraint_Exists_OnTheCustomersTable()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var names = await context.Database
            .SqlQuery<string>(
                $"""
                 SELECT name AS Value
                 FROM sys.check_constraints
                 WHERE parent_object_id = OBJECT_ID('dbo.Customers')
                 """)
            .ToListAsync(CancellationToken.None);

        names.Should().Contain("CK_Customers_Contact");
    }

    /// <summary>
    /// AC-12. The filtered unique indexes belong to feature 007, not here — asserted so
    /// that adding them early is caught rather than absorbed.
    /// </summary>
    [Fact]
    public async Task Customers_NowHasExactlyTwoFilteredIndexes_AddedByFeature007()
    {
        // `003b`: on the MIGRATOR connection, because this reads sys.indexes. The runtime
        // principal is `wasl_app` now and deliberately has no VIEW DEFINITION — the application
        // never inspects its own schema, and granting the right so a test could pass would give
        // production a permission only the suite wanted.
        await using var connection = new SqlConnection(factory.MigratorConnectionString);
        await connection.OpenAsync();

        await using var command = new SqlCommand(
            """
            SELECT ISNULL(filter_definition, '(none)')
            FROM sys.indexes
            WHERE object_id = OBJECT_ID('dbo.Customers') AND name IS NOT NULL
            """,
            connection);

        var filters = new List<string>();

        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                filters.Add(reader.GetString(0));
            }
        }

        // INVERTED BY `007`, 2026-08-29. `001` wrote this to assert the filtered indexes did NOT
        // exist yet — "the duplicate rule and its filtered indexes are feature 007's, tested
        // alongside the behaviour they enforce" — and it went red on the commit that added them,
        // which is a guard doing exactly what it was written for.
        //
        // Kept rather than deleted, and inverted rather than loosened: the property worth holding
        // now is that Customers has exactly TWO filtered indexes and no more. A third would mean
        // somebody added a duplicate rule without a business rule behind it.
        filters.Count(filter => filter != "(none)").Should().Be(2,
            "UX_Customers_Email_Active and UX_Customers_Phone_Active — BR-4.8, added by `007`. "
            + "`007` AC-18 asserts each one's filter in detail; this asserts the count, so a third "
            + "filtered index has to be justified rather than merely added");
    }

    /// <summary>TEST-001-08. Migrations apply cleanly even when unrelated objects exist.</summary>
    [Fact]
    public async Task Migrations_AreIdempotent()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var pending = await context.Database
            .GetPendingMigrationsAsync(CancellationToken.None);

        pending.Should().BeEmpty("the fixture already migrated; a second pass applies nothing (AC-3)");
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Inserts **through EF Core**, which is the whole point: the UTC value converter is
    /// part of the EF write path, and a raw <c>INSERT</c> bypasses it entirely.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The first version of this helper used raw SQL, and
    /// <see cref="DateTime_WithLocalKind_IsNormalisedOnWrite"/> failed by three hours as a
    /// result — the parameter went straight to the column unconverted. The test was wrong,
    /// not the converter, but the failure surfaced something worth writing down:
    /// <b>the write-side guarantee holds only for writes that go through EF Core.</b> A
    /// manual <c>INSERT</c> during support work can still store a local time, and nothing
    /// in the schema prevents it.
    /// </para>
    /// <para>
    /// Reflection is used to construct the entity because <c>Customer</c> is deliberately
    /// a shell in feature 001 — its factory is feature 007's, and inventing one here would
    /// pre-empt that specification.
    /// </para>
    /// </remarks>
    private async Task Insert(Guid id, string fullName, DateTime? createdAtUtc = null)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();
        var timestamp = createdAtUtc ?? DateTime.UtcNow;

        var customer = (Customer)Activator.CreateInstance(typeof(Customer), nonPublic: true)!;
        Set(customer, nameof(Customer.Id), id);
        Set(customer, nameof(Customer.FullName), fullName);
        Set(customer, nameof(Customer.Email), $"{Guid.NewGuid():N}@example.com");
        Set(customer, nameof(Customer.IsActive), true);
        Set(customer, nameof(Customer.CreatedAtUtc), timestamp);
        Set(customer, nameof(Customer.UpdatedAtUtc), timestamp);

        context.Customers.Add(customer);
        await context.SaveChangesAsync(CancellationToken.None);
    }

    private static void Set(Customer customer, string propertyName, object? value) =>
        typeof(Customer)
            .GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance)!
            .SetValue(customer, value);

    private async Task<Customer> Read(Guid id)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.Customers
            .AsNoTracking()
            .SingleAsync(customer => customer.Id == id, CancellationToken.None);
    }
    /// <summary>
    /// Every timestamp this application writes is at the precision the column keeps. `007`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The class of defect, not the instance.</b> `007` AC-14 found a `POST` returning
    /// <c>"createdAtUtc":"…57.7129947Z"</c> against a `GET` of the same resource returning
    /// <c>"…57.712Z"</c> — full .NET tick precision in memory, <c>datetime2(3)</c> in the column.
    /// A client caching a create response holds a value the server will never return again.
    /// </para>
    /// <para>
    /// Measured across the features afterwards rather than assumed: `009`'s ticket create was
    /// already correct because <c>Ticket</c> is an <c>IAuditableEntity</c> and its stamps come from
    /// <c>Stamp()</c>; `013`'s comment was **not**, because <c>TicketComment.CreatedAtUtc</c> and
    /// <c>TicketHistoryEntry.PerformedAtUtc</c> come from <c>IRequestTimestamp</c>. So the
    /// truncation lives there — the one place both paths read — and this asserts the property
    /// rather than any single endpoint.
    /// </para>
    /// </remarks>
    [Fact]
    public void TheRequestTimestamp_IsTruncatedTo_TheColumnsPrecision()
    {
        using var scope = factory.Services.CreateScope();
        var timestamp = scope.ServiceProvider
            .GetRequiredService<Wasl.Application.Common.Abstractions.IRequestTimestamp>();

        var now = timestamp.UtcNow;

        (now.Ticks % TimeSpan.TicksPerMillisecond).Should().Be(0,
            "every timestamp column in this schema is datetime2(3), so a value carrying sub-"
            + "millisecond ticks is one the database cannot store and the response therefore "
            + "cannot be reproduced by a later read");

        timestamp.UtcNow.Should().Be(now,
            "and it is still memoized — `009` AC-9 depends on two rows written in one request "
            + "sharing an instant exactly");
    }
}
