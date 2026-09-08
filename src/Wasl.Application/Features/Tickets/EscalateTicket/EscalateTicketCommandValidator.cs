using FluentValidation;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.EscalateTicket;

/// <summary>
/// The shape rules — `016` AC-5 and the contract's step 3. `020b`'s state rules are the entity's.
/// </summary>
/// <remarks>
/// <para>
/// <b>BR-3.3 and BR-3.4 are deliberately NOT here.</b> Both depend on the ticket's current state,
/// which a validator cannot see: it runs before the handler and holds no database.
/// <c>Ticket.Escalate</c> raises them, as the two `409`s the contract names. Shape rules here,
/// state rules in the entity — splitting them anywhere else means either a validator that
/// queries or an entity that returns validation results.
/// </para>
/// <para>
/// <b>BR-3.2 is not here either</b>, and not in the entity: "only a Manager" is a role-only check
/// on the caller, so BR-6 puts it on the endpoint as a policy. `011` measured what happens when a
/// role gate and a data-dependent check swap places.
/// </para>
/// <para>
/// Every message is a symbolic key, never a sentence (ADR-007 §5, BR-8.6).
/// </para>
/// </remarks>
internal sealed class EscalateTicketCommandValidator : AbstractValidator<EscalateTicketCommand>
{
    public EscalateTicketCommandValidator()
    {
        /* THE LENGTH IS MEASURED AFTER TRIMMING — BR-3.5, AC-5.
         *
         * `MaximumLength` on the raw value would refuse 500 characters followed by a newline,
         * which is what a textarea sends when somebody presses Enter before submitting: a refusal
         * the user cannot see the cause of, on a reason they wrote at exactly the limit.
         *
         * `Cascade.Stop` so an empty reason reports "required" once rather than also reporting a
         * length rule it trivially satisfies. */
        RuleFor(command => command.Reason)
            .Cascade(CascadeMode.Stop)
            .Must(reason => !string.IsNullOrWhiteSpace(reason))
            .WithMessage("Validation.Ticket.EscalationReasonRequired")
            .Must(reason => reason.Trim().Length <= EscalateTicketCommand.ReasonMaxLength)
            .WithMessage("Validation.Ticket.EscalationReasonTooLong");

        // Required, not optional, for the reason the contract gives: treating a missing token as
        // "no opinion" turns every client that forgets it into a last-write-wins client, silently.
        RuleFor(command => command.ExpectedVersion)
            .NotEmpty()
            .WithMessage("Validation.Ticket.ExpectedVersionRequired");

        // `004b` AC-38, and `Cascade.Stop` is what makes the ordering real: FluentValidation runs
        // every rule in a chain by default, so without it the length rule would report the problem
        // and `BeBase64` would still allocate the buffer it exists to avoid.
        RuleFor(command => command.ExpectedVersion)
            .Cascade(CascadeMode.Stop)
            .MaximumLength(Ticket.RowVersionTokenMaxLength)
            .WithMessage("Validation.Ticket.ExpectedVersionTooLong")
            .Must(BeBase64)
            .WithMessage("Validation.Ticket.ExpectedVersionUndecodable")
            .When(command => !string.IsNullOrEmpty(command.ExpectedVersion));
    }

    private static bool BeBase64(string value) =>
        Convert.TryFromBase64String(value, new byte[value.Length], out _);
}
