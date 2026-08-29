using FluentValidation;
using Wasl.Domain.Customers;

namespace Wasl.Application.Features.Customers.CreateCustomer;

/// <summary>
/// BR-4.1's shape half, plus AC-2, AC-5 and AC-7. `007`.
/// </summary>
/// <remarks>
/// <para>
/// <b>The duplicate rule (BR-4.4, BR-4.5) is deliberately not here.</b> It needs a database read
/// and it is a `409`, not a `400` — the distinction matters to the client, which retries a `409`
/// with different data and corrects a `400` in place. Shape rules here, state rules in the handler.
/// </para>
/// <para>
/// Every message is a symbolic key with an entry in the catalogue, checked by
/// <c>MessageKeyCoverageTests</c> — the guard `004b` added after seventeen keys shipped without
/// one.
/// </para>
/// </remarks>
internal sealed class CreateCustomerCommandValidator : AbstractValidator<CreateCustomerCommand>
{
    /// <summary>The column's width, and the contract's.</summary>
    private const int FullNameMaxLength = 200;

    private const int EmailMaxLength = 320;
    private const int CompanyNameMaxLength = 200;
    private const int NotesMaxLength = 2000;

    public CreateCustomerCommandValidator()
    {
        // AC-2. NotEmpty covers null, "" and whitespace-only in one rule, because the user cannot
        // tell those apart either.
        RuleFor(command => command.FullName)
            .NotEmpty()
            .WithMessage("Validation.Customer.FullNameRequired");

        RuleFor(command => command.FullName)
            .MaximumLength(FullNameMaxLength)
            .WithMessage("Validation.Customer.FullNameTooLong")
            .When(command => command.FullName is not null);

        // ── BR-4.1, AC-3 — reported on BOTH fields ──────────────────────────────────
        //
        // The same rule twice, once per field, and that is what AC-3 asks for: "returns 400
        // naming both fields". A single rule on one of them would put the message under `email`
        // and leave the phone input with nothing beside it, so a form highlighting invalid fields
        // would highlight one of the two places the user may fix.
        RuleFor(command => command.Email)
            .Must((command, _) => HasAContactMethod(command))
            .WithMessage("Validation.Customer.ContactRequired")
            .When(command => !HasAContactMethod(command));

        RuleFor(command => command.Phone)
            .Must((command, _) => HasAContactMethod(command))
            .WithMessage("Validation.Customer.ContactRequired")
            .When(command => !HasAContactMethod(command));

        // AC-5. FluentValidation's EmailAddress uses a deliberately permissive check — it rejects
        // what is obviously not an address rather than trying to implement RFC 5322, which is the
        // right trade: the authoritative test of an address is whether mail arrives at it, and no
        // regex is that test.
        RuleFor(command => command.Email)
            .EmailAddress()
            .WithMessage("Validation.Customer.EmailInvalid")
            .When(command => !string.IsNullOrWhiteSpace(command.Email));

        RuleFor(command => command.Email)
            .MaximumLength(EmailMaxLength)
            .WithMessage("Validation.Customer.EmailTooLong")
            .When(command => command.Email is not null);

        // AC-7. A phone that was supplied and cannot be normalised is a 400 naming `phone`, NEVER
        // a 409 — the caller's input is wrong, not in conflict with someone else's.
        //
        // IsUnparseablePhone rather than `Phone(...) is null`, because absent and unparseable are
        // different: absent is legal when an email is present (BR-4.1 above), and collapsing them
        // would tell a user with a malformed phone and no email that they are missing a contact
        // method — true, and not the half of the truth they can act on.
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

    /// <summary>
    /// BR-4.1 — "was anything supplied", not "did anything normalise".
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The distinction was found by running it.</b> Measuring against the normalised values
    /// made a request with a malformed phone and no email fail <b>twice</b>: once for BR-4.1 and
    /// once for AC-7, so the form showed *"Provide either an email address or a phone number"*
    /// beside a phone the user had just typed.
    /// </para>
    /// <para>
    /// Both statements were true, and only one was useful. A supplied-but-unparseable phone is an
    /// AC-7 problem; BR-4.1 is about having supplied **nothing**. Whitespace is still nothing —
    /// <c>"   "</c> in both fields is an empty request — so the test is emptiness, not validity.
    /// </para>
    /// </remarks>
    private static bool HasAContactMethod(CreateCustomerCommand command) =>
        !string.IsNullOrWhiteSpace(command.Email)
        || !string.IsNullOrWhiteSpace(command.Phone);
}
