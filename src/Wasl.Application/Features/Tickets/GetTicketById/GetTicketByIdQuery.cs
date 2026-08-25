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

internal sealed class GetTicketByIdHandler(IApplicationDbContext context)
    : IRequestHandler<GetTicketByIdQuery, CreateTicketResult>
{
    public async Task<CreateTicketResult> Handle(
        GetTicketByIdQuery request,
        CancellationToken cancellationToken)
    {
        // Two reads rather than a join projection, and the reason is the shared mapping: the
        // response must be byte-identical to the create's, and `CreateTicketHandler.Map` is
        // what guarantees that. Projecting into the DTO here would be a second mapping, which
        // is the thing the contract's "returns the same resource" forbids.
        var ticket = await context.FirstOrDefaultAsync(
            context.Tickets.Where(candidate => candidate.Id == request.Id),
            cancellationToken);

        if (ticket is null)
        {
            throw new NotFoundException("Error.Ticket.NotFound");
        }

        var customer = await context.FirstOrDefaultAsync(
            context.Customers
                .Where(candidate => candidate.Id == ticket.CustomerId)
                .Select(candidate => new TicketCustomerSummary(
                    candidate.Id, candidate.FullName, candidate.Email)),
            cancellationToken);

        // A ticket whose customer is gone. There is no delete in this release and the foreign
        // key is NO ACTION, so it should be unreachable — but returning 404 for the ticket
        // would be wrong (the ticket exists) and dereferencing null would be a 500. The
        // customer's own id is the honest minimum.
        customer ??= new TicketCustomerSummary(ticket.CustomerId, string.Empty, null);

        return CreateTicketHandler.Map(ticket, customer);
    }
}
