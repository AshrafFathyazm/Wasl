using FluentValidation;
using Wasl.Application.Common.Communications;

namespace Wasl.Application.Features.Communications.SendMessage;

/// <summary>
/// The shape rules, plus the one AC-3 needs the registry for. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>This validator takes a dependency, which is unusual here and is the point.</b> Every other
/// validator in this codebase is parameterless because every other rule is about the request
/// alone. AC-3 asks for something a constant cannot express — <i>is a provider registered for
/// this channel</i> — and AC-4 asks that the answer live in exactly one place. So the registry is
/// injected, and the alternative was a <c>SendableChannels</c> constant that would be the same
/// fact stated twice with the second copy free to drift.
/// </para>
/// <para>
/// <b>It is still not a database call.</b> The registry is a singleton holding a dictionary built
/// at startup, so this stays a pure shape check that happens to read composition. A validator
/// that queried would be the thing this codebase keeps out of validators — state rules belong to
/// the entity or the handler, and both `409`s here (<c>ticket-closed</c>,
/// <c>no-contact-for-channel</c>) are in the handler for exactly that reason.
/// </para>
/// <para>
/// <b>A non-sendable channel is a `400`, not a `409`.</b> Sendability is a property of the
/// request *value* — `LiveChat` is never sendable for anybody — while a closed ticket and a
/// missing address are properties of *state*. The contract fixes it, and getting it wrong would
/// make a client retry a `409` that can never succeed.
/// </para>
/// <para>
/// Every message is a symbolic key (ADR-007 §5, BR-8.6), and `002c`'s
/// <c>MessageKeyCoverageTests</c> requires each in both catalogues.
/// </para>
/// </remarks>
internal sealed class SendMessageCommandValidator : AbstractValidator<SendMessageCommand>
{
    public SendMessageCommandValidator(CommunicationProviderRegistry registry)
    {
        ArgumentNullException.ThrowIfNull(registry);

        /* MEASURED AFTER TRIMMING, and `Cascade.Stop`, for the reasons `016`'s validator gives:
         * `MaximumLength` on the raw value refuses 4000 characters plus the newline a textarea
         * appends, and without Stop an empty body reports "required" AND a length rule it
         * trivially satisfies. */
        RuleFor(command => command.Body)
            .Cascade(CascadeMode.Stop)
            .Must(body => !string.IsNullOrWhiteSpace(body))
            .WithMessage("Validation.Communication.BodyRequired")
            .Must(body => body.Trim().Length <= SendMessageCommand.BodyMaxLength)
            .WithMessage("Validation.Communication.BodyTooLong");

        /* AC-3 AND THE FIRST HALF OF AC-4.
         *
         * `IsInEnum` first: a value outside `CommunicationChannel` is a different failure from a
         * valid channel with no provider, and reporting "no provider is registered" for
         * `channel: "Carrier Pigeon"` would send the reader to the DI registration to look for
         * something that was never a channel.
         *
         * THE MESSAGE DOES NOT ENUMERATE THE SENDABLE SET. The client already has that list from
         * `GET /api/communications/channels`, and interpolating it here would put one fact in two
         * catalogues — and make the sentence's Arabic translation depend on runtime data. */
        RuleFor(command => command.Channel)
            .Cascade(CascadeMode.Stop)
            .IsInEnum()
            .WithMessage("Validation.Communication.ChannelInvalid")
            .Must(registry.CanSend)
            .WithMessage("Validation.Communication.ChannelNotSendable");
    }
}
