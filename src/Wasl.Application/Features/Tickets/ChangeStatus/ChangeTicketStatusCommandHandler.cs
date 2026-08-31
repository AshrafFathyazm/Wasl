using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.ChangeStatus;

/// <summary>
/// Steps 2 and 6 of the contract's fixed check order; the entity owns 5 and 7–9.
/// </summary>
/// <remarks>
/// A request can violate more than one rule at once, so the contract fixes which answer wins and
/// a client never has to guess. The order is not distributed by accident: routing rejects a
/// malformed id (1), this handler looks the ticket up (2) and checks the version (6), the pipeline
/// has already validated the body (3), and <c>Ticket.ChangeStatus</c> runs the terminal check and
/// the three BR-1 rules (5, 7–9).
/// </remarks>
internal sealed class ChangeTicketStatusCommandHandler(
    IApplicationDbContext context,
    IRequestTimestamp timestamp) : IRequestHandler<ChangeTicketStatusCommand, CreateTicketResult>
{
    public async Task<CreateTicketResult> Handle(
        ChangeTicketStatusCommand request,
        CancellationToken cancellationToken)
    {
        // Step 2.
        var ticket = await context.FirstOrDefaultAsync(
            context.Tickets.Where(candidate => candidate.Id == request.TicketId),
            cancellationToken);

        if (ticket is null)
        {
            throw new NotFoundException("Error.Ticket.NotFound");
        }

        // Step 4 — authorization (BR-6) — is absent, and it is `004`'s. There is no authenticated
        // identity to compare against an assignee, so AC-14 to AC-16 cannot be evaluated. Named
        // here rather than left as a silent gap: `004` adds the check at this exact point, after
        // the lookup and before the version check.

        // Step 6, BEFORE the transition rules — the ordering the contract calls easiest to get
        // wrong and hardest to notice. A stale client's transition would otherwise be judged
        // against a state it never saw, so the 409 would name a currentStatus the user cannot
        // reconcile with their screen. "Reload" is true and actionable; "that move is forbidden"
        // is neither, and it is not even a rule violation.
        //
        // Skipped when the ticket is Closed, so step 5 keeps its place ahead of this: a closed
        // ticket does not become un-closed by reloading, so "this ticket is finished" is the more
        // useful answer than "your copy is out of date".
        if (ticket.Status is not TicketStatus.Closed && !VersionMatches(ticket, request.ExpectedVersion))
        {
            throw new ConcurrencyConflictException();
        }

        // Steps 5 and 7–9, plus BR-1.2's note rule — all inside the entity, so the rule has one
        // implementation and this handler cannot get their order wrong on its own.
        var history = ticket.ChangeStatus(request.Status, timestamp.UtcNow.UtcDateTime, request.Note);

        context.Add(history);

        await context.SaveChangesAsync(cancellationToken);

        var customer = await context.FirstOrDefaultAsync(
            context.Customers
                .Where(candidate => candidate.Id == ticket.CustomerId)
                .Select(candidate => new TicketCustomerSummary(
                    candidate.Id, candidate.FullName, candidate.Email, candidate.CompanyName)),
            cancellationToken);

        // AC-23. The same mapping the create and the read use, so allowedTransitions comes back
        // recomputed for the NEW status — the client never derives its next actions from the set
        // it just used.
        return CreateTicketCommandHandler.Map(
            ticket, customer ?? new TicketCustomerSummary(ticket.CustomerId, string.Empty, null, null));
    }

    /// <summary>
    /// Compares the caller's token with the row's.
    /// </summary>
    /// <remarks>
    /// An explicit comparison rather than catching <c>DbUpdateConcurrencyException</c>. That
    /// exception only surfaces after the write is attempted, which would put the version check
    /// *after* the transition rules — the exact inversion the contract warns about, where every
    /// stale UI reports a rule violation that does not exist.
    /// </remarks>
    private static bool VersionMatches(Ticket ticket, string expectedVersion) =>
        ticket.RowVersion.AsSpan().SequenceEqual(Convert.FromBase64String(expectedVersion));
}
