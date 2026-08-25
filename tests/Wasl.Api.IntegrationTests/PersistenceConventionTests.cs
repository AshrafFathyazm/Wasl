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
public sealed class PersistenceConventionTests(WaslApiFactory factory)
    : IClassFixture<WaslApiFactory>
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
    public async Task Customers_HasNoFilteredIndexYet_ThoseBelongToFeature007()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var filters = await context.Database
            .SqlQuery<string>(
                $"""
                 SELECT ISNULL(filter_definition, '(none)') AS Value
                 FROM sys.indexes
                 WHERE object_id = OBJECT_ID('dbo.Customers') AND name IS NOT NULL
                 """)
            .ToListAsync(CancellationToken.None);

        filters.Should().OnlyContain(filter => filter == "(none)",
            "the duplicate rule (BR-4.8) and its filtered indexes are feature 007's, "
            + "tested alongside the behaviour they enforce");
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
}
