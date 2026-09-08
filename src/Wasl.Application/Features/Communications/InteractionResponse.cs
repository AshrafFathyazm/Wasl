using Wasl.Domain.Communications;

namespace Wasl.Application.Features.Communications;

/// <summary>
/// One interaction on the wire. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>ONE shape for the `201` from <c>POST</c> and every item in the <c>GET</c> list</b>, and the
/// contract says so: *"the item shape is byte-for-byte the `201` shape from `POST`, so the client
/// has one type and one renderer, not two."* Two records here would be two things to keep in
/// step, and `016` had just finished paying for a shared mapper whose five callers disagreed —
/// this is the same lesson applied before the second caller exists rather than after.
/// </para>
/// <para>
/// <b>Shared vocabulary, so it sits in the feature's root folder rather than in one use case's.</b>
/// The same placement, for the same reason, as <c>TagSummary</c> in
/// <c>Features/Tickets/Tags/</c> — which `CLAUDE.md` records as the sanctioned deviation from
/// one-folder-per-use-case, because splitting it produces one shared folder plus two thin ones.
/// </para>
/// <para>
/// <b>No <c>customerId</c> and no customer name.</b> The recipient address is here because it is
/// what the message went to; who that address belongs to is the ticket's business and the client
/// already has the ticket. Adding the customer would make this response the second place a
/// customer's identity is asserted.
/// </para>
/// <para>
/// <b><see cref="Direction"/> is on the wire even though only one value is reachable.</b> A client
/// that renders "sent" versus "received" differently should read the field rather than assume,
/// and US-013 landing must not be a breaking change for it.
/// </para>
/// </remarks>
/// <param name="ProviderMessageId">
/// Null exactly when <paramref name="DeliveryStatus"/> is <c>Failed</c>. Quoted verbatim in
/// support conversations, so never reformatted and never localized (BR-8.7).
/// </param>
/// <param name="FailureCode">
/// Null exactly when delivery succeeded. A machine-readable code — the client maps it to a
/// translated sentence and never renders it raw (AC-22).
/// </param>
public sealed record InteractionResponse(
    Guid Id,
    Guid TicketId,
    InteractionDirection Direction,
    CommunicationChannel Channel,
    string RecipientAddress,
    string Body,
    string ProviderName,
    string? ProviderMessageId,
    DeliveryStatus DeliveryStatus,
    string? FailureCode,
    Guid SentByUserId,
    DateTime CreatedAtUtc)
{
    /// <summary>
    /// The one mapping, used by the send and by the read.
    /// </summary>
    /// <remarks>
    /// <b>No optional parameters, and that is a deliberate reaction to `016`.</b> Every field
    /// comes off the entity, so there is nothing a caller can forget to pass — which is exactly
    /// the property <c>CreateTicketCommandHandler.Map</c> lost when it grew five defaulted
    /// arguments and four of its five call sites quietly stopped supplying them. If this response
    /// ever needs something the entity does not carry, the fix is a reader like
    /// <c>TicketDetailReader</c>, not a defaulted parameter here.
    /// </remarks>
    public static InteractionResponse From(Interaction interaction)
    {
        ArgumentNullException.ThrowIfNull(interaction);

        return new InteractionResponse(
            Id: interaction.Id,
            TicketId: interaction.TicketId,
            Direction: interaction.Direction,
            Channel: interaction.Channel,
            RecipientAddress: interaction.RecipientAddress,
            Body: interaction.Body,
            ProviderName: interaction.ProviderName,
            ProviderMessageId: interaction.ProviderMessageId,
            DeliveryStatus: interaction.DeliveryStatus,
            FailureCode: interaction.FailureCode,
            SentByUserId: interaction.SentByUserId,
            CreatedAtUtc: interaction.CreatedAtUtc);
    }
}
