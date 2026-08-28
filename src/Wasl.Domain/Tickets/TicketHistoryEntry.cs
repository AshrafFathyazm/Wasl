namespace Wasl.Domain.Tickets;

/// <summary>
/// What kind of thing happened to a ticket. BR-1.8, BR-5.
/// </summary>
public enum TicketHistoryEventType
{
    Created,
    StatusChanged,
    Assigned,
    Unassigned,
    Escalated,
    CommentAdded,
}

/// <summary>
/// One entry in a ticket's visible history. <b>Not the audit log</b> — ADR-008.
/// </summary>
/// <remarks>
/// <para>
/// The distinction is the whole of ADR-008 and it is easy to collapse: this table is a
/// <b>product feature</b>, shown in the timeline at `013`, cascade-deleted with its ticket, and
/// covering ticket events only. <c>dbo.AuditLog</c> is a forensic record, has no foreign keys so
/// it survives a deletion, and covers authentication events too.
/// </para>
/// <para>
/// Collapsing them would mean either an audit trail a user can delete by deleting a ticket, or a
/// timeline showing failed sign-ins. `003` built the second table; this is the first.
/// </para>
/// <para>
/// No <c>rowversion</c>: append-only, so there is no second writer to conflict with (BR-5.6) —
/// the same argument `research.md` R-10 made for <c>AuditLog</c>.
/// </para>
/// </remarks>
public sealed class TicketHistoryEntry
{
    public const int ValueMaxLength = 200;
    public const int NoteMaxLength = 500;

    private TicketHistoryEntry()
    {
    }

    public Guid Id { get; private set; }

    public Guid TicketId { get; private set; }

    public TicketHistoryEventType EventType { get; private set; }

    /// <summary>Null for <see cref="TicketHistoryEventType.Created"/> — there was no before.</summary>
    public string? OldValue { get; private set; }

    public string? NewValue { get; private set; }

    public string? Note { get; private set; }

    /// <summary>
    /// Null until `004`, for the same reason as <c>Ticket.CreatedByUserId</c>: no request
    /// carries an identity yet, and `dbo.SupportUsers` does not exist to key against.
    /// </summary>
    public Guid? PerformedByUserId { get; private set; }

    public DateTime PerformedAtUtc { get; private set; }

    /// <summary>
    /// The first row of a ticket's history, written in the same transaction as the ticket
    /// (AC-9, BR-1.8).
    /// </summary>
    /// <remarks>
    /// <c>NewValue</c> is the status the ticket starts in, as a string, so the timeline reads
    /// without knowing the enum. <c>OldValue</c> stays null: a create has no previous state, and
    /// writing <c>"None"</c> there would invent one.
    /// </remarks>
    public static TicketHistoryEntry Created(
        Guid ticketId,
        DateTime performedAtUtc,
        Guid? performedByUserId = null) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            TicketId = ticketId,
            EventType = TicketHistoryEventType.Created,
            OldValue = null,
            NewValue = TicketStatus.New.ToString(),
            PerformedByUserId = performedByUserId,
            PerformedAtUtc = performedAtUtc,
        };

    /// <summary>
    /// The row for an accepted status transition. `012` AC-11, BR-1.8.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Both values are stored, not just the new one: a timeline showing "moved to Resolved" is
    /// far less useful than "moved from PendingCustomer to Resolved", and the previous value
    /// cannot be recovered afterwards — the column it came from has already been overwritten.
    /// </para>
    /// <para>
    /// The <paramref name="note"/> is stored whenever it is supplied, not only when BR-1.2
    /// required it. A volunteered reason is worth keeping, and discarding it because the rule did
    /// not demand it would lose the one thing a reader wants.
    /// </para>
    /// </remarks>
    public static TicketHistoryEntry StatusChanged(
        Guid ticketId,
        TicketStatus from,
        TicketStatus to,
        DateTime performedAtUtc,
        string? note = null,
        Guid? performedByUserId = null) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            TicketId = ticketId,
            EventType = TicketHistoryEventType.StatusChanged,
            OldValue = from.ToString(),
            NewValue = to.ToString(),
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            PerformedByUserId = performedByUserId,
            PerformedAtUtc = performedAtUtc,
        };
    /// <summary>
    /// The row for an assignment or a reassignment. `011` AC-9, BR-2.6.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The ids as text, never the names</b> (`011` <c>data-model.md</c>). This table has a
    /// foreign key to <c>dbo.SupportUsers</c> and nothing in this system hard-deletes a user —
    /// <c>IsActive</c> handles departures — so the join always resolves, and a stored name would
    /// be a second copy of something that can be renamed.
    /// </para>
    /// <para>
    /// That is the <b>opposite</b> of <c>dbo.AuditLog</c>, which snapshots its actor's email and
    /// role precisely because it has no foreign keys and must outlive what it describes (ADR-008).
    /// Two tables, opposite requirements, and this is one of the few places the difference is
    /// visible in code rather than in a document.
    /// </para>
    /// <para>
    /// <c>OldValue</c> is null when the ticket was unassigned. Not <c>"None"</c>, and not the
    /// empty string: the column already has a way to say "nobody", and inventing a second one
    /// means the timeline has two cases to render for one fact.
    /// </para>
    /// </remarks>
    public static TicketHistoryEntry Assigned(
        Guid ticketId,
        Guid? from,
        Guid to,
        DateTime performedAtUtc,
        Guid? performedByUserId = null) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            TicketId = ticketId,
            EventType = TicketHistoryEventType.Assigned,
            OldValue = from?.ToString(),
            NewValue = to.ToString(),
            PerformedByUserId = performedByUserId,
            PerformedAtUtc = performedAtUtc,
        };

    /// <summary>
    /// The row for clearing an assignee. `011` AC-9, BR-2.6.
    /// </summary>
    /// <remarks>
    /// <b>A separate event type rather than an <c>Assigned</c> row with a null
    /// <c>NewValue</c></b>, and BR-2.6 names both. Handing work back is a different act from
    /// handing it over, so a timeline reads it differently and a filter can find it. Collapsing
    /// them would leave the distinction recoverable only by testing <c>NewValue</c> for null,
    /// which is a rule living in whatever renders the row.
    /// </remarks>
    public static TicketHistoryEntry Unassigned(
        Guid ticketId,
        Guid from,
        DateTime performedAtUtc,
        Guid? performedByUserId = null) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            TicketId = ticketId,
            EventType = TicketHistoryEventType.Unassigned,
            OldValue = from.ToString(),
            NewValue = null,
            PerformedByUserId = performedByUserId,
            PerformedAtUtc = performedAtUtc,
        };
}