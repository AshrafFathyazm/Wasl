using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Customers;

namespace Wasl.Infrastructure.Persistence;

/// <summary>
/// The one place that knows the database exists. Implements
/// <see cref="IApplicationDbContext"/> so the Application layer can persist without
/// referencing EF Core (AC-7).
/// </summary>
public sealed class WaslDbContext(DbContextOptions<WaslDbContext> options)
    : DbContext(options), IApplicationDbContext
{
    public DbSet<Customer> Customers => Set<Customer>();

    // IApplicationDbContext exposes IQueryable, not DbSet — see that interface for why.
    // DbSet<T> IS an IQueryable<T>, so this is an upcast and costs nothing.
    IQueryable<Customer> IApplicationDbContext.Customers => Customers;

    void IApplicationDbContext.Add<TEntity>(TEntity entity) => Set<TEntity>().Add(entity);

    void IApplicationDbContext.Remove<TEntity>(TEntity entity) => Set<TEntity>().Remove(entity);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(WaslDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        // Applied as conventions rather than per-property, so a new entity inherits both
        // by existing. A convention that has to be remembered is not a convention.
        builder.Properties<DateTime>()
            .HaveConversion<UtcDateTimeConverter>()
            .HaveColumnType("datetime2(3)");

        builder.Properties<DateTime?>()
            .HaveConversion<NullableUtcDateTimeConverter>()
            .HaveColumnType("datetime2(3)");

        base.ConfigureConventions(builder);
    }
}
