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

    /* `016`. NOT for a permission check — step 4 below is still `004`'s and still absent. This is
     * for `canEscalate` in the response, which is half a fact about the ticket and half a fact
     * about who is asking (BR-3.2). */
    ICurrentUser currentUser,
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

        /* AC-23. The same read shape the create and the read return, so allowedTransitions comes
         * back recomputed for the NEW status — the client never derives its next actions from the
         * set it just used.
         *
         * THIS CALL WAS THE WORST OF THE FIVE, and `016` found it while adding a field to `Map`.
         * It passed the ticket and the customer and nothing else, so `PUT /status` on an assigned,
         * tagged ticket answered `assignedToUserId` populated with `assignee: null`, `tags: []`,
         * and — once `016` landed — `canEscalate: false` for a Manager. The contract has said
         * since `012` that this body "is `TicketDetailResponse`, owned by `010`", so all three
         * were contract violations, not omissions.
         *
         * Invisible for three features because `026` §5 forbids a screen rendering a ticket from
         * a write response: the client refetches, the wrong body is never displayed, and every
         * test asserting the status transition passes. */
        return await TicketDetailReader.ReadAsync(context, currentUser, ticket, cancellationToken);
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
