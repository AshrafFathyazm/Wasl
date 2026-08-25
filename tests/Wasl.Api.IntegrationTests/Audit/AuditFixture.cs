using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Domain.Audit;
using Wasl.Domain.Customers;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Audit;

/// <summary>
/// Seeding and reading helpers for the audit tests.
/// </summary>
/// <remarks>
/// <para>
/// <b>Writes go through EF, never through raw SQL.</b> `001` learned this the expensive way: a
/// test that inserted with raw SQL bypassed the global UTC value converter and failed by
/// exactly the local offset, and the test was wrong rather than the converter. Anything
/// asserting <c>OccurredAtUtc</c> has to arrive by the same path production uses.
/// </para>
/// <para>
/// Reflection sets <c>Customer</c>'s private setters. The entity is a shell until `007` gives
/// it a factory, so there is no legitimate way to populate one yet — and adding a public
/// mutator to a domain entity for a test's benefit is how an entity becomes a bag.
/// </para>
/// </remarks>
internal static class AuditFixture
{
    public static async Task<Guid> SeedCustomerAsync(WaslApiFactory factory, string? companyName = "initial")
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var customer = (Customer)Activator.CreateInstance(typeof(Customer), nonPublic: true)!;
        var id = Guid.NewGuid();

        Set(customer, nameof(Customer.Id), id);
        Set(customer, nameof(Customer.FullName), "Probe Customer");
        Set(customer, nameof(Customer.Email), $"probe-{id:N}@example.com");
        Set(customer, nameof(Customer.CompanyName), companyName);
        Set(customer, nameof(Customer.IsActive), true);
        Set(customer, nameof(Customer.CreatedAtUtc), DateTime.UtcNow);
        Set(customer, nameof(Customer.UpdatedAtUtc), DateTime.UtcNow);

        context.Customers.Add(customer);
        await context.SaveChangesAsync(CancellationToken.None);

        return id;
    }

    /// <summary>
    /// Every audit row for one action, newest first. Scoped to the action so concurrent tests
    /// in the same class cannot see each other's rows.
    /// </summary>
    /// <remarks>
    /// <c>AsNoTracking</c> and a fresh scope, because AC-20 re-reads a row after changing the
    /// actor — a tracked entity would return the in-memory copy and the assertion would pass
    /// without touching the database.
    /// </remarks>
    public static async Task<List<AuditEntry>> RowsForAsync(WaslApiFactory factory, string action)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.AuditLog
            .AsNoTracking()
            .Where(entry => entry.Action == action)
            .OrderByDescending(entry => entry.Id)
            .ToListAsync(CancellationToken.None);
    }

    public static async Task<Customer?> ReadCustomerAsync(WaslApiFactory factory, Guid id)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.Customers
            .AsNoTracking()
            .SingleOrDefaultAsync(customer => customer.Id == id, CancellationToken.None);
    }

    private static void Set(Customer customer, string property, object? value) =>
        typeof(Customer).GetProperty(property)!.SetValue(customer, value);
}
