using FluentValidation;

namespace Wasl.Application.Features.Auth.IssueToken;

/// <summary>AC-5. Both fields required, and the message is a symbolic key.</summary>
/// <remarks>
/// <b>Shape only.</b> Whether the credentials are *correct* is the handler's, and it must answer
/// with a `401` that is identical for a wrong password and an unknown email (AC-4). Validating
/// anything about the value here — a format check on the email, a minimum length on the password —
/// would leak: a `400` for a malformed email and a `401` for a valid-but-unknown one tells an
/// attacker which addresses are worth trying.
/// </remarks>
internal sealed class IssueTokenCommandValidator : AbstractValidator<IssueTokenCommand>
{
    public IssueTokenCommandValidator()
    {
        RuleFor(command => command.Email)
            .NotEmpty()
            .WithMessage("Validation.Auth.EmailRequired");

        RuleFor(command => command.Password)
            .NotEmpty()
            .WithMessage("Validation.Auth.PasswordRequired");
    }
}
