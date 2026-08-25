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
}
