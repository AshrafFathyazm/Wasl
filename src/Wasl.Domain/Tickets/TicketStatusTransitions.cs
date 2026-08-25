namespace Wasl.Domain.Tickets;

/// <summary>
/// BR-1. The one permitted-transition map in the system.
/// </summary>
/// <remarks>
/// <para>
/// <b>Never duplicated in an endpoint and never in React.</b> The API returns
/// <c>allowedTransitions</c> with the ticket and the client renders what it was given
/// (ADR-004, `CLAUDE.md`). A client that derives the rule itself is a second copy, and the
/// second copy is the one that goes stale.
/// </para>
/// <para>
/// <b>The raw matrix is not the rule.</b> <see cref="RawMatrix"/> is what `CLAUDE.md`'s table
/// says; <see cref="AllowedFrom"/> is what the product permits, because two conditions sit on
/// top of it and both are BR-1:
/// </para>
/// <list type="bullet">
/// <item><c>InProgress</c> requires an assignee — an unassigned ticket cannot be "being worked
/// on" by nobody. So <c>Open</c> with no assignee offers <c>Closed</c> alone, and that is
/// exactly the case a caller reading the matrix directly would get wrong.</item>
/// <item><c>Closed</c> is terminal, which the matrix already encodes as an empty row.</item>
/// </list>
/// <para>
/// A same-status transition is absent from every row: BR-1 makes it a <c>409</c>, not a
/// no-op <c>200</c>, so it must never appear in <c>allowedTransitions</c>.
/// </para>
/// </remarks>
public static class TicketStatusTransitions
{
    /// <summary>
    /// The unconditional matrix, exactly as `CLAUDE.md` and BR-1 state it.
    /// </summary>
    /// <remarks>
    /// Internal on purpose. Callers get <see cref="AllowedFrom"/>, which applies the
    /// conditions — an accessible raw matrix is an invitation to skip them, and the skip
    /// produces a button that returns <c>409</c> when pressed.
    /// </remarks>
    private static readonly Dictionary<TicketStatus, TicketStatus[]> RawMatrix = new()
    {
        [TicketStatus.New] = [TicketStatus.Open, TicketStatus.Closed],
        [TicketStatus.Open] = [TicketStatus.InProgress, TicketStatus.Closed],
        [TicketStatus.InProgress] = [TicketStatus.Open, TicketStatus.PendingCustomer, TicketStatus.Resolved],
        [TicketStatus.PendingCustomer] = [TicketStatus.InProgress],
        [TicketStatus.Resolved] = [TicketStatus.InProgress, TicketStatus.Closed],
        [TicketStatus.Closed] = [],
    };

    /// <summary>
    /// The transitions permitted from <paramref name="current"/> for a ticket that
    /// <paramref name="hasAssignee"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The assignee parameter is the whole point of this method existing.</b> Without it,
    /// an <c>Open</c> ticket with nobody assigned would offer <c>InProgress</c> — the client
    /// would render the button, the user would press it, and the write would be refused. The
    /// mistake would only surface at `012`, in a different feature, as a `409` nobody expected.
    /// </para>
    /// <para>
    /// Ordered by the enum's declaration order so two calls produce the same sequence. The
    /// response is compared in tests and read by a client; a set that reorders between calls
    /// makes both harder for no gain.
    /// </para>
    /// </remarks>
    public static IReadOnlyList<TicketStatus> AllowedFrom(TicketStatus current, bool hasAssignee) =>
        RawMatrix[current]
            .Where(target => hasAssignee || target is not TicketStatus.InProgress)
            .OrderBy(target => (int)target)
            .ToArray();

    /// <summary>
    /// Whether the transition is permitted. The single question `012`'s endpoint asks.
    /// </summary>
    /// <remarks>
    /// A same-status transition returns <c>false</c>, because <paramref name="current"/> never
    /// appears in its own row. BR-1 calls that a <c>409</c>, and the endpoint's job is to
    /// produce one rather than to decide it is harmless.
    /// </remarks>
    public static bool IsPermitted(TicketStatus current, TicketStatus target, bool hasAssignee) =>
        AllowedFrom(current, hasAssignee).Contains(target);

    /// <summary>Every status, for exhaustive tests over all 36 cells.</summary>
    public static IReadOnlyList<TicketStatus> All { get; } = Enum.GetValues<TicketStatus>();
}
