using FluentValidation;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.AddComment;

/// <summary>
/// BR-5.1's shape half. `013` AC-2, AC-3, AC-7.
/// </summary>
/// <remarks>
/// <para>
/// <b>BR-5.2 — no comment on a closed ticket — is deliberately not here.</b> It depends on the
/// ticket's current status, which a validator cannot see: it runs before the handler and holds no
/// database. <c>Ticket.AcceptComment</c> raises it, as a `409`. Shape rules here, state rules in
/// the entity — the same split `012`'s validator draws for the note rule.
/// </para>
/// <para>
/// Every message is a symbolic key, and every one of these keys has an entry in the catalogue —
/// checked by <c>MessageKeyCoverageTests</c>, which exists because seventeen keys shipped without
/// one and rendered verbatim under every form field (`004b`).
/// </para>
/// </remarks>
internal sealed class AddTicketCommentCommandValidator : AbstractValidator<AddTicketCommentCommand>
{
    public AddTicketCommentCommandValidator()
    {
        // NotEmpty covers null, "" and whitespace-only in one rule — AC-2 lists all three, and
        // they are one rule because the user cannot tell them apart either.
        RuleFor(command => command.Body)
            .NotEmpty()
            .WithMessage("Validation.Comment.BodyRequired");

        // AC-3. Rejected at the boundary rather than truncated by the column: nvarchar(4000)
        // silently cuts at 4000, so a comment one character too long would be stored looking
        // complete and missing its last word.
        //
        // Measured on the UNTRIMMED value, which is what the client counted. Trimming first would
        // accept 4010 characters of which ten are spaces, and the client's own counter — which
        // matches String.length — would have already refused it.
        RuleFor(command => command.Body)
            .MaximumLength(TicketComment.BodyMaxLength)
            .WithMessage("Validation.Comment.BodyTooLong")
            .When(command => command.Body is not null);

        // AC-7. IsInEnum rather than a list: a value outside the enum binds to the underlying
        // integer and would otherwise reach the database as a number with no meaning.
        //
        // Only when a channel was supplied — null is legitimate and is the common case, because a
        // comment typed into the application arrived through no channel at all.
        RuleFor(command => command.Channel)
            .IsInEnum()
            .WithMessage("Validation.Comment.ChannelInvalid")
            .When(command => command.Channel is not null);
    }
}
