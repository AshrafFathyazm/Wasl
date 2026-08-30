using FluentValidation;
using Wasl.Domain.Users;

namespace Wasl.Application.Features.Users.ChangeMyLanguage;

/// <summary>
/// Exactly `en` or `ar`, lowercase. `005b` AC-3, BR-8.1.
/// </summary>
/// <remarks>
/// <para>
/// <b>A region tag is a `400` here even though `Accept-Language: ar-SA` resolves to `ar` when
/// READING.</b> The frozen contract says so and gives the reason: resolution may fall back, but
/// storage may not — a stored `ar-SA` is a stored value with no catalogue behind it.
/// </para>
/// <para>
/// The supported list comes from <see cref="SupportUser.SupportedLanguages"/> rather than from a
/// literal here, so the validator and the entity cannot disagree about what the product speaks.
/// </para>
/// <para>
/// Every message is a symbolic key, never a sentence (BR-8.6).
/// </para>
/// </remarks>
internal sealed class ChangeMyLanguageCommandValidator : AbstractValidator<ChangeMyLanguageCommand>
{
    public ChangeMyLanguageCommandValidator()
    {
        RuleFor(command => command.Language)
            .Cascade(CascadeMode.Stop)
            .NotEmpty()
            .WithMessage("Validation.User.LanguageRequired")
            .Must(language => SupportUser.SupportedLanguages.Contains(language, StringComparer.Ordinal))
            .WithMessage("Validation.User.LanguageUnsupported");
    }
}
