using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Tickets;
using Wasl.Domain.Users;

namespace Wasl.Application.Features.Tickets.AssignTicket;

/// <summary>
/// BR-2, in the order `contracts/ticket-assignee-api.md` froze. `011`.
/// </summary>
/// <remarks>
/// <para>
/// <b>This handler is where BR-6's data-dependent half lives, and that placement has a measurable
/// consequence rather than being a matter of taste.</b> A <see cref="ForbiddenException"/> thrown
/// here passes through `003`'s <c>AuditBehaviour</c>, which classifies it as
/// <c>AuditOutcome.Denied</c> and writes an independent audit row — outside the transaction, so it
/// survives the rollback of the write it refused. A `403` produced by an authorization policy
/// throws nothing, MediatR never sees it, and no row is written at all (`004` AC-18, still open).
/// So the same refusal is either recorded or invisible depending only on where the check was put.
/// AC-17 asserts the row.
/// </para>
/// <para>
/// <b>The order of the checks is the contract's, and it is fixed there rather than here for a
/// reason:</b> several failures can apply to one request, a test asserting "not 200" passes
/// against the wrong reason, and a client that branches on the first failure it was shown gets a
/// different answer on a retry.
/// </para>
/// </remarks>
internal sealed class AssignTicketCommandHandler(
    IApplicationDbContext context,
    ICurrentUser currentUser,
    IRequestTimestamp timestamp) : IRequestHandler<AssignTicketCommand, CreateTicketResult>
{
    public async Task<CreateTicketResult> Handle(
        AssignTicketCommand request,
        CancellationToken cancellationToken)
    {
        // Step 3.
        var ticket = await context.FirstOrDefaultAsync(
            context.Tickets.Where(candidate => candidate.Id == request.TicketId),
            cancellationToken);

        if (ticket is null)
        {
            throw new NotFoundException("Error.Ticket.NotFound");
        }

        // Step 4, BEFORE the permission decision. The permission rules read the ticket's CURRENT
        // assignee; with a stale version the client is looking at a different assignee than the
        // server is, so a 403 computed here could be wrong and the client would have no way to
        // tell. A 409 sends it back for the truth first. `research.md` R-6.
        //
        // Unlike `012`, this check is NOT skipped for a Closed ticket. `012` skipped it because a
        // closed ticket does not become un-closed by reloading, so "this ticket is finished" was
        // the more useful answer. Here the Closed check sits at step 8, after permission — so
        // skipping the version check would move the permission decision ahead of it onto data the
        // client has not seen, which is the thing this ordering exists to prevent.
        if (!VersionMatches(ticket, request.ExpectedVersion))
        {
            throw new ConcurrencyConflictException();
        }

        // Step 5. BR-2.1 – BR-2.3.
        EnsurePermitted(ticket, request.AssigneeId);

        // Steps 6 and 7. Skipped entirely when unassigning: there is no target to look up, and
        // BR-2.4 governs who may RECEIVE a ticket. Reading it as "an unassign requires an active
        // user" would make a departed agent's tickets impossible to hand back.
        TicketAssignee? assignee = null;

        if (request.AssigneeId is { } assigneeId)
        {
            assignee = await LoadAssigneeAsync(assigneeId, cancellationToken);
        }

        // Steps 8 and 9, inside the entity — BR-2.5 and AC-11 hold for every caller, so the rule
        // has one implementation and this handler cannot get their order wrong on its own.
        var history = ticket.Assign(request.AssigneeId, timestamp.UtcNow.UtcDateTime);

        context.Add(history);

        // Step 10. One SaveChanges for the ticket and its history row, inside the transaction
        // `TransactionBehaviour` opened — so a ticket cannot change owner without the history row
        // that explains it. EF re-checks the rowversion against the row it is updating here, which
        // catches a writer that arrived between the explicit check above and this line.
        await context.SaveChangesAsync(cancellationToken);

        var customer = await context.FirstOrDefaultAsync(
            context.Customers
                .Where(candidate => candidate.Id == ticket.CustomerId)
                .Select(candidate => new TicketCustomerSummary(
                    candidate.Id, candidate.FullName, candidate.Email, candidate.CompanyName)),
            cancellationToken);

        // AC-16. The same mapping every ticket endpoint uses, so allowedTransitions comes back
        // recomputed — and it CHANGES here even though the status did not, because BR-1.3 makes
        // InProgress conditional on having an assignee.
        return CreateTicketCommandHandler.Map(
            ticket,
            customer ?? new TicketCustomerSummary(ticket.CustomerId, string.Empty, null, null),
            assignee);
    }

    /// <summary>
    /// BR-2.1, BR-2.2, BR-2.3 — the whole role-dependent half of BR-2.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The endpoint carries no role policy, and it cannot.</b> <c>ManagerOnly</c> there would
    /// refuse every Agent, and BR-2.2 makes an Agent self-assigning unowned work legitimate. So
    /// the role is read here, from the token, alongside the two things a policy could never see:
    /// the request's target and the ticket's current owner.
    /// </para>
    /// <para>
    /// <b>A Manager passes unconditionally (BR-2.1)</b> — including assigning to themselves, which
    /// the edge-case register allows because a manager is also an agent in practice.
    /// </para>
    /// </remarks>
    private void EnsurePermitted(Ticket ticket, Guid? assigneeId)
    {
        // Not null after `004`: the fallback policy is RequireAuthenticatedUser, so an
        // unauthenticated request never reaches a handler. Read defensively anyway, because the
        // alternative to a thrown 403 here would be a silent `false` on both comparisons below —
        // and BR-2 failing open is the one outcome worse than failing loudly.
        var callerId = currentUser.UserId;

        if (callerId is null)
        {
            throw new ForbiddenException("Error.Ticket.AssignNotPermitted");
        }

        if (string.Equals(currentUser.Role, nameof(SupportRole.Manager), StringComparison.Ordinal))
        {
            return;
        }

        // BR-2.3. An Agent may not touch a ticket that belongs to someone else — and `null` is a
        // target like any other, so taking someone's ownership away is a reassignment, not an
        // exception to the rule. An Agent unassigning THEMSELVES is permitted and reaches the
        // BR-2.2 check below, where the target is null and the caller already owns the ticket.
        if (ticket.AssignedToUserId is { } current && current != callerId)
        {
            throw new ForbiddenException("Error.Ticket.AssignNotPermitted");
        }

        // BR-2.2. An Agent's only legal target is themselves — or null, which is the unassign of
        // a ticket the check above has already established they own.
        if (assigneeId is { } target && target != callerId)
        {
            throw new ForbiddenException("Error.Ticket.AssignNotPermitted");
        }
    }

    /// <summary>
    /// Steps 6 and 7. BR-2.4, AC-6, AC-7.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>One query, projecting <c>IsActive</c> rather than filtering on it.</b> Filtering would
    /// collapse "no such user" and "an inactive user" into the same empty result, and the contract
    /// gives them different answers for a reason the client acts on: a `404` means the picker is
    /// stale and should be refreshed, a `400` means the picker is current and that entry is not
    /// selectable.
    /// </para>
    /// <para>
    /// <b>The foreign key is not the check.</b> <c>FK_Tickets_Assignee</c> would refuse an unknown
    /// id at <c>SaveChanges</c>, but as a <c>DbUpdateException</c> — a `500`, with no field name
    /// and no useful message. And no foreign key can express "active", because a check constraint
    /// cannot reference another table. The FK is the guarantee of last resort; this is the answer.
    /// </para>
    /// </remarks>
    private async Task<TicketAssignee> LoadAssigneeAsync(Guid assigneeId, CancellationToken ct)
    {
        var candidate = await context.FirstOrDefaultAsync(
            context.SupportUsers
                .Where(user => user.Id == assigneeId)
                .Select(user => new
                {
                    user.Id,
                    user.FullName,
                    Role = user.Role.ToString(),
                    user.IsActive,
                }),
            ct);

        if (candidate is null)
        {
            throw new AssigneeNotFoundException();
        }

        if (!candidate.IsActive)
        {
            // A 400 with the error on `assigneeId`, not a 404: the user exists, the request is
            // what is wrong (`spec.md` Q-2). The field name is the machine-readable part — it is
            // what tells the client to put the message on the picker.
            throw new AssigneeInactiveException();
        }

        return new TicketAssignee(candidate.Id, candidate.FullName, candidate.Role);
    }

    private static bool VersionMatches(Ticket ticket, string expectedVersion) =>
        ticket.RowVersion.AsSpan().SequenceEqual(Convert.FromBase64String(expectedVersion));
}
