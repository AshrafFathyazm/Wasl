using MediatR;
using Wasl.Application.Common;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Customers;

namespace Wasl.Application.Features.Customers.GetCustomers;

/// <summary>
/// The customer directory. `008` AC-4 to AC-11, AC-15, AC-17.
/// </summary>
internal sealed class GetCustomersQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetCustomersQuery, PagedResult<CustomerListItem>>
{
    public async Task<PagedResult<CustomerListItem>> Handle(
        GetCustomersQuery request,
        CancellationToken cancellationToken)
    {
        var filtered = Filter(context.Customers, request.EffectiveSearch);

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
                .OrderBy(customer => customer.FullName)
                .ThenBy(customer => customer.Id)
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
    private static IQueryable<Customer> Filter(IQueryable<Customer> customers, string? search)
    {
        // Q-1. Ships now even though nothing can be inactive until `007` builds the factory:
        // adding it later would silently change results for anyone who had built a habit on them.
        customers = customers.Where(customer => customer.IsActive);

        if (search is null)
        {
            return customers;
        }

        return customers.Where(customer =>
            customer.FullName.Contains(search)
            || (customer.Email != null && customer.Email.Contains(search))
            || (customer.PhoneE164 != null && customer.PhoneE164.Contains(search)));
    }
}
