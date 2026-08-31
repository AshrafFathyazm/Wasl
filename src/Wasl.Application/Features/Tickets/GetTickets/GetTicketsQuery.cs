using MediatR;
using Wasl.Application.Common;

namespace Wasl.Application.Features.Tickets.GetTickets;

/// <summary>
/// <c>GET /api/tickets</c> — one page of the list, newest first. US-006 (read half), BR-7.
/// </summary>
/// <remarks>
/// <para>
/// Not an <c>ICommand</c>, so `003`'s constrained behaviours never wrap it: no transaction, no
/// audit row (`003` AC-16, `spec.md` Q-2 — reads are not audited).
/// </para>
/// <para>
/// <b>No filters and no search</b>, and that is `015`'s scope rather than an omission. The seven
/// filters, the OR-within-a-key rule, and the escaping of <c>%</c> and <c>_</c> in a search term
/// are a feature of their own; shipping half of them would leave a query surface that looks
/// complete and rejects the combinations BR-7.3 promises.
/// </para>
/// <para>
/// Both parameters are nullable so "not supplied" is distinguishable from "supplied as 0" —
/// <see cref="Paging"/> then applies BR-7.2's clamping, which is why they are not defaulted here.
/// </para>
/// </remarks>
/// <param name="CustomerId">
/// Return only this customer's tickets. `034`.
/// </param>
/// <remarks>
/// <para>
/// <b>A parameter on the existing list, not a sub-resource.</b> The v3 ticket-detail design
/// shows the customer's other tickets in the rail, and <c>/api/customers/{id}/tickets</c> was the
/// obvious shape — it would also be a second list endpoint with its own paging, its own clamping,
/// and its own copy of the projection, which `015` would then have to reconcile when it adds the
/// rest of the filters to the first one.
/// </para>
/// <para>
/// <b>`015` owns filters</b>, and this is one of them arriving early because one screen needs it.
/// It clamps through the same <c>Paging</c> helpers as everything else, so BR-7.2 holds without a
/// second implementation.
/// </para>
/// </remarks>
public sealed record GetTicketsQuery(
    int? Page = null,
    int? PageSize = null,
    Guid? CustomerId = null)
    : IRequest<PagedResult<TicketListItem>>;
