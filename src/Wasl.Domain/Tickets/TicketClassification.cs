namespace Wasl.Domain.Tickets;

/// <summary>
/// What the ticket is about. FR-2.2.
/// </summary>
/// <remarks>
/// Four values, per `docs/sdd/03-domain-model.md` (`spec.md` A-2). Stored as a string with no
/// <c>CHECK</c> constraint and no lookup table — the domain is the constraint, consistently
/// with every other enum in this schema.
/// </remarks>
public enum TicketCategory
{
    Technical,
    Billing,
    General,
    Complaint,
}

/// <summary>
/// How urgent. FR-2.3.
/// </summary>
/// <remarks>
/// <see cref="Normal"/> is the default when the field is omitted (AC-8), and it is declared
/// second rather than first on purpose: the default is a business decision expressed in the
/// validator and the column default, not something inferred from being enum value zero.
/// </remarks>
public enum TicketPriority
{
    Low,
    Normal,
    High,
    Urgent,
}
