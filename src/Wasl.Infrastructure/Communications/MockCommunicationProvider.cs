using Microsoft.Extensions.Options;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Communications;

namespace Wasl.Infrastructure.Communications;

/// <summary>
/// The one implementation behind <see cref="ICommunicationProvider"/>. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>One instance per sendable channel</b>, each constructed with the channel it serves. Not one
/// instance handling all three: the interface says a provider has *a* channel, and the registry
/// indexes by that property, so a multi-channel instance would need the interface to change
/// shape. It also makes the registration read as what it is — three registrations, three
/// channels, one class — which is the shape a real provider set will have.
/// </para>
/// <para>
/// <b>NOTHING HERE TOUCHES A NETWORK.</b> No <c>HttpClient</c>, no <c>SmtpClient</c>, no
/// <c>Socket</c>, no <c>WebSocket</c>, and no configuration key naming a secret or an account —
/// AC-17 asserts all of it by search over this folder. The exclusion in
/// `00-project-context.md` is untouched.
/// </para>
/// <para>
/// <b>The failure path is configuration-only</b> (`research.md` R-6, AC-6). See
/// <see cref="MockProviderOptions"/> for the two rejected alternatives and why a
/// request-reachable failure switch is a backdoor rather than a test affordance.
/// </para>
/// </remarks>
internal sealed class MockCommunicationProvider(
    CommunicationChannel channel,
    IOptions<MockProviderOptions> options,
    SentMessageBuffer buffer,
    TimeProvider clock) : ICommunicationProvider
{
    /// <summary>
    /// Stored on every row this provider produces, and never derived from the type name.
    /// </summary>
    /// <remarks>
    /// A constant so that renaming this class does not rewrite what existing rows claim about
    /// themselves — the same snapshot reasoning as <c>Interaction.RecipientAddress</c> and BR-9.6.
    /// The contract fixes the value: <c>"providerName": "Mock"</c>.
    /// </remarks>
    public const string ProviderName = "Mock";

    /// <summary>
    /// The only failure code the mock can emit. The contract lists it.
    /// </summary>
    /// <remarks>
    /// A machine-readable code, never a sentence — the client maps it to a translated string and
    /// never renders it raw (AC-22). A real provider adds codes; the client's fallback for an
    /// unrecognised one is a generic translated sentence.
    /// </remarks>
    public const string ConfiguredFailureCode = "MockConfiguredFailure";

    public CommunicationChannel Channel { get; } = channel;

    public string Name => ProviderName;

    public async Task<SendOutcome> SendAsync(
        OutboundMessage message,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(message);

        /* CANCELLATION FIRST, AND IT IS NEVER A `Failed` OUTCOME — AC-18.
         *
         * Checked before anything is recorded, so a pre-cancelled token produces no buffer entry
         * and no row. Swallowing cancellation into a `Failed` delivery status would write a
         * permanent record that the provider refused a message it was never asked to send — and
         * the client disconnect that caused it would be invisible. */
        cancellationToken.ThrowIfCancellationRequested();

        /* RECORDED BEFORE THE OUTCOME IS DECIDED, so the buffer shows attempts rather than
         * successes. AC-11, AC-12 and AC-13 assert the buffer is EMPTY after a refusal — which is
         * only meaningful because this line would have run had the provider been reached. */
        buffer.Record(new SentMessage(message, ProviderName));

        var latency = options.Value.LatencyMs;

        if (latency > 0)
        {
            // `clock` and not `Task.Delay(int)`: a test that wants to observe the pending state
            // drives a FakeTimeProvider rather than waiting in real time. Zero in every
            // environment that is not being demonstrated — see the options.
            await Task.Delay(TimeSpan.FromMilliseconds(latency), clock, cancellationToken);
        }

        if (options.Value.FailChannels.Contains(Channel))
        {
            return SendOutcome.Failed(ConfiguredFailureCode);
        }

        /* A GUID WITH NO DASHES BEHIND A `mock-` PREFIX, matching the contract's example shape.
         *
         * The prefix is deliberate: a provider message id turns up in support conversations and in
         * logs, and one that is obviously from the mock cannot be mistaken for a real carrier's
         * receipt. `Guid.NewGuid()` rather than `CreateVersion7()` — this identifier is opaque and
         * must not leak a timestamp, which is the one thing a version-7 GUID advertises. */
        return SendOutcome.Accepted($"mock-{Guid.NewGuid():N}");
    }
}
