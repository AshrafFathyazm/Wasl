using Wasl.Domain.Common.Exceptions;

namespace Wasl.Domain.Communications;

/// <summary>
/// The customer has no address for the requested channel. `021`, AC-12.
/// </summary>
/// <remarks>
/// <para>
/// <b>A `409` rather than a `400`, and the reasoning is on
/// <see cref="DomainErrorCodes.NoContactForChannel"/>.</b> Short version: `Sms` is a valid,
/// registered channel; what is refused is this customer's relationship to it, and BR-4.1 makes
/// email and phone each individually optional so a customer with only an email is normal data.
/// </para>
/// <para>
/// <b>It carries <c>errors.channel</c> even though it is a `409`</b>, because the user's remedy
/// is to pick a different channel and the message belongs on that control. Only two `409`s in
/// this product carry <c>errors</c> — this one and <c>duplicate-customer</c> — and both do it
/// because there is a specific field to point at.
/// </para>
/// <para>
/// <b>The message key must not describe which address the customer DOES have.</b> Two keys exist
/// because the channels group differently — one for the phone-backed channels and one for
/// email — and each says only what is missing, never what is present. Enumerating a customer's
/// contact details into an error body is a leak with no purpose (NFR-4).
/// </para>
/// <para>
/// <b>Raised in the handler, before the provider is called.</b> AC-12 asserts no row is written
/// and the provider's buffer stays empty: nothing leaves the process for a request that was
/// always going to be refused.
/// </para>
/// </remarks>
/// <param name="messageKey">
/// <c>Error.Communication.NoPhoneForChannel</c> or <c>Error.Communication.NoEmailForChannel</c>.
/// Chosen by the caller from the channel, because the sentence differs and neither variant may
/// mention the address the customer has.
/// </param>
public sealed class NoContactForChannelException(string messageKey)
    : DomainException(DomainErrorCodes.NoContactForChannel, messageKey)
{
    public override IReadOnlyDictionary<string, string[]> FieldErrors { get; } =
        new Dictionary<string, string[]> { ["channel"] = [messageKey] };
}
