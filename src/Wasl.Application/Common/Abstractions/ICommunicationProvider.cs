using Wasl.Domain.Communications;

namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// Hands one outbound message to one channel's provider. `021` — <b>the seam</b>.
/// </summary>
/// <remarks>
/// <para>
/// <b>The whole feature exists to make one sentence true and testable:</b> adding a real provider
/// later is a new class and one registration line, and nothing in the controller, the validator,
/// the handler, the contract, or the client changes. AC-4 and AC-24 are that sentence turned into
/// tests — AC-24 registers a stub for a channel the mock does not serve and asserts the diff is
/// one new class plus one line.
/// </para>
/// <para>
/// <b>Declared here and implemented in <c>Wasl.Infrastructure/Communications/</c></b>, exactly
/// like <see cref="ITicketNumberGenerator"/>, <see cref="IAuditWriter"/> and
/// <see cref="IAccessTokenIssuer"/>. `021`'s `research.md` R-7 originally settled on
/// <c>Wasl.Api/Features/Communications/Providers/</c>, which targets ADR-010 — rejected — and the
/// entry is corrected there rather than deleted, because its *argument* was right: nothing in
/// <c>Wasl.Domain</c> calls a provider, so an outbound port in the domain is a port in the wrong
/// place that invites the next person to inject infrastructure into an entity.
/// </para>
/// <para>
/// <b>DEFERRED.md's objection is accepted rather than answered.</b> It said an interface with one
/// implementation and no second in prospect is usually the wrong interface, and that is still
/// true: <see cref="SendAsync"/> is designed against a mock, so it will be wrong in detail. What
/// it is not is *absent* — and the absent version is what makes Communication Channels, a named
/// module in the requirement, read as missing rather than as scoped. The justification is
/// demonstrability, written down as such rather than dressed up as future-proofing.
/// </para>
/// <para>
/// <b>NO CREDENTIAL AND NO NETWORK ANYWHERE BEHIND THIS INTERFACE</b> in this release (AC-17).
/// The exclusion in `00-project-context.md` — real WhatsApp / SMS / email delivery — is untouched
/// and stays untouched. A mock that needs a fake API key has already lost the argument for being
/// a mock.
/// </para>
/// </remarks>
public interface ICommunicationProvider
{
    /// <summary>
    /// The one channel this instance serves.
    /// </summary>
    /// <remarks>
    /// <b>The registry indexes by this property, so it IS the key</b> — there is no second place
    /// for a registration key and a provider's own idea of its channel to disagree. That
    /// impossibility is deliberate: "a provider registered under the wrong key" is a routing bug
    /// that presents months later as *"the wrong provider sent it"*, and it is worth designing
    /// out rather than testing for.
    /// </remarks>
    CommunicationChannel Channel { get; }

    /// <summary>
    /// A stable identifier for this implementation, stored on every row it produces.
    /// </summary>
    /// <remarks>
    /// <c>"Mock"</c> today. It is persisted rather than derived from the CLR type name so that
    /// renaming a class does not rewrite what old rows claim about themselves — the same
    /// snapshot reasoning as BR-9.6 and as <c>Interaction.RecipientAddress</c>.
    /// </remarks>
    string Name { get; }

    /// <summary>
    /// Hands the message over and reports what happened.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Returns an outcome; does not throw for a refusal.</b> A provider declining a message is
    /// an expected result that the caller records as a row (AC-7) — not an exception. Throwing is
    /// reserved for a genuine fault, and it produces a `500` with the transaction rolled back and
    /// no row, which is the honest answer when the system does not know what happened.
    /// </para>
    /// <para>
    /// <b>Cancellation is NOT a failure outcome.</b> A cancelled token must surface as
    /// <see cref="OperationCanceledException"/> and never as
    /// <see cref="DeliveryStatus.Failed"/> — AC-18 asserts it. Swallowing cancellation into a
    /// `Failed` row would write a permanent record that the provider refused a message it was
    /// never asked to send.
    /// </para>
    /// <para>
    /// <b>Called inside the request transaction in this release</b> (spec A-6), which is only
    /// sound because the mock is in-process and has no effect outside it. A real provider makes
    /// that wrong twice over — a sent message cannot be rolled back, and a network round trip
    /// inside an open transaction holds locks for its duration (`CLAUDE.md`: *"Do the external
    /// call after the commit, not inside it"*). The change it forces is an outbox, recorded in
    /// `plan.md` as a known limitation rather than pre-built for a provider that does not exist.
    /// </para>
    /// </remarks>
    Task<SendOutcome> SendAsync(OutboundMessage message, CancellationToken cancellationToken);
}

/// <summary>
/// What the handler asks a provider to send. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>No <c>TicketId</c> and no <c>SentByUserId</c>.</b> A provider has no business knowing which
/// ticket a message belongs to or which employee composed it — it needs an address and a body.
/// Passing them would invite a provider to log them, and a provider is the component most likely
/// to ship data to somewhere else one day.
/// </para>
/// <para>
/// <b><see cref="Channel"/> is here even though the provider already knows its own channel.</b>
/// It is what lets a single implementation serve several channels if a real one ever does, and it
/// costs nothing — the registry still routes by <see cref="ICommunicationProvider.Channel"/>.
/// </para>
/// </remarks>
/// <param name="Channel">The channel the caller resolved a provider for.</param>
/// <param name="RecipientAddress">
/// The address, already resolved from the ticket's customer and already validated as non-empty.
/// A provider never resolves a recipient — spec A-5, and it is why the request body has no
/// recipient field.
/// </param>
/// <param name="Body">The message, verbatim. Never translated (BR-8.10).</param>
public sealed record OutboundMessage(
    CommunicationChannel Channel,
    string RecipientAddress,
    string Body);

/// <summary>
/// What the provider said. `021`.
/// </summary>
/// <remarks>
/// <b>The two factories are the only way to build one, and they enforce the pairing</b> that
/// <c>CK_Interactions_Outcome</c> and <c>Interaction.Send</c> also enforce: an accepted send
/// carries an id and no code, a failed one carries a code and no id. Three layers for one rule
/// reads like a lot — and each catches a different mistake. This one catches a *provider*
/// returning an inconsistent pair, which is the layer a third-party implementation lives at.
/// </remarks>
public sealed record SendOutcome
{
    private SendOutcome()
    {
    }

    public DeliveryStatus Status { get; private init; }

    /// <summary>Non-null exactly when <see cref="Status"/> is accepted.</summary>
    public string? ProviderMessageId { get; private init; }

    /// <summary>
    /// Non-null exactly when <see cref="Status"/> is failed. A machine-readable code, never a
    /// sentence — the client translates it (AC-22), so a sentence here would be a sentence in one
    /// language stored in the database.
    /// </summary>
    public string? FailureCode { get; private init; }

    /// <summary>The provider took the message.</summary>
    public static SendOutcome Accepted(string providerMessageId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(providerMessageId);

        return new SendOutcome
        {
            Status = DeliveryStatus.Accepted,
            ProviderMessageId = providerMessageId,
        };
    }

    /// <summary>The provider refused it. The caller still writes a row (AC-7).</summary>
    public static SendOutcome Failed(string failureCode)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(failureCode);

        return new SendOutcome
        {
            Status = DeliveryStatus.Failed,
            FailureCode = failureCode,
        };
    }
}
