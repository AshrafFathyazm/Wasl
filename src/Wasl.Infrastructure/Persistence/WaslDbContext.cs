using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Audit;
using Wasl.Domain.Common;
using Wasl.Domain.Customers;
using Wasl.Domain.Tickets;

namespace Wasl.Infrastructure.Persistence;

/// <summary>
/// The one place that knows the database exists. Implements
/// <see cref="IApplicationDbContext"/> so the Application layer can persist without
/// referencing EF Core (AC-7).
/// </summary>
public sealed class WaslDbContext(
    DbContextOptions<WaslDbContext> options,
    IRequestTimestamp timestamp,
    ICurrentUser currentUser)
    : DbContext(options), IApplicationDbContext
{
    /// <summary>
    /// Stamps every <see cref="IAuditableEntity"/> before saving, then saves.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Handlers do not stamp.</b> A timestamp each handler is responsible for is a timestamp
    /// one handler will forget, and the forgetting fails nothing — no test goes red, no
    /// constraint is violated, a row simply carries <c>0001-01-01</c> until someone sorts by it.
    /// Doing it here makes it structural, which is the same argument BR-9 makes for the audit
    /// row.
    /// </para>
    /// <para>
    /// <b>Before <c>base</c>, necessarily.</b> `003`'s <c>AuditDiffInterceptor</c> captures the
    /// change tracker in <c>SavingChanges</c>, which <c>base</c> raises — so the stamps are
    /// already applied when it looks. That interceptor excludes these four properties from the
    /// diff by name: they are infrastructure, not a change the actor made, and including them
    /// would put two timestamp entries in every audit row and a <c>UpdatedByUserId</c> entry in
    /// every update.
    /// </para>
    /// <para>
    /// <b>The instant comes from <see cref="IRequestTimestamp"/>, not from <c>TimeProvider</c>
    /// directly.</b> A handler writing a history row needs the <i>same</i> instant (AC-9), and
    /// two callers of <c>GetUtcNow()</c> get two values that differ by microseconds — close
    /// enough to pass every test and wrong in a timeline.
    /// </para>
    /// </remarks>
    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        Stamp();
        return base.SaveChangesAsync(cancellationToken);
    }

    /// <inheritdoc cref="SaveChangesAsync(CancellationToken)"/>
    public override int SaveChanges()
    {
        Stamp();
        return base.SaveChanges();
    }

    private void Stamp()
    {
        var now = timestamp.UtcNow.UtcDateTime;
        var actor = currentUser.UserId;

        foreach (var entry in ChangeTracker.Entries<IAuditableEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    // UpdatedAtUtc equals CreatedAtUtc on insert. A null "never updated" would
                    // make every consumer handle two shapes for one fact.
                    entry.CurrentValues[nameof(IAuditableEntity.CreatedAtUtc)] = now;
                    entry.CurrentValues[nameof(IAuditableEntity.UpdatedAtUtc)] = now;
                    entry.CurrentValues[nameof(IAuditableEntity.CreatedByUserId)] = actor;

                    // UpdatedByUserId stays null on insert: nobody has updated it. Setting it to
                    // the creator would make "who last touched this" unanswerable.
                    break;

                case EntityState.Modified:
                    // Created* is never rewritten. Assigning it here would silently move a row's
                    // creation time on every edit.
                    entry.CurrentValues[nameof(IAuditableEntity.UpdatedAtUtc)] = now;
                    entry.CurrentValues[nameof(IAuditableEntity.UpdatedByUserId)] = actor;
                    break;
            }
        }
    }

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

    public DbSet<Ticket> Tickets => Set<Ticket>();

    /// <summary>
    /// The product timeline. Not exposed on <see cref="IApplicationDbContext"/> — `013` reads it
    /// and will add it then; `009` only writes it, which needs no <c>IQueryable</c>.
    /// </summary>
    public DbSet<TicketHistoryEntry> TicketHistory => Set<TicketHistoryEntry>();

    // IApplicationDbContext exposes IQueryable, not DbSet — see that interface for why.
    // DbSet<T> IS an IQueryable<T>, so this is an upcast and costs nothing.
    IQueryable<Customer> IApplicationDbContext.Customers => Customers;

    IQueryable<Ticket> IApplicationDbContext.Tickets => Tickets;

    void IApplicationDbContext.Add<TEntity>(TEntity entity) => Set<TEntity>().Add(entity);

    void IApplicationDbContext.Remove<TEntity>(TEntity entity) => Set<TEntity>().Remove(entity);

    // The async materialisation `009` declared. These are the EF Core extension methods the
    // Application layer cannot name, wrapped one-for-one with nothing added — a wrapper that
    // did more would be a place for query behaviour to accumulate out of sight of the call site.
    Task<bool> IApplicationDbContext.AnyAsync<TEntity>(
        IQueryable<TEntity> query, CancellationToken cancellationToken) =>
        query.AnyAsync(cancellationToken);

    Task<TEntity?> IApplicationDbContext.FirstOrDefaultAsync<TEntity>(
        IQueryable<TEntity> query, CancellationToken cancellationToken)
        where TEntity : default =>
        query.FirstOrDefaultAsync(cancellationToken);

    Task<List<TEntity>> IApplicationDbContext.ToListAsync<TEntity>(
        IQueryable<TEntity> query, CancellationToken cancellationToken) =>
        query.ToListAsync(cancellationToken);

    Task<int> IApplicationDbContext.CountAsync<TEntity>(
        IQueryable<TEntity> query, CancellationToken cancellationToken) =>
        query.CountAsync(cancellationToken);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(WaslDbContext).Assembly);

        // AC-3, AC-11. Declared on the model so the migration creates it; drawn with
        // NEXT VALUE FOR by SequenceTicketNumberGenerator.
        //
        // `AS bigint` explicitly: it is the default for an untyped sequence, but stating it
        // removes the question — and `int` would cap at 2.1 billion for no saving. No MAXVALUE
        // and no CYCLE: a cycling sequence eventually hands out a number the unique index
        // already holds, and that failure arrives years later with no clue why.
        modelBuilder.HasSequence<long>("TicketNumberSeq", "dbo")
            .StartsAt(1)
            .IncrementsBy(1);

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
