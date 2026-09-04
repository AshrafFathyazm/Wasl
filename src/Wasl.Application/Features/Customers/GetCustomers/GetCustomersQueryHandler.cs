using MediatR;
using Wasl.Application.Common;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Customers;

namespace Wasl.Application.Features.Customers.GetCustomers;

/// <summary>
/// The customer directory. `008` AC-4 to AC-11, AC-15, AC-17.
/// </summary>
/// <summary>
/// The ordering, in one place, so no branch can forget the tiebreak. `033` §5.1.
/// </summary>
/// <remarks>
/// <para>
/// <b>EVERY branch ends <c>ThenBy(Id)</c>, and it is not decoration.</b> `008` AC-15 explains
/// the name case: two customers sharing a name is the ordinary case in this domain (BR-4.6), and
/// <c>OFFSET</c>/<c>FETCH</c> over a non-total order promises nothing — a full traversal can show
/// one row twice and skip another.
/// </para>
/// <para>
/// <b><c>createdAtUtc</c> makes ties LIKELY rather than possible</b>, which changes what has to
/// be tested: <c>RequestTimestamp</c> truncates to <c>datetime2(3)</c> and <c>--seed</c> writes
/// many customers inside one request, so equal timestamps are the norm. `013` measured that a
/// repeatability test proves nothing here — it deleted its tiebreak and the test still passed,
/// because SQL Server agreed with itself twice over nine rows. The tests that can fail are an
/// assertion that a tie EXISTS and an assertion about a SPECIFIC order across two pages.
/// </para>
/// <para>
/// <b>A switch expression rather than a dictionary of lambdas.</b> The compiler then refuses to
/// build if a member is added to <see cref="CustomerSort"/> without an ordering — a dictionary
/// would throw at runtime on the request that used it, which is a `500` for a `400`'s job.
/// </para>
/// </remarks>
internal static class CustomerOrdering
{
    internal static IOrderedQueryable<Customer> OrderByRequest(
        this IQueryable<Customer> customers,
        GetCustomersQuery request) =>
        (request.EffectiveSort, request.EffectiveDir) switch
        {
            (CustomerSort.FullName, SortDirection.Asc) =>
                customers.OrderBy(customer => customer.FullName).ThenBy(customer => customer.Id),
            (CustomerSort.FullName, SortDirection.Desc) =>
                customers.OrderByDescending(customer => customer.FullName).ThenBy(customer => customer.Id),
            (CustomerSort.CreatedAtUtc, SortDirection.Asc) =>
                customers.OrderBy(customer => customer.CreatedAtUtc).ThenBy(customer => customer.Id),
            (CustomerSort.CreatedAtUtc, SortDirection.Desc) =>
                customers.OrderByDescending(customer => customer.CreatedAtUtc).ThenBy(customer => customer.Id),

            /* Unreachable: the validator refuses an unknown value (§5.5) and both enums are
             * closed. Present so the switch is exhaustive without a default that would silently
             * absorb a member added later. */
            _ => customers.OrderBy(customer => customer.FullName).ThenBy(customer => customer.Id),
        };
}

internal sealed class GetCustomersQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetCustomersQuery, PagedResult<CustomerListItem>>
{
    public async Task<PagedResult<CustomerListItem>> Handle(
        GetCustomersQuery request,
        CancellationToken cancellationToken)
    {
        var filtered = Filter(context.Customers, request);

        // AC-9, AC-10. Counted before paging, so a page beyond the last still reports the real
        // total — which is what lets the client correct itself rather than concluding the search
        // found nothing.
        var totalCount = await context.CountAsync(filtered, cancellationToken);

        var items = await context.ToListAsync(
            filtered

                // AC-15. FullName then Id, and the Id is not decoration: two customers sharing a
                // name is the ordinary case in this domain, and without a total order SQL Server
                // promises nothing for the tie — so a full traversal can show one row twice and
                // another not at all. `013` proved this class of guard is real by deleting one and
                // watching a test go red; `010` could not, and recorded its own as unproven.
                // `033` §5.1. The ordering is a switch now, and EVERY branch ends ThenBy(Id).
                .OrderByRequest(request)
                .Skip((request.EffectivePage - 1) * request.EffectivePageSize)
                .Take(request.EffectivePageSize)

                // AC-11 and AC-17 in one line. Projected in the query, so this is ONE round trip
                // for the page and no column outside the contract is even in the SELECT list —
                // `notes` cannot leak through a serializer that was never handed it.
                .Select(customer => new CustomerListItem(
                    customer.Id,
                    customer.FullName,
                    customer.Email,
                    customer.PhoneE164,
                    customer.CompanyName,
                    customer.CreatedAtUtc)),
            cancellationToken);

        return new PagedResult<CustomerListItem>(
            items, request.EffectivePage, request.EffectivePageSize, totalCount);
    }

    /// <summary>
    /// Q-1's active filter and AC-7's search, as one composable step.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Case-insensitivity comes from the columns, not from this method</b> (AC-16). All three
    /// searched columns carry an explicit CI collation as of `008`'s migration — `001` had given
    /// it to <c>Email</c> alone and left the other two inheriting the server default, which made
    /// two thirds of this search case-insensitive by luck. There is deliberately no
    /// <c>ToLower()</c> here: it would be correct, non-sargable, and would hide the fact that the
    /// schema is what guarantees it.
    /// </para>
    /// <para>
    /// <b><c>Contains</c>, with no hand-rolled escaping — and that is a MEASURED decision that
    /// reversed the one this feature's `research.md` R-2 assumed</b> (AC-8).
    /// </para>
    /// <para>
    /// R-2 states that <c>Contains</c> translates to <c>LIKE '%' + @p + '%'</c> without escaping
    /// the term, so a search for <c>100%</c> would match everything. The first implementation
    /// therefore used <c>EF.Functions.Like</c> with a hand-written escaper — which does not compile
    /// here at all, because <c>Wasl.Application</c> cannot see EF Core and the architecture test
    /// says so. That refusal is what forced the question to be measured instead of assumed.
    /// </para>
    /// <para>
    /// What EF Core 10 on SQL Server actually emits, read from the command log of a running
    /// instance:
    /// <code>
    /// WHERE [c].[IsActive] = CAST(1 AS bit)
    ///   AND ([c].[FullName] LIKE @search_contains ESCAPE N'\'
    ///        OR ([c].[Email] IS NOT NULL AND [c].[Email] LIKE @search_contains0 ESCAPE N'\')
    ///        OR ([c].[PhoneE164] IS NOT NULL AND [c].[PhoneE164] LIKE @search_contains1 ESCAPE N'\'))
    /// </code>
    /// The provider builds the pattern <b>and escapes the term</b>, declaring its own
    /// <c>ESCAPE</c> clause. Confirmed behaviourally before the SQL was read: a search for
    /// <c>%</c> against three customers returned <b>0</b>, not 3.
    /// </para>
    /// <para>
    /// <b>So the hand-rolled escaper would have double-escaped</b> — a customer whose name contains
    /// a backslash or a bracket would have become unfindable, and the AC-8 test would have passed
    /// because it only checks that <c>100%</c> matches nothing. AC-8's test now pins the
    /// provider's behaviour, which is the thing that could change under an upgrade.
    /// </para>
    /// </remarks>
    private static IQueryable<Customer> Filter(IQueryable<Customer> customers, GetCustomersQuery request)
    {
        // Q-1. Ships now even though nothing can be inactive until `007` builds the factory:
        // adding it later would silently change results for anyone who had built a habit on them.
        customers = customers.Where(customer => customer.IsActive);

        var search = request.EffectiveSearch;
        if (search is not null)
        {
            customers = customers.Where(customer =>
                customer.FullName.Contains(search)
                || (customer.Email != null && customer.Email.Contains(search))
                || (customer.PhoneE164 != null && customer.PhoneE164.Contains(search)));
        }

        /* `033` §5.2. AND ACROSS KEYS, OR WITHIN ONE — BR-7.3/7.4, and the same shape `015`
         * built for tickets.
         *
         * `company` and `noCompany` are ONE key for that purpose: "Acme or none" is one
         * question about one column, so they are OR-ed with each other and AND-ed with
         * everything else. Two separate Where clauses would make them exclusive and the pair
         * unsatisfiable.
         *
         * THE MATCH IS EXACT AND CASE-INSENSITIVE, and the case-insensitivity comes from the
         * COLUMN: `008` gave CompanyName an explicit SQL_Latin1_General_CP1_CI_AS when it found
         * `001` had given one to Email alone. A `.ToLower()` here would be a second answer to
         * the same question and would forfeit any index the column ever gets. */
        var companies = request.EffectiveCompany;
        var noCompany = request.EffectiveNoCompany;

        if (companies.Count > 0 && noCompany)
        {
            customers = customers.Where(customer =>
                customer.CompanyName == null || companies.Contains(customer.CompanyName));
        }
        else if (companies.Count > 0)
        {
            customers = customers.Where(customer =>
                customer.CompanyName != null && companies.Contains(customer.CompanyName));
        }
        else if (noCompany)
        {
            customers = customers.Where(customer => customer.CompanyName == null);
        }

        /* `033` §5.4. Inclusive at both ends, and the upper bound is the one that fails quietly:
         * `<= createdTo` parsed as a date is `<= 00:00:00` on that day, which excludes every
         * customer created during it. The filter looks correct, returns rows, and drops exactly
         * the newest day — the one a user filtering "to today" is asking about.
         *
         * An INVERTED range needs no branch: `>= from` and `< to + 1` are simply unsatisfiable
         * together, so the empty page §5.4 rules falls out of the same two comparisons. */
        if (request.EffectiveCreatedFrom is { } from)
        {
            var fromUtc = from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            customers = customers.Where(customer => customer.CreatedAtUtc >= fromUtc);
        }

        if (request.EffectiveCreatedTo is { } to)
        {
            var exclusiveUtc = to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            customers = customers.Where(customer => customer.CreatedAtUtc < exclusiveUtc);
        }

        return customers;
    }
}
