namespace Wasl.Domain.Tickets;

/// <summary>
/// What the ticket is about. FR-2.2.
/// </summary>
/// <remarks>
/// <para>
/// <b>The four values in `docs/sdd/03-domain-model.md` line 370, in that order.</b> An earlier
/// version of this enum carried <c>Complaint</c>, which appears nowhere in the blueprint, and
/// omitted <c>Account</c>, which appears in both the schema comment and the type definition —
/// the same failure as <c>CommunicationChannel</c>, from the same cause: written from a contract
/// example instead of from the line that states the enum.
/// </para>
/// <para>
/// Stored as a string with no <c>CHECK</c> constraint and no lookup table — the domain is the
/// constraint, consistently with every other enum in this schema. Which also means <b>the member
/// names are the wire values</b>, and `010`'s frozen contract lists them.
/// </para>
/// </remarks>
public enum TicketCategory
{
    Billing,
    Technical,
    Account,
    General,
}

/// <summary>
/// How urgent. FR-2.3.
/// </summary>
/// <remarks>
/// <para>
/// <b>Ordered low to high</b>, as `03-domain-model.md` line 368 states — so a future
/// "at least High" filter can compare ordinals rather than enumerate a set. An earlier version
/// named the top value <c>Urgent</c>, which is not in the blueprint.
/// </para>
/// <para>
/// <see cref="Normal"/> is the default when the field is omitted (`009` AC-8), and that default
/// lives in <c>CreateTicketCommandHandler</c> — **not** as a column default. EF applies a database
/// default whenever a property holds the CLR default, which here is <see cref="Low"/>, so a
/// caller explicitly choosing <c>Low</c> would have been stored as <c>Normal</c> with no error.
/// </para>
/// </remarks>
public enum TicketPriority
{
    Low,
    Normal,
    High,
    Critical,
}
