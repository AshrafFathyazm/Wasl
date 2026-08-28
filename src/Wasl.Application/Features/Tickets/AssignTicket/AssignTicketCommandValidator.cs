using FluentValidation;

namespace Wasl.Application.Features.Tickets.AssignTicket;

/// <summary>
/// The contract's step 2 — shape only. `011`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Nothing about BR-2 is here, and nothing can be.</b> Every one of BR-2.1 to BR-2.4 needs at
/// least one of: the caller's identity, the caller's role, the ticket's current assignee, or a row
/// from <c>dbo.SupportUsers</c>. A validator runs before the handler and holds no database and no
/// principal, so a rule placed here would be a rule that cannot see its own inputs.
/// </para>
/// <para>
/// <b><see cref="AssignTicketCommand.AssigneeId"/> has no rule at all</b>, which is deliberate and
/// is the one thing worth checking twice. <c>null</c> is a legal value — it means unassign — so
/// <c>NotEmpty</c> would forbid AC-5. And "the user exists and is active" is BR-2.4, a database
/// read that belongs to the handler. So the only shape constraint on this field is the one the
/// type already enforces: it is a <c>Guid?</c>, and a malformed value never binds.
/// </para>
/// <para>
/// Every message is a symbolic key, never a sentence (ADR-007 §5, BR-8.6).
/// </para>
/// </remarks>
internal sealed class AssignTicketCommandValidator : AbstractValidator<AssignTicketCommand>
{
    public AssignTicketCommandValidator()
    {
        // Required, and the reason is `012`'s: treating a missing token as "no opinion" turns
        // every client that forgets it into a last-write-wins client, silently. Absent is a 400,
        // undecodable is a 400, stale is a 409 — three answers the client can each act on.
        RuleFor(command => command.ExpectedVersion)
            .NotEmpty()
            .WithMessage("Validation.Ticket.ExpectedVersionRequired");

        RuleFor(command => command.ExpectedVersion)
            .Must(BeBase64)
            .WithMessage("Validation.Ticket.ExpectedVersionUndecodable")
            .When(command => !string.IsNullOrEmpty(command.ExpectedVersion));
    }

    private static bool BeBase64(string value) =>
        Convert.TryFromBase64String(value, new byte[value.Length], out _);
}
