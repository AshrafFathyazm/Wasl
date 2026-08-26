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
public sealed record GetTicketsQuery(int? Page = null, int? PageSize = null)
    : IRequest<PagedResult<TicketListItem>>;
