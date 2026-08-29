using Wasl.Domain.Common;
using Wasl.Domain.Communications;

namespace Wasl.Domain.Tickets;

/// <summary>
/// One customer problem, from report to resolution. The central entity of the product.
/// </summary>
/// <remarks>
/// <para>
/// Created through <see cref="Create"/> and nothing else. Every later ticket feature —
/// assignment (`011`), status change (`012`), escalation (`016`) — adds its own method rather
/// than a setter, so the entity keeps deciding what may happen to it.
/// </para>
/// <para>
/// <b>Four user columns carry no foreign key</b>, and that is `004`'s to add:
/// <c>dbo.SupportUsers</c> does not exist yet. `data-model.md` records the correction and the
/// reason each one is nullable today.
/// </para>
/// </remarks>
public sealed class Ticket : IAuditableEntity
{
    public const int SubjectMaxLength = 200;
    public const int DescriptionMaxLength = 4000;

    /// <summary>
    /// The longest <c>expectedVersion</c> the API will look at. `004b` AC-38.
    /// </summary>
    /// <remarks>
    /// A SQL Server <c>rowversion</c> is eight bytes, so its base64 form is twelve characters. The
    /// ceiling is generous rather than exact because the token is opaque to the client — but it is
    /// a ceiling, because <c>Convert.TryFromBase64String</c> needs a destination buffer the size of
    /// the INPUT. Without this rule a ten-megabyte string allocated ten megabytes before being
    /// refused, and repeating that costs the server far more than it costs the caller.
    /// </remarks>
    public const int RowVersionTokenMaxLength = 64;

    // EF Core materialises through this. Nothing else should.
    private Ticket()
    {
    }

    public Guid Id { get; private set; }

    /// <summary>
    /// <c>TCK-2026-000042</c>. Unique, and never localized or reformatted (BR-8.13).
    /// </summary>
    public string TicketNumber { get; private set; } = null!;

    /// <summary>
    /// The one customer this ticket belongs to. A ticket cannot be moved between customers
    /// (`spec.md` A-1) — that would need a history event and a feature of its own.
    /// </summary>
    public Guid CustomerId { get; private set; }

    public string Subject { get; private set; } = null!;

    public string Description { get; private set; } = null!;

    public TicketCategory Category { get; private set; }

    public TicketPriority Priority { get; private set; }

    public CommunicationChannel Channel { get; private set; }

    public TicketStatus Status { get; private set; }

    /// <summary>
    /// Null on creation (AC-2, BR-2.7). Triage and ownership are separate decisions, so
    /// creating a ticket never assigns it.
    /// </summary>
    public Guid? AssignedToUserId { get; private set; }

    /// <summary>
    /// Who created it. **Stamped by <c>SaveChangesAsync</c>, never by a handler**, and null
    /// until `004` because there is no authenticated identity to read. Nullable rather than
    /// absent, so the column and the response field keep their shape and `004` only supplies a
    /// value.
    /// </summary>
    public Guid? CreatedByUserId { get; private set; }

    /// <summary>Who last changed it. Stamped on update; null on insert.</summary>
    public Guid? UpdatedByUserId { get; private set; }

    public bool IsEscalated { get; private set; }

    public DateTime? EscalatedAtUtc { get; private set; }

    public Guid? EscalatedByUserId { get; private set; }

    public string? EscalationReason { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    /// <summary>Set by `012` when the ticket closes (BR-1.7).</summary>
    public DateTime? ClosedAtUtc { get; private set; }

    /// <summary>
    /// SQL Server <c>rowversion</c>, maintained by the engine (ADR-006 as amended by ADR-013).
    /// Unused by this feature; `011` and `012` send it back as <c>expectedVersion</c>.
    /// </summary>
    public byte[] RowVersion { get; private set; } = null!;

    /// <summary>
    /// The transitions currently permitted, computed from the BR-1 map and its conditions.
    /// </summary>
    /// <remarks>
    /// <b>Computed, never stored.</b> A persisted copy is a second source of truth that goes
    /// stale the moment the map changes — and it would go stale silently, because nothing
    /// compares a column against a rule. It passes <see cref="AssignedToUserId"/> through,
    /// which is what stops an unassigned <c>Open</c> ticket offering <c>InProgress</c>.
    /// </remarks>
    public IReadOnlyList<TicketStatus> AllowedTransitions =>
        TicketStatusTransitions.AllowedFrom(Status, AssignedToUserId is not null);

    /// <summary>
    /// The only way to create a ticket. Always <see cref="TicketStatus.New"/> and unassigned
    /// (AC-2, BR-1.1).
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Takes neither a clock nor a user.</b> <c>CreatedAtUtc</c>, <c>UpdatedAtUtc</c>,
    /// <c>CreatedByUserId</c> and <c>UpdatedByUserId</c> are stamped by
    /// <c>WaslDbContext.SaveChangesAsync</c> — see <see cref="IAuditableEntity"/> for why they
    /// are not a handler's business. A <c>createdAtUtc</c> parameter here would be a parameter
    /// one caller eventually passes <c>DateTime.UtcNow</c> to.
    /// </para>
    /// <para>
    /// This means the returned ticket has <c>CreatedAtUtc == default</c> until it is saved.
    /// Anything needing the real instant — <c>TicketHistoryEntry</c> does, per AC-9 — reads it
    /// off the entity <b>after</b> the save rather than computing its own.
    /// </para>
    /// </remarks>
    public static Ticket Create(
        Guid customerId,
        string ticketNumber,
        string subject,
        string description,
        TicketCategory category,
        TicketPriority priority,
        CommunicationChannel channel)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ticketNumber);
        ArgumentException.ThrowIfNullOrWhiteSpace(subject);
        ArgumentException.ThrowIfNullOrWhiteSpace(description);

        if (customerId == Guid.Empty)
        {
            throw new ArgumentException("A ticket must belong to a customer.", nameof(customerId));
        }

        return new Ticket
        {
            Id = Guid.CreateVersion7(),
            TicketNumber = ticketNumber,
            CustomerId = customerId,
            Subject = subject.Trim(),
            Description = description.Trim(),
            Category = category,
            Priority = priority,
            Channel = channel,
            Status = TicketStatus.New,
            AssignedToUserId = null,
            IsEscalated = false,

            // No CreatedAtUtc, no UpdatedAtUtc, no CreatedByUserId. WaslDbContext.SaveChangesAsync
            // stamps all four — see IAuditableEntity. Assigning one here would be the second
            // source of truth, and the one that gets it wrong.
        };
    }

    /// <summary>
    /// Moves the ticket to <paramref name="target"/>. BR-1, and the only way the status changes.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The checks run in the order `012`'s frozen contract fixes</b>, because a request can
    /// break more than one rule and a client must never have to guess which answer it gets. The
    /// endpoint owns steps 1–4 and 6 (id, existence, body, authorization, version); this method
    /// owns 5 and 7–9, in that sequence.
    /// </para>
    /// <para>
    /// <b>Closed is checked before same-status</b>, so <c>Closed → Closed</c> reports
    /// <c>ticket-closed</c> rather than <c>same-status-transition</c>: "this ticket is finished"
    /// is more useful than "you sent the value it already has", and no amount of reloading
    /// changes it.
    /// </para>
    /// <para>
    /// <b>Three distinct error codes, not one</b> (`spec.md` Q-3). A same-status <c>409</c> means
    /// refetch quietly — the user double-clicked and did nothing wrong. An assignee-required
    /// <c>409</c> means offer the Assign action. A forbidden-transition <c>409</c> means offer a
    /// different transition. A client cannot separate those by parsing an English sentence.
    /// </para>
    /// <para>
    /// It does <b>not</b> touch <c>UpdatedAtUtc</c>: <c>SaveChangesAsync</c> stamps that for
    /// every <see cref="IAuditableEntity"/>. <c>ClosedAtUtc</c> is different — a business fact
    /// about the ticket rather than row metadata — so it is set here, from the instant passed in.
    /// </para>
    /// </remarks>
    /// <returns>The history row for the accepted transition (AC-11).</returns>
    public TicketHistoryEntry ChangeStatus(TicketStatus target, DateTime occurredAtUtc, string? note = null)
    {
        // 5. Terminal, and first among this method's checks. BR-1.5.
        if (Status is TicketStatus.Closed)
        {
            throw new TicketClosedException();
        }

        // 7. Same status. BR-1.9 — a 409, never a no-op 200: a 200 would tell the client its
        // request was applied when nothing happened.
        if (target == Status)
        {
            throw new SameStatusTransitionException(Status);
        }

        // 8. The matrix, unconditioned — so a forbidden cell reports the transition rule rather
        // than the assignee precondition, which is the distinction the client acts on.
        if (!TicketStatusTransitions.RawAllows(Status, target))
        {
            throw new InvalidStatusTransitionException(
                Status, TicketStatusTransitions.AllowedFrom(Status, AssignedToUserId is not null));
        }

        // 9. The precondition, last. BR-1.3 — a ticket cannot be "being worked on" by nobody.
        if (target is TicketStatus.InProgress && AssignedToUserId is null)
        {
            throw new AssigneeRequiredException();
        }

        // BR-1.2. A note is required only when closing work that was never started. Q-1 declined
        // to require one on Resolved → Closed: demanding a reason for the expected outcome trains
        // people to type nothing useful.
        if (target is TicketStatus.Closed
            && Status is TicketStatus.New or TicketStatus.Open
            && string.IsNullOrWhiteSpace(note))
        {
            throw new NoteRequiredException(Status);
        }

        var previous = Status;
        Status = target;

        // BR-1.7. Set here because it is a fact about the ticket, not about the row.
        if (target is TicketStatus.Closed)
        {
            ClosedAtUtc = occurredAtUtc;
        }

        return TicketHistoryEntry.StatusChanged(Id, previous, target, occurredAtUtc, note);
    }
    /// <summary>
    /// Sets or clears the assignee. `011` AC-8, AC-9, AC-10, AC-11 — BR-2.5, BR-2.6, BR-2.7.
    /// </summary>
    /// <param name="assigneeId">The target support user, or <c>null</c> to unassign.</param>
    /// <param name="occurredAtUtc">From <c>IRequestTimestamp</c>, never <c>DateTime.UtcNow</c>.</param>
    /// <remarks>
    /// <para>
    /// <b>Only the two rules that are invariants of the ticket are here.</b> BR-2.5 (a
    /// <c>Closed</c> ticket cannot change owner) and AC-11 (an assignment must be a change) hold
    /// for every caller — a handler, a seeder, a future bulk import — so they belong to the
    /// entity. BR-2.1 through BR-2.4 need the caller's identity, the caller's role, and a lookup
    /// in another table, none of which the domain has or should have; they stay in the handler,
    /// which is also what makes their denials auditable (`spec.md`, *Where each BR-2 check
    /// lives*).
    /// </para>
    /// <para>
    /// <b>The status is not touched, and that is BR-2.7 written as an absence.</b> Assigning a
    /// <c>New</c> ticket leaves it <c>New</c>. Triage and ownership are separate acts, and
    /// coupling them would hide one of them from the history — there would be an
    /// <c>Assigned</c> row and a silent status change with no <c>StatusChanged</c> row beside it.
    /// ADR-004. AC-10 is the test, and it is testing that this method does nothing.
    /// </para>
    /// <para>
    /// <b>What this does change without changing status</b> is
    /// <see cref="AllowedTransitions"/>: BR-1.3 makes <c>InProgress</c> conditional on having an
    /// assignee, so an <c>Open</c> ticket goes from <c>["Closed"]</c> to
    /// <c>["InProgress", "Closed"]</c> on assignment. `011` AC-16 asserts it, because it is the
    /// clearest demonstration that the client must render the array it was given rather than
    /// hold a copy of the map.
    /// </para>
    /// <para>
    /// It does not touch <c>UpdatedAtUtc</c> — <c>SaveChangesAsync</c> stamps that for every
    /// <see cref="IAuditableEntity"/> — and it does not touch <c>RowVersion</c>, which SQL Server
    /// maintains.
    /// </para>
    /// </remarks>
    /// <returns>The history row: <c>Assigned</c> or <c>Unassigned</c> (BR-2.6).</returns>
    public TicketHistoryEntry Assign(Guid? assigneeId, DateTime occurredAtUtc)
    {
        // 8 in the contract's order. Terminal — and it runs AFTER the handler's permission
        // checks, which is why those are not here: an Agent assigning someone else to a Closed
        // ticket must get 403, not 409. They could not have done it on an open ticket either, and
        // 409 first would imply that reopening would help. BR-1.5 makes it terminal, so it would
        // not.
        if (Status is TicketStatus.Closed)
        {
            throw new TicketClosedException();
        }

        // 9. A request that describes no change is a 409, never a no-op 200 — the same rule and
        // the same reason as BR-1.9's same-status transition: a 200 tells the client its request
        // was applied when nothing happened. Covers both directions, which AC-11 and the
        // edge-case register treat as one case: assigning the current assignee, and unassigning
        // an already-unassigned ticket.
        if (assigneeId == AssignedToUserId)
        {
            throw new AssigneeUnchangedException();
        }

        var previous = AssignedToUserId;
        AssignedToUserId = assigneeId;

        return assigneeId is { } target
            ? TicketHistoryEntry.Assigned(Id, previous, target, occurredAtUtc)

            // previous cannot be null here: assigneeId is null and the equality check above
            // already rejected the case where both are. The domain says so with a type rather
            // than a comment — Unassigned takes a non-nullable Guid.
            : TicketHistoryEntry.Unassigned(Id, previous!.Value, occurredAtUtc);
    }
    /// <summary>
    /// Accepts a comment and returns the history row that records it. `013` AC-4, AC-8 — BR-5.2,
    /// BR-5.5.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The ticket is not modified.</b> Nothing on this entity changes, so <c>RowVersion</c> does
    /// not move and no <c>expectedVersion</c> is required on the endpoint — commenting is not an
    /// edit of the ticket and two people commenting at once are not in conflict. That is why
    /// <c>POST /comments</c> is a `201` on a sub-collection rather than a `PUT` on the ticket.
    /// </para>
    /// <para>
    /// <b>It exists on <c>Ticket</c> anyway, because BR-5.2 is the ticket's rule.</b> "A closed
    /// ticket accepts no comment" is a fact about the ticket's state, true for every caller, and
    /// putting it in the handler would leave a seeder or an importer free to comment on closed
    /// work. Same placement, same argument, as BR-2.5 in <see cref="Assign"/>.
    /// </para>
    /// <para>
    /// <b>The history row carries the comment's id and never its text</b> (BR-5.5). The audit trail
    /// and the timeline both record <i>that</i> a comment happened; the text lives in one place, so
    /// there is one row to redact and one row to correct if it ever must be.
    /// </para>
    /// </remarks>
    /// <param name="commentId">The comment's id, which exists before <c>SaveChanges</c> because
    /// the entity generates it — so both rows can be written in one unit of work.</param>
    /// <param name="occurredAtUtc">The same instant the comment carries. AC-10 depends on it.</param>
    public TicketHistoryEntry AcceptComment(Guid commentId, DateTime occurredAtUtc)
    {
        // BR-5.2. Terminal, like every other write on a closed ticket — reported as
        // ticket-closed rather than a generic conflict, so the client can say why instead of
        // offering a retry that cannot succeed. BR-1.5.
        if (Status is TicketStatus.Closed)
        {
            throw new TicketClosedException();
        }

        return TicketHistoryEntry.CommentAdded(Id, commentId, occurredAtUtc);
    }
}