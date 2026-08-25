using Wasl.Domain.Customers;

namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// The Application layer's view of persistence. Declared here, implemented by
/// <c>Wasl.Infrastructure.Persistence.WaslDbContext</c>.
/// </summary>
/// <remarks>
/// <para>
/// This interface exists to keep EF Core out of <c>Wasl.Application</c>, which is what
/// the architecture test in AC-7 enforces. It is deliberately NOT a repository: there is
/// no method per query, and no interface per aggregate. A handler composes its own query
/// with LINQ at the call site, where the query's intent is.
/// </para>
/// <para>
/// The collections are <see cref="IQueryable{T}"/> rather than EF Core's
/// <c>DbSet&lt;T&gt;</c> for one reason: <c>DbSet&lt;T&gt;</c> is a type in
/// <c>Microsoft.EntityFrameworkCore</c>, and naming it here would put the ORM in this
/// project's dependency graph. <see cref="IQueryable{T}"/> and every composition
/// operator over it — <c>Where</c>, <c>Select</c>, <c>OrderBy</c>, <c>Skip</c>,
/// <c>Take</c> — are BCL types in <c>System.Linq</c>.
/// </para>
/// <para>
/// There is no <c>Update</c> method and that is not an omission. An entity loaded through
/// this context is tracked, so mutating it and calling
/// <see cref="SaveChangesAsync"/> is the update.
/// </para>
/// <para>
/// <b>Async materialisation is not here yet.</b> <c>ToListAsync</c>,
/// <c>FirstOrDefaultAsync</c>, and <c>AnyAsync</c> are extension methods in
/// <c>Microsoft.EntityFrameworkCore</c>, so a handler cannot await a query without
/// either that package or an abstraction over it. Feature 001 has no handler and
/// therefore no consumer, and the constitution forbids an abstraction with none. The
/// first feature that queries — 007 — declares it, with its shape decided against a
/// real call site rather than an imagined one.
/// </para>
/// </remarks>
public interface IApplicationDbContext
{
    IQueryable<Customer> Customers { get; }

    void Add<TEntity>(TEntity entity)
        where TEntity : class;

    void Remove<TEntity>(TEntity entity)
        where TEntity : class;

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
