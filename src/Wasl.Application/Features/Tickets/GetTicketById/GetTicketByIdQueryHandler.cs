using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Application.Features.Tickets.GetTicketById;

internal sealed class GetTicketByIdQueryHandler(
    IApplicationDbContext context,

    /* `016`. The CALLER, for `canEscalate`. A read handler taking the current user reads oddly
     * until you remember what the field answers: not "is this ticket escalatable" but "may THIS
     * caller escalate it". BR-3.2 is half of that, and the ticket does not know who is asking. */
    ICurrentUser currentUser)
    : IRequestHandler<GetTicketByIdQuery, CreateTicketResult>
{
    public async Task<CreateTicketResult> Handle(
        GetTicketByIdQuery request,
        CancellationToken cancellationToken)
    {
        // Separate reads rather than one join projection, and the reason is the shared mapping:
        // the response must be byte-identical to the create's, and `CreateTicketCommandHandler.Map`
        // is what guarantees that. Projecting into the DTO here would be a second mapping, which
        // is the thing the contract's "returns the same resource" forbids.
        var ticket = await context.FirstOrDefaultAsync(
            context.Tickets.Where(candidate => candidate.Id == request.Id),
            cancellationToken);

        if (ticket is null)
        {
            throw new NotFoundException("Error.Ticket.NotFound");
        }

        /* EVERY OTHER FIELD, through `TicketDetailReader`.
         *
         * This handler used to assemble them inline — customer, the assignee lookup, tags,
         * escalatedBy, the role comparison — and it was the ONLY one of `Map`'s five callers that
         * assembled all of them. `016` measured the other four and found eleven missing fields
         * between them, so the assembly moved out rather than being copied a fifth time.
         *
         * The reasoning that used to sit inline is not lost: why each read is a separate round
         * trip instead of a join (`007` AC-14 — the create and the read must be byte-identical,
         * and a projection here would be a second mapping), why the assignee is read from
         * `ticket.AssignedToUserId` and never derived, and why the escalation lookup is
         * conditional, are all in that file now, next to the code they explain. */
        return await TicketDetailReader.ReadAsync(context, currentUser, ticket, cancellationToken);
    }
}
