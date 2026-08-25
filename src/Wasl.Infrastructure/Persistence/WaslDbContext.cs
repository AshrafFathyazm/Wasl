using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Audit;
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

    /// <summary>
    /// The forensic record. Named <c>AuditLog</c> to match the table, while the entity is
    /// <c>AuditEntry</c> — one row is an entry, the table is the log (`research.md` R-6).
    /// </summary>
    /// <remarks>
    /// Deliberately <b>not</b> exposed on <see cref="IApplicationDbContext"/>. Nothing in the
    /// Application layer writes an audit row: the pipeline does, from
    /// <c>Wasl.Infrastructure</c>, through <c>IAuditWriter</c>. Putting it on the interface
    /// would let a handler write its own row, which is the remembered discipline BR-9 exists
    /// to replace.
    /// </remarks>
    public DbSet<AuditEntry> AuditLog => Set<AuditEntry>();

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
