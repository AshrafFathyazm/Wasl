namespace Wasl.Domain.Communications;

/// <summary>
/// Which way a message travelled. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Two members, and exactly one of them is reachable.</b> Only <see cref="Outbound"/> can be
/// written — `021` builds sending and nothing else — and
/// <c>CK_Interactions_Direction CHECK (Direction = N'Outbound')</c> is the database saying so out
/// loud rather than a comment saying it quietly (AC-9).
/// </para>
/// <para>
/// <b>So why declare <see cref="Inbound"/> at all?</b> Because the alternative is a
/// single-member enum, and a single-member enum is a column that carries no information — the
/// first reader asks why the column exists. US-013 (Incoming Interaction Registration) is
/// deferred with four named blockers, not cancelled: an inbound webhook endpoint, a provider
/// payload contract, webhook authentication, and a strategy for matching an inbound message to a
/// customer. Naming the member states that the direction is a real axis while the check
/// constraint states that half of it is not yet permitted.
/// </para>
/// <para>
/// <b>Landing US-013 is one dropped constraint, not a migration of every row.</b> That is the
/// property this shape buys, and it is why the constraint carries the restriction instead of the
/// enum.
/// </para>
/// <para>
/// Persisted as a string (ADR-013), like every other enum here. An <c>int</c> would make the
/// declaration order load-bearing for existing rows.
/// </para>
/// </remarks>
public enum InteractionDirection
{
    /// <summary>The system sent it to the customer. The only value `021` can write.</summary>
    Outbound,

    /// <summary>
    /// The customer sent it to the system. **Refused by <c>CK_Interactions_Direction</c>** until
    /// US-013 exists — see the remarks on why the member is nevertheless declared.
    /// </summary>
    Inbound,
}
