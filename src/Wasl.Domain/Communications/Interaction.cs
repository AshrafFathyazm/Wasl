namespace Wasl.Domain.Communications;

/// <summary>
/// One message the system sent to a customer, and what the provider said about it. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>This is not a <see cref="Wasl.Domain.Tickets.TicketComment"/> with a channel, and the
/// distinction has to stay crisp or the whole feature reads as a duplicate of `013`.</b> A
/// comment is text a support user typed into a note. An interaction is text a support user
/// composed and <i>the system sent</i>: it went through a provider, it has a delivery outcome,
/// and it has a recipient address. The three columns a comment has no equivalent for —
/// <see cref="DeliveryStatus"/>, <see cref="ProviderMessageId"/>, <see cref="FailureCode"/> — are
/// the difference.
/// </para>
/// <para>
/// <b>Append-only, and enforced the way a comment's is: by the absence of a mutator.</b> Every
/// setter is private and <see cref="Send"/> is the only way in. There is no <c>MarkDelivered</c>
/// and no <c>Update</c>.
/// </para>
/// <para>
/// <b>But NOT append-only by database permission, unlike <c>AuditLog</c> (BR-9.5), and spec Q-E
/// rules on that deliberately.</b> <see cref="DeliveryStatus"/> is precisely the column a real
/// provider's asynchronous callback would later update, so a <c>DENY UPDATE</c> now is a grant
/// that has to be revoked the day that callback exists. Append-only here is a property of the
/// code path, stated rather than enforced.
/// </para>
/// <para>
/// <b>Not an <c>IAuditableEntity</c>.</b> Same reason as <c>TicketComment</c> and
/// <c>TicketHistoryEntry</c>: there is no <c>UpdatedAtUtc</c> to maintain on a row that is never
/// updated, and the actor column is <see cref="SentByUserId"/> — "who composed this" rather than
/// "who last touched this row".
/// </para>
/// <para>
/// <b><see cref="Body"/> must never reach <c>dbo.AuditLog</c>.</b> Registered in
/// <c>AuditRedaction</c> under both spellings, the same way <c>TicketComment.Body</c> is — and
/// for the same reason BR-9.7 gives: the trail records that a message was sent, never its text.
/// AC-16 asserts the audit row's <c>Changes</c> carries the channel, the recipient, the delivery
/// status and the interaction id, and not the body.
/// </para>
/// </remarks>
public sealed class Interaction
{
    /// <summary>Matches the column, and matches <c>TicketComment.BodyMaxLength</c>.</summary>
    /// <remarks>
    /// The same number as a comment on purpose: both are one message a person typed, and two
    /// different ceilings for the same act would be a difference a user discovers by hitting it.
    /// </remarks>
    public const int BodyMaxLength = 4000;

    /// <summary>Matches <c>Customers.Email</c>, which is the longest thing that lands here.</summary>
    /// <remarks>
    /// An E.164 phone is at most 16 characters and shares the column. Sizing to the wider of the
    /// two rather than adding a second column: the channel says which kind it is, and a
    /// <c>RecipientEmail</c> / <c>RecipientPhone</c> pair would be two columns of which exactly
    /// one is always null.
    /// </remarks>
    public const int RecipientAddressMaxLength = 320;

    public const int ProviderNameMaxLength = 50;

    public const int ProviderMessageIdMaxLength = 100;

    public const int FailureCodeMaxLength = 50;

    // EF Core materialises through this. Nothing else should.
    private Interaction()
    {
    }

    public Guid Id { get; private set; }

    public Guid TicketId { get; private set; }

    /// <summary>
    /// Always <see cref="InteractionDirection.Outbound"/> in this release.
    /// </summary>
    /// <remarks>
    /// Not omitted just because one value is reachable — see <see cref="InteractionDirection"/>.
    /// <c>CK_Interactions_Direction</c> refuses the other one at the database, and
    /// <see cref="Send"/> is the only writer, so there is no path that sets it to anything else.
    /// </remarks>
    public InteractionDirection Direction { get; private set; }

    public CommunicationChannel Channel { get; private set; }

    /// <summary>
    /// The address the message actually went to, <b>snapshotted at send time</b>.
    /// </summary>
    /// <remarks>
    /// Not a join to the customer, and the reasoning is BR-9.6's: the record has to stay true
    /// after `017` lets somebody edit that customer's email. A joined address would silently
    /// rewrite history — every past message would appear to have gone to the new address, which
    /// is the one question this table exists to answer correctly.
    /// </remarks>
    public string RecipientAddress { get; private set; } = string.Empty;

    /// <summary>Stored and sent verbatim. Never translated (BR-8.10), never redacted here.</summary>
    public string Body { get; private set; } = string.Empty;

    /// <summary>
    /// Which provider handled it. <c>Mock</c> today.
    /// </summary>
    /// <remarks>
    /// <b>The column that makes the seam legible in a data dump the day a second provider
    /// exists.</b> Without it, old rows would be indistinguishable from new ones and "which
    /// provider sent this" would be answerable only by correlating dates against a deployment
    /// log.
    /// </remarks>
    public string ProviderName { get; private set; } = string.Empty;

    /// <summary>
    /// The provider's own identifier for the message. Null exactly when delivery failed.
    /// </summary>
    /// <remarks>
    /// Quoted in support conversations, so it is never localized (BR-8.7) and never reformatted.
    /// </remarks>
    public string? ProviderMessageId { get; private set; }

    public DeliveryStatus DeliveryStatus { get; private set; }

    /// <summary>
    /// A machine-readable code, never a sentence. Null exactly when delivery succeeded.
    /// </summary>
    /// <remarks>
    /// The client maps it to a translated sentence (AC-22). A sentence stored here would be a
    /// sentence in one language in the database, which is BR-8.7's whole objection.
    /// </remarks>
    public string? FailureCode { get; private set; }

    /// <summary>Who composed it, from the token and never from the request body.</summary>
    public Guid SentByUserId { get; private set; }

    /// <summary>
    /// From the injected <c>TimeProvider</c> via <c>IRequestTimestamp</c>, never
    /// <c>DateTime.UtcNow</c>.
    /// </summary>
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// The only way to create one. Records an attempt that has already happened.
    /// </summary>
    /// <param name="providerMessageId">
    /// The provider's id on success, <c>null</c> on failure.
    /// </param>
    /// <param name="failureCode">
    /// The provider's code on failure, <c>null</c> on success.
    /// </param>
    /// <remarks>
    /// <para>
    /// <b>Named <c>Send</c> in the past tense of its own docs, not <c>Create</c>, and it does not
    /// send anything.</b> The provider call has already returned by the time this runs — the
    /// entity records an outcome it is told. A factory that performed the send would put an
    /// <c>ICommunicationProvider</c> into <c>Wasl.Domain</c>, which is the boundary this
    /// codebase's whole structure exists to keep.
    /// </para>
    /// <para>
    /// <b>The outcome pairing is checked here AND by <c>CK_Interactions_Outcome</c>.</b> Two
    /// layers, one rule, per constitution III — and the two catch different mistakes: this one
    /// catches a handler passing an inconsistent pair, the constraint catches anything that
    /// reaches the table by another route (a seeder, a migration, a manual <c>INSERT</c>).
    /// </para>
    /// <para>
    /// <b>An <c>ArgumentException</c> rather than a domain exception, deliberately.</b> An
    /// inconsistent outcome pair is not a business rule a user can violate — it is a programming
    /// error in this codebase, and it should read as a `500` and a stack trace rather than as a
    /// polite `409`. Every user-reachable refusal (a closed ticket, no address for the channel)
    /// is decided in the handler *before* this is called.
    /// </para>
    /// </remarks>
    public static Interaction Send(
        Guid ticketId,
        CommunicationChannel channel,
        string recipientAddress,
        string body,
        string providerName,
        string? providerMessageId,
        DeliveryStatus deliveryStatus,
        string? failureCode,
        Guid sentByUserId,
        DateTime createdAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(recipientAddress);
        ArgumentException.ThrowIfNullOrWhiteSpace(body);
        ArgumentException.ThrowIfNullOrWhiteSpace(providerName);

        if (ticketId == Guid.Empty)
        {
            throw new ArgumentException("An interaction must belong to a ticket.", nameof(ticketId));
        }

        if (sentByUserId == Guid.Empty)
        {
            throw new ArgumentException(
                "An interaction must name the user who sent it.", nameof(sentByUserId));
        }

        var trimmedBody = body.Trim();

        if (trimmedBody.Length > BodyMaxLength)
        {
            throw new ArgumentException(
                $"A message body is at most {BodyMaxLength} characters.", nameof(body));
        }

        /* THE OUTCOME PAIRING, and it mirrors CK_Interactions_Outcome exactly.
         *
         * An `Accepted` row with no provider id reads as delivered and cannot be chased up with
         * the provider. A `Failed` row with a provider id reads as a contradiction. Both are the
         * kind of row somebody trusts. */
        switch (deliveryStatus)
        {
            case DeliveryStatus.Accepted
                when string.IsNullOrWhiteSpace(providerMessageId) || failureCode is not null:
                throw new ArgumentException(
                    "An accepted delivery carries a provider message id and no failure code.",
                    nameof(deliveryStatus));

            case DeliveryStatus.Failed
                when string.IsNullOrWhiteSpace(failureCode) || providerMessageId is not null:
                throw new ArgumentException(
                    "A failed delivery carries a failure code and no provider message id.",
                    nameof(deliveryStatus));

            default:
                break;
        }

        return new Interaction
        {
            Id = Guid.CreateVersion7(),
            TicketId = ticketId,

            // Set here and nowhere else. `021` sends; it does not receive.
            Direction = InteractionDirection.Outbound,
            Channel = channel,
            RecipientAddress = recipientAddress.Trim(),
            Body = trimmedBody,
            ProviderName = providerName.Trim(),
            ProviderMessageId = providerMessageId,
            DeliveryStatus = deliveryStatus,
            FailureCode = failureCode,
            SentByUserId = sentByUserId,
            CreatedAtUtc = createdAtUtc,
        };
    }
}
