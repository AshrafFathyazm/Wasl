using FluentValidation;
using Wasl.Domain.Customers;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Customers.UpdateCustomer;

/// <summary>
/// The shape rules from `017`'s frozen contract. Every message is a symbolic key (BR-8.6).
/// </summary>
/// <remarks>
/// <para>
/// <b>The field rules are `007`'s, deliberately duplicated rather than shared.</b> The two
/// commands are different records with different required fields, and a base validator would have
/// to be generic over both — which buys nothing and makes the ONE difference between them
/// (<c>expectedVersion</c>) harder to see. The limits are the same numbers because they are the
/// same columns; if a column changes, both files change, and a test that reads a message would
/// catch a file that did not.
/// </para>
/// <para>
/// <b>Absent, undecodable and stale are three different answers</b> — `400`, `400`, `409` — and
/// the client can act on each. Treating a missing token as "no opinion" turns every client that
/// forgets it into a last-write-wins client, silently.
/// </para>
/// </remarks>
internal sealed class UpdateCustomerCommandValidator : AbstractValidator<UpdateCustomerCommand>
{
    private const int FullNameMaxLength = 200;
    private const int EmailMaxLength = 320;
    private const int CompanyNameMaxLength = 200;
    private const int NotesMaxLength = 2000;

    public UpdateCustomerCommandValidator()
    {
        RuleFor(command => command.FullName)
            .NotEmpty()
            .WithMessage("Validation.Customer.FullNameRequired")
            .MaximumLength(FullNameMaxLength)
            .WithMessage("Validation.Customer.FullNameTooLong");

        RuleFor(command => command.ExpectedVersion)
            .NotEmpty()
            .WithMessage("Validation.Customer.ExpectedVersionRequired");

        // `004b` AC-38. LENGTH BEFORE DECODE, and `Cascade.Stop` is what makes that ordering real:
        // FluentValidation runs every rule in a chain by default, so without it the length rule
        // would report the problem and `BeBase64` would still allocate the buffer it exists to
        // avoid. `Ticket.RowVersionTokenMaxLength` is reused because it is a ceiling on a SQL
        // Server rowversion token, not a fact about tickets.
        RuleFor(command => command.ExpectedVersion)
            .Cascade(CascadeMode.Stop)
            .MaximumLength(Ticket.RowVersionTokenMaxLength)
            .WithMessage("Validation.Customer.ExpectedVersionTooLong")
            .Must(BeBase64)
            .WithMessage("Validation.Customer.ExpectedVersionUndecodable")
            .When(command => !string.IsNullOrEmpty(command.ExpectedVersion));

        // BR-4.1, AFTER the update. Submitting neither names BOTH fields, which the contract asks
        // for: the reader has to supply one of the two, and pointing at only the first would say
        // the second is not an option.
        RuleFor(command => command.Email)
            .Must((command, _) => HasAContactMethod(command))
            .WithMessage("Validation.Customer.ContactRequired")
            .When(command => !HasAContactMethod(command));

        RuleFor(command => command.Phone)
            .Must((command, _) => HasAContactMethod(command))
            .WithMessage("Validation.Customer.ContactRequired")
            .When(command => !HasAContactMethod(command));

        // FluentValidation's permissive check, for `007`'s reason: the authoritative test of an
        // address is whether mail arrives at it, and no regex is that test.
        RuleFor(command => command.Email)
            .EmailAddress()
            .WithMessage("Validation.Customer.EmailInvalid")
            .When(command => !string.IsNullOrWhiteSpace(command.Email));

        RuleFor(command => command.Email)
            .MaximumLength(EmailMaxLength)
            .WithMessage("Validation.Customer.EmailTooLong")
            .When(command => command.Email is not null);

        // A phone that was supplied and cannot be normalised is a `400` naming `phone`, NEVER a
        // `409` — the caller's input is wrong, not in conflict with someone else's. And
        // `IsUnparseablePhone` rather than `Phone(...) is null`, because absent and unparseable
        // are different: absent is legal when an email is present, and collapsing them would tell
        // a user with a malformed phone and no email that they are missing a contact method.
        RuleFor(command => command.Phone)
            .Must(phone => !ContactNormalisation.IsUnparseablePhone(phone))
            .WithMessage("Validation.Customer.PhoneInvalid");

        RuleFor(command => command.CompanyName)
            .MaximumLength(CompanyNameMaxLength)
            .WithMessage("Validation.Customer.CompanyNameTooLong")
            .When(command => command.CompanyName is not null);

        RuleFor(command => command.Notes)
            .MaximumLength(NotesMaxLength)
            .WithMessage("Validation.Customer.NotesTooLong")
            .When(command => command.Notes is not null);
    }

    /// <summary>BR-4.1 — at least one contact method after the update.</summary>
    private static bool HasAContactMethod(UpdateCustomerCommand command) =>
        !string.IsNullOrWhiteSpace(command.Email) || !string.IsNullOrWhiteSpace(command.Phone);

    private static bool BeBase64(string value) =>
        Convert.TryFromBase64String(value, new byte[value.Length], out _);
}
