namespace Wasl.Domain.Communications;

/// <summary>
/// What the provider said when it was handed the message. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Two members, both reachable, and the failure one is why this feature is worth building.</b>
/// A seam that can only succeed has not been exercised — the failure path is where a real
/// provider will spend its time, and `021`'s mock can produce it through configuration
/// (<c>Communications:Mock:FailChannels</c>) and through nothing else (AC-6).
/// </para>
/// <para>
/// <b><see cref="Accepted"/> is not "delivered", and the name is deliberate.</b> What the mock —
/// and any real provider — can report synchronously is that it took responsibility for the
/// message. Whether it reached a handset is asynchronous and arrives later, through a callback
/// this product does not have. Calling the state <c>Sent</c> or <c>Delivered</c> would be a
/// claim the system cannot make, and it would be the kind of claim a support agent repeats to a
/// customer.
/// </para>
/// <para>
/// <b>There is no <c>Pending</c>, and adding one is a real decision.</b> The send happens inside
/// the request (spec A-6), so a row never exists in an undecided state — it is written once, with
/// its outcome already known. A real provider with an outbox would need <c>Pending</c>, and
/// `plan.md` records the outbox as the change that forces it rather than pre-building it here.
/// </para>
/// <para>
/// <b>The pairing with the other two columns is a database constraint, not a convention.</b>
/// <c>CK_Interactions_Outcome</c> permits only
/// <c>(Accepted, ProviderMessageId NOT NULL, FailureCode NULL)</c> and
/// <c>(Failed, ProviderMessageId NULL, FailureCode NOT NULL)</c>. Without it a handler bug
/// produces a row that reads as delivered, which is the one wrong answer nobody double-checks.
/// </para>
/// </remarks>
public enum DeliveryStatus
{
    /// <summary>
    /// The provider took the message. Carries a <c>ProviderMessageId</c> and no failure code.
    /// </summary>
    Accepted,

    /// <summary>
    /// The provider refused it. Carries a <c>FailureCode</c> and no provider message id.
    /// **The row still exists** — the attempt is the resource (AC-7).
    /// </summary>
    Failed,
}
