using MediatR;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Application.Features.Customers.GetCustomerCompanies;

/// <summary>
/// <c>GET /api/customers/companies</c>. `033` §5.3 — new with that feature.
/// </summary>
/// <remarks>
/// <para>
/// <b>The filter panel needs the list of companies to offer and nothing returned it.</b> The
/// canvas filters a hard-coded array of six in the browser; with 137 customers that would fit,
/// and the mechanism has to be the one that still works at ten thousand. A client-side filter
/// over a truncated list silently hides companies that exist.
/// </para>
/// <para>
/// <b>One file for the query, the result and the handler</b>, which is what
/// <c>GetCannedRepliesQuery</c> established for a read this small. A folder per use case is the
/// rule (`CLAUDE.md`); three files inside it for eighty lines is not.
/// </para>
/// <para>
/// <b>Not an <c>ICommand</c></b>, so no transaction and no audit row — structural since `003`.
/// </para>
/// </remarks>
/// <param name="Search">
/// Case-insensitive substring, the same provider-escaped <c>Contains</c> the list uses. Trimmed;
/// whitespace-only is absent.
/// </param>
/// <param name="Limit">Default 50, clamped to 100. BR-7.2's clamp-never-reject.</param>
public sealed record GetCustomerCompaniesQuery(string? Search = null, int? Limit = null)
    : IRequest<CustomerCompanies>
{
    internal const int DefaultLimit = 50;
    internal const int MaxLimit = 100;

    internal string? EffectiveSearch =>
        string.IsNullOrWhiteSpace(Search) ? null : Search.Trim();

    /// <summary>
    /// Clamped, never rejected — <c>?limit=5000</c> has an obvious nearest legal value, which is
    /// the distinction §5.5 draws against <c>?sort=email</c>.
    /// </summary>
    internal int EffectiveLimit => Limit is null or < 1
        ? DefaultLimit
        : Math.Min(Limit.Value, MaxLimit);
}

/// <summary>The companies to offer, and whether to offer the "no company" row at all.</summary>
/// <param name="Items">
/// Distinct non-null company names of ACTIVE customers, ordered ascending, capped at the limit.
/// </param>
/// <param name="HasUncompanied">
/// Whether any active customer has no company. <b>So the panel offers that row only when it
/// would match something</b> — the alternative is a checkbox that always returns nothing.
/// </param>
public sealed record CustomerCompanies(IReadOnlyList<string> Items, bool HasUncompanied);

internal sealed class GetCustomerCompaniesQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetCustomerCompaniesQuery, CustomerCompanies>
{
    public async Task<CustomerCompanies> Handle(
        GetCustomerCompaniesQuery request,
        CancellationToken cancellationToken)
    {
        /* `IsActive` IS FILTERED HERE TOO, AND ITS ABSENCE WOULD BE INVISIBLE.
         *
         * A deactivated customer's company would appear in the panel and then match zero rows —
         * a filter that returns nothing, on a name the UI itself offered. The list endpoint has
         * filtered on `IsActive` since `008` Q-1, and the two must agree or the panel lies.
         * §5.3 says so in words; this is the line that makes it true. */
        var active = context.Customers.Where(customer => customer.IsActive);

        var named = active.Where(customer => customer.CompanyName != null);

        var search = request.EffectiveSearch;
        if (search is not null)
        {
            /* The same `Contains` the list uses, and EF Core escapes the term itself —
             * `008` measured that a hand-written escaper double-escapes and makes any value
             * containing a backslash unfindable, which the obvious test cannot see. */
            named = named.Where(customer => customer.CompanyName!.Contains(search));
        }

        var items = await context.ToListAsync(
            named
                .Select(customer => customer.CompanyName!)
                .Distinct()
                .OrderBy(company => company)
                .Take(request.EffectiveLimit),
            cancellationToken);

        /* TWO ROUND TRIPS, AND THE SECOND ONE IS NOT THE LIST AGAIN.
         *
         * `hasUncompanied` cannot be derived from `items` — the cap means an absent name may
         * exist beyond it, and a null company is not in `items` by construction. `AnyAsync` is
         * a cheap EXISTS, and its cost does not grow with the cap: asserted with
         * `CountQueries()` rather than argued, because `008` built that probe for exactly this
         * kind of claim. */
        var hasUncompanied = await context.AnyAsync(
            active.Where(customer => customer.CompanyName == null),
            cancellationToken);

        return new CustomerCompanies(items, hasUncompanied);
    }
}
