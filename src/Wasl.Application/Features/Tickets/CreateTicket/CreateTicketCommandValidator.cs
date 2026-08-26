using FluentValidation;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.CreateTicket;

/// <summary>
/// AC-4 to AC-8. Runs in `003`'s pipeline before the handler, and before any transaction —
/// so a rejected request opens none and writes no audit row (`spec.md` Q-3).
/// </summary>
/// <remarks>
/// <para>
/// <b>Every message is a symbolic key, never a sentence</b> (ADR-007 §5, BR-8.6). An English
/// string here would be one string in two places — this file and the `en` catalogue — and this
/// copy is the one that drifts. `002` shipped the same rule for error titles.
/// </para>
/// <para>
/// <b>Enum values are not validated here and that is deliberate.</b> An unparseable
/// <c>category</c> or <c>channel</c> never reaches this validator: model binding rejects it
/// first, which AC-5 requires to be a `400` listing the accepted values. `002b` owns enveloping
/// that response — until then it is a `400` from the framework rather than from the contract,
/// and `tests.md` records the gap rather than a validator pretending to cover it.
/// </para>
/// </remarks>
internal sealed class CreateTicketCommandValidator : AbstractValidator<CreateTicketCommand>
{
    public CreateTicketCommandValidator()
    {
        RuleFor(command => command.CustomerId)
            .NotEmpty()
            .WithMessage("Validation.Ticket.CustomerRequired");

        RuleFor(command => command.Subject)
            .NotEmpty()
            .WithMessage("Validation.Ticket.SubjectRequired")
            .MaximumLength(Ticket.SubjectMaxLength)
            .WithMessage("Validation.Ticket.SubjectTooLong");

        RuleFor(command => command.Description)
            .NotEmpty()
            .WithMessage("Validation.Ticket.DescriptionRequired")
            .MaximumLength(Ticket.DescriptionMaxLength)
            .WithMessage("Validation.Ticket.DescriptionTooLong");

        // FluentValidation's NotEmpty already rejects whitespace-only strings (AC-7). Asserted
        // by a test rather than trusted, because "NotEmpty rejects whitespace" is a library
        // behaviour and AC-7 is a requirement — the two agreeing today is not the same as the
        // requirement being covered.

        RuleFor(command => command.Category)
            .IsInEnum()
            .WithMessage("Validation.Ticket.CategoryInvalid");

        RuleFor(command => command.Channel)
            .IsInEnum()
            .WithMessage("Validation.Ticket.ChannelInvalid");

        // Only when supplied. A null Priority is AC-8's "omitted", and the handler applies
        // Normal — validating null as out-of-range would turn the default into a 400.
        RuleFor(command => command.Priority!.Value)
            .IsInEnum()
            .WithMessage("Validation.Ticket.PriorityInvalid")
            .When(command => command.Priority.HasValue);
    }
}
