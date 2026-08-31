using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Application.Features.Tickets.Tags;
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
                    candidate.Id, candidate.FullName, candidate.Email, candidate.CompanyName)),
            cancellationToken);

        // A ticket whose customer is gone. There is no delete in this release and the foreign
        // key is NO ACTION, so it should be unreachable — but returning 404 for the ticket
        // would be wrong (the ticket exists) and dereferencing null would be a 500. The
        // customer's own id is the honest minimum.
        customer ??= new TicketCustomerSummary(ticket.CustomerId, string.Empty, null, null);

        // A third read, and it is the one this handler was missing.
        //
        // `Map` takes an `assignee` parameter that DEFAULTS TO NULL, which is correct for a
        // create — `009` AC-2 says a ticket is never assigned at creation — and
        // AssignTicketCommandHandler passes it. This caller did not, so a read of an assigned
        // ticket returned the id with no name for three days after `004` created the table.
        //
        // **The write path was always right, which is what made it invisible:** assign a ticket
        // and the response names the assignee; reload the same ticket and it says unassigned. An
        // action that succeeded looks undone, in the chapter `011` exists to demonstrate — and
        // `026` §5 forbids the client papering over it, because a screen may not render a ticket
        // from a write response.
        //
        // Not a join in the projection: this handler deliberately does two reads and one shared
        // mapping, so the create and the read stay byte-identical (`007` AC-14). A third read
        // keeps that; a projection here would be the second mapping the contract forbids.
        TicketAssignee? assignee = null;

        if (ticket.AssignedToUserId is { } assigneeId)
        {
            assignee = await context.FirstOrDefaultAsync(
                context.SupportUsers
                    .Where(user => user.Id == assigneeId)
                    .Select(user => new TicketAssignee(user.Id, user.FullName, user.Role.ToString())),
                cancellationToken);
        }

        /* `034`'s read half, added 2026-08-31. THE WRITES SHIPPED WITHOUT IT: attach and
         * detach existed and this response carried no `tags`, so a client could change tags it
         * could not display. Same shape as the defect that left `assigneeName` null on every
         * list row for three days — a write path proven and a read path nobody drove.
         *
         * `TicketTagReader` is reused rather than re-queried: it already joins in the projection
         * for the attach/detach responses, so there is one query and one ordering. A second
         * copy here would be a second thing to keep in step, and `010` AC-12's counter is what
         * would eventually notice. */
        var tags = await TicketTagReader.ReadAsync(context, ticket, cancellationToken);

        return CreateTicketCommandHandler.Map(ticket, customer, assignee, tags.Tags);
    }
}
