using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Domain.Common.Exceptions;
namespace Wasl.Application.Features.Tickets.GetTicketById;

internal sealed class GetTicketByIdQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetTicketByIdQuery, CreateTicketResult>
{
    public async Task<CreateTicketResult> Handle(
        GetTicketByIdQuery request,
        CancellationToken cancellationToken)
    {
        // Two reads rather than a join projection, and the reason is the shared mapping: the
        // response must be byte-identical to the create's, and `CreateTicketCommandHandler.Map` is
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

        return CreateTicketCommandHandler.Map(ticket, customer);
    }
}
