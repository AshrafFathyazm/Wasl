using Wasl.Domain.Customers;
using Wasl.Domain.Tickets;
using Wasl.Domain.Users;

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
/// <b>Async materialisation arrived with `009`.</b> <c>ToListAsync</c>,
/// <c>FirstOrDefaultAsync</c>, and <c>AnyAsync</c> are extension methods in
/// <c>Microsoft.EntityFrameworkCore</c>, so a handler cannot await a query without either
/// that package or an abstraction over it. Feature 001 had no handler and therefore no
/// consumer, and the constitution forbids an abstraction with none — so it was left to the
/// first feature that queries. That was named as 007; 007 is not built and `009` is, so `009`
/// declared it, against its own two call sites. <c>ToListAsync</c> is still absent for the
/// same reason: nothing in `009` lists.
/// </para>
/// </remarks>
public interface IApplicationDbContext
{
    IQueryable<Customer> Customers { get; }

    /// <summary>Added by `009`, which creates the table.</summary>
    IQueryable<Ticket> Tickets { get; }

    /// <summary>Added by `004`, which creates the table. Read at sign-in.</summary>
    IQueryable<SupportUser> SupportUsers { get; }

    /// <summary>
    /// <c>TicketHistory</c> is deliberately <b>not</b> exposed.
    /// </summary>
    /// <remarks>
    /// `013` reads it for the timeline and will add it then. Writing it is
    /// <c>CreateTicketCommand</c>'s job through <see cref="Add"/>, which needs no
    /// <c>IQueryable</c> — and a handler that can query history is a handler that can start
    /// deriving state from it instead of from the ticket.
    /// </remarks>
    void Add<TEntity>(TEntity entity)
        where TEntity : class;

    void Remove<TEntity>(TEntity entity)
        where TEntity : class;

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);

    // ── Async materialisation, declared by `009` ────────────────────────────────────
    //
    // The remark above reserved this for "the first feature that queries — 007". 007 is not
    // built and 009 is, so 009 declares it — against its own two real call sites rather than
    // an imagined set:
    //
    //   AnyAsync            AC-4, does the customer exist
    //   FirstOrDefaultAsync GET /api/tickets/{id}, and 404 when it does not
    //
    // ToListAsync and CountAsync arrived with `010`, which is the first feature that lists —
    // against its two real call sites: one page of rows, and the total for the envelope.

    /// <summary>
    /// Whether any element matches. Wraps EF Core's extension so the handler need not see it.
    /// </summary>
    Task<bool> AnyAsync<TEntity>(
        IQueryable<TEntity> query,
        CancellationToken cancellationToken);

    /// <summary>
    /// The first element, or <c>null</c>.
    /// </summary>
    /// <remarks>
    /// Returns <c>null</c> rather than throwing, because "not found" is an expected outcome the
    /// caller maps to a `404` — not an exceptional one. <c>SingleOrDefault</c> would be the
    /// stricter choice and it costs a second row read to prove uniqueness the primary key
    /// already guarantees.
    /// </remarks>
    Task<TEntity?> FirstOrDefaultAsync<TEntity>(
        IQueryable<TEntity> query,
        CancellationToken cancellationToken);

    /// <summary>
    /// Materialises one page. Added by `010`.
    /// </summary>
    Task<List<TEntity>> ToListAsync<TEntity>(
        IQueryable<TEntity> query,
        CancellationToken cancellationToken);

    /// <summary>
    /// The total for the paged envelope, counted **before** <c>Skip</c>/<c>Take</c>.
    /// </summary>
    /// <remarks>
    /// A separate round trip rather than a window function, and the cost is accepted: two simple
    /// queries the engine can cache beat one the provider may not translate. What matters is that
    /// the caller counts the <b>unpaged</b> query — counting after <c>Take</c> would return at
    /// most the page size and make <c>totalPages</c> always 1.
    /// </remarks>
    Task<int> CountAsync<TEntity>(
        IQueryable<TEntity> query,
        CancellationToken cancellationToken);
}
