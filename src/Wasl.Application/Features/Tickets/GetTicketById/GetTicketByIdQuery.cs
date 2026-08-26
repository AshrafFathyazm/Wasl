using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Application.Features.Tickets.GetTicketById;

/// <summary>
/// <c>GET /api/tickets/{id}</c>. Moved into `009` from `010` because the frozen contract
/// promises the `201`'s <c>Location</c> resolves.
/// </summary>
/// <remarks>
/// <para>
/// <b>Not an <c>ICommand</c>, deliberately.</b> That is what keeps it out of a transaction and
/// out of the audit path — `003`'s behaviours are constrained on the marker, so a query is never
/// wrapped by either (AC-16, `spec.md` Q-2). Reads are not audited.
/// </para>
/// <para>
/// Scope is exactly the `201`'s resource and nothing else: no timeline, no comments, no extra
/// include. `010` widens it.
/// </para>
/// </remarks>
public sealed record GetTicketByIdQuery(Guid Id) : IRequest<CreateTicketResult>;

