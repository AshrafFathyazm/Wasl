using FluentValidation;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.ChangeStatus;

/// <summary>
/// AC-5's shape half, and the <c>expectedVersion</c> rules from the contract's step 3.
/// </summary>
/// <remarks>
/// <para>
/// <b>BR-1.2's note rule is deliberately NOT here.</b> Whether a note is required depends on the
/// ticket's current status, which a validator cannot see: it runs before the handler and holds no
/// database. So <c>Ticket.ChangeStatus</c> raises it, as a `400` with a field error on
/// <c>note</c> — which is why <c>NoteRequiredException</c> carries <c>FieldErrors</c> at all.
/// </para>
/// <para>
/// Shape rules here, state rules in the entity. Splitting them anywhere else means either a
/// validator that queries or an entity that returns validation results.
/// </para>
/// <para>
/// Every message is a symbolic key, never a sentence (ADR-007 §5, BR-8.6).
/// </para>
/// </remarks>
internal sealed class ChangeTicketStatusCommandValidator : AbstractValidator<ChangeTicketStatusCommand>
{
    public ChangeTicketStatusCommandValidator()
    {
        RuleFor(command => command.Status)
            .IsInEnum()
            .WithMessage("Validation.Ticket.StatusInvalid");

        // Required, not optional, and the contract says why: treating a missing token as "no
        // opinion" turns every client that forgets it into a last-write-wins client, silently.
        // Absent is a 400, undecodable is a 400, stale is a 409 — three different answers, and
        // the client can act on each.
        RuleFor(command => command.ExpectedVersion)
            .NotEmpty()
            .WithMessage("Validation.Ticket.ExpectedVersionRequired");

        // `004b` AC-38. Length BEFORE decode, and Cascade.Stop is what makes that ordering real:
        // FluentValidation runs every rule in a chain by default, so without it the length rule
        // would report the problem and BeBase64 would still allocate the buffer it exists to avoid.
        RuleFor(command => command.ExpectedVersion)
            .Cascade(CascadeMode.Stop)
            .MaximumLength(Ticket.RowVersionTokenMaxLength)
            .WithMessage("Validation.Ticket.ExpectedVersionTooLong")
            .Must(BeBase64)
            .WithMessage("Validation.Ticket.ExpectedVersionUndecodable")
            .When(command => !string.IsNullOrEmpty(command.ExpectedVersion));

        // The column is nvarchar(500). Rejected at the boundary rather than truncated by the
        // database, because a note silently shortened is worse than one refused.
        RuleFor(command => command.Note)
            .MaximumLength(TicketHistoryEntry.NoteMaxLength)
            .WithMessage("Validation.Ticket.NoteTooLong")
            .When(command => command.Note is not null);
    }

    private static bool BeBase64(string value) =>
        Convert.TryFromBase64String(value, new byte[value.Length], out _);
}
