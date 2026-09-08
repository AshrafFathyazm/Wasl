using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.EscalateTicket;

/// <summary>
/// Steps 4 and 6 of the contract's fixed order; the entity owns BR-3.3 and BR-3.4. `016`.
/// </summary>
/// <remarks>
/// <para>
/// The contract fixes which refusal wins when a request breaks more than one rule, and the order
/// is distributed on purpose:
/// </para>
/// <code>
/// 400  malformed body / validation     the pipeline, before this runs
/// 403  role policy                     the ENDPOINT — before the ticket is looked up
/// 404  ticket not found                here
/// 409  ticket-not-escalatable          Ticket.Escalate, BR-3.3
/// 409  already-escalated               Ticket.Escalate, BR-3.4
/// 409  concurrency-conflict            here, BEFORE the entity's rules
/// </code>
/// <para>
/// <b>The `403` is ahead of the `404` deliberately, and that is a disclosure decision rather than
/// an accident of framework ordering.</b> An Agent probing ids gets `403` for every one of them,
/// so the endpoint tells them nothing about which tickets exist. The contract states it: *"also
/// returned for an unknown ticket id when the caller is an Agent"*.
/// </para>
/// <para>
/// <b>The version check is before the state rules</b>, matching `012`. A stale client's escalation
/// would otherwise be judged against a state it never saw, and the `409` would name a condition
/// the user cannot reconcile with their screen. "Reload" is true and actionable; "this ticket is
/// resolved" is neither, when their copy says otherwise.
/// </para>
/// </remarks>
internal sealed class EscalateTicketCommandHandler(
    IApplicationDbContext context,
    ICurrentUser currentUser,
    IRequestTimestamp timestamp) : IRequestHandler<EscalateTicketCommand, CreateTicketResult>
{
    public async Task<CreateTicketResult> Handle(
        EscalateTicketCommand request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var ticket = await context.FirstOrDefaultAsync(
            context.Tickets.Where(candidate => candidate.Id == request.TicketId),
            cancellationToken);

        if (ticket is null)
        {
            throw new NotFoundException("Error.Ticket.NotFound");
        }

        if (!VersionMatches(ticket, request.ExpectedVersion))
        {
            throw new ConcurrencyConflictException();
        }

        /* BR-3.2's identity, from the token and nowhere else.
         *
         * The ROLE was already enforced by the endpoint's ManagerOnly policy — `016` is the first
         * production consumer of it, which `CLAUDE.md` records as still missing until now. What is
         * needed here is the actor's ID for BR-3.7, and `004` is explicit that no gap is ever
         * filled with a fake actor: ADR-005 rejects a seeded "system" user by name.
         *
         * Guid.Empty cannot reach here — the fallback policy plus ManagerOnly means an
         * unauthenticated or non-Manager caller is refused before any handler runs — and the FK on
         * EscalatedByUserId would refuse it loudly if it ever did. */
        var escalatedBy = currentUser.UserId
            ?? throw new InvalidOperationException(
                "EscalateTicketCommandHandler ran with no authenticated user. The endpoint's "
                + "ManagerOnly policy and the fallback authentication policy both have to have "
                + "been bypassed for this to happen.");

        // BR-3.3, BR-3.4, BR-3.6, BR-3.7 and BR-3.8's rows — all inside the entity, so the rules
        // have one implementation and this handler cannot get their order wrong on its own. One
        // row or two: the PriorityChanged row exists only when the floor actually moved.
        var history = ticket.Escalate(
            request.Reason, escalatedBy, timestamp.UtcNow.UtcDateTime);

        foreach (var entry in history)
        {
            context.Add(entry);
        }

        await context.SaveChangesAsync(cancellationToken);

        /* THE SAME READ SHAPE THE CREATE AND THE READ RETURN — so `allowedTransitions`,
         * `priority`, `isEscalated`, `escalatedBy` and `canEscalate` all come back recomputed for
         * the NEW state. The client never derives its next actions from the set it just used, and
         * `canEscalate` is now `false` because the ticket it just escalated is no longer
         * escalatable.
         *
         * This handler used to assemble the body itself and passed `callerIsManager: true` — on
         * the argument that the ManagerOnly policy had already proven it, and that two readers of
         * the role are two things that can disagree. The argument was right about the risk and
         * now points the other way: with `TicketDetailReader` there is exactly ONE reader, so
         * deriving it is what keeps the four endpoints agreeing. It still evaluates to `true`
         * here, for the same reason the literal did — a non-Manager cannot reach this line.
         *
         * It also passed no `tags`, so this endpoint answered `tags: []` on a tagged ticket. One
         * of the eleven missing fields `016` measured across `Map`'s five call sites. */
        return await TicketDetailReader.ReadAsync(context, currentUser, ticket, cancellationToken);
    }

    /// <summary>
    /// Compares the caller's token with the row's.
    /// </summary>
    /// <remarks>
    /// An explicit comparison rather than catching <c>DbUpdateConcurrencyException</c> — that
    /// exception surfaces only after the write is attempted, which would put the version check
    /// AFTER the state rules and invert the contract's order.
    /// </remarks>
    private static bool VersionMatches(Ticket ticket, string expectedVersion) =>
        ticket.RowVersion.AsSpan().SequenceEqual(Convert.FromBase64String(expectedVersion));
}
