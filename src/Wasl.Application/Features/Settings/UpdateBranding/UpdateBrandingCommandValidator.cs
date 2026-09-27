using FluentValidation;
using Wasl.Domain.Settings;

namespace Wasl.Application.Features.Settings.UpdateBranding;

/// <summary>
/// The shape rules. `022`, AC-7 and AC-14.
/// </summary>
/// <remarks>
/// <para>
/// <b>Shape only. The contrast gate is NOT here</b>, and the split is the feature's main
/// structural decision: a malformed colour is a property of the request, while a colour nobody
/// can read text on is a rule about the product — and the same evaluation that refuses it also
/// decides which foreground to store. Putting the gate here would leave the acceptance half
/// implemented a second time in the entity. `021`'s validator took a dependency for a reason
/// this one deliberately does not repeat.
/// </para>
/// <para>
/// <b>Every non-nullable member has a rule, and that is enforced.</b> `002c` suppressed the model
/// binder's implicit-required check so a missing field produces a symbolic `400` instead of the
/// framework's English one — which means a member with no rule arrives as <c>null</c> in a
/// non-nullable property and reaches the handler as a `500`. <c>RequiredMemberCoverageTests</c>
/// fails the build on that, and `CLAUDE.md`'s instruction is literal: if it goes red, the setting
/// comes out.
/// </para>
/// <para>
/// Every message is a symbolic key (ADR-007 §5, BR-8.6), and <c>MessageKeyCoverageTests</c>
/// requires each in both catalogues.
/// </para>
/// </remarks>
internal sealed class UpdateBrandingCommandValidator : AbstractValidator<UpdateBrandingCommand>
{
    public UpdateBrandingCommandValidator()
    {
        /* ONE RULE, NOT A REGEX PLUS A LENGTH PLUS A PREFIX CHECK.
         *
         * `BrandContrast.TryNormalise` is the same method the entity uses, so "what counts as a
         * colour" has one definition. A regex here would be a second one, and the two would agree
         * until somebody decided eight-digit alpha was acceptable in one of them.
         *
         * Cascade.Stop: without it an empty string reports "required" AND "not a colour", which
         * puts two messages under one field for one mistake. */
        RuleFor(command => command.BrandColor)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Validation.Branding.BrandColorRequired")
            .Must(value => BrandContrast.TryNormalise(value, out _))
                .WithMessage("Validation.Branding.BrandColorFormat");

        /* AC-14. CASE-SENSITIVE, because the wire value is an enum identifier and not a label —
         * `light` is a `400`. `Enum.TryParse` with `ignoreCase: false` is the check, and
         * `IsDefined` alone would not be: TryParse accepts the NUMERIC text "1" for any enum,
         * so "1" would pass as `Dark` and the client would have discovered an undocumented
         * spelling that works. */
        RuleFor(command => command.SidebarMode)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Validation.Branding.SidebarModeRequired")
            .Must(IsDeclaredSidebarMode).WithMessage("Validation.Branding.SidebarModeUnknown");

        /* THE LENGTH CHECK COMES BEFORE ANY BASE64 BUFFER, which is `004b`'s rule: a caller
         * should not be able to make the server allocate from an unvalidated length. The VALUE
         * is not compared here — a stale version is a `409` from the handler, not a `400`. */
        RuleFor(command => command.ExpectedVersion)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Validation.Branding.ExpectedVersionRequired")
            .MaximumLength(32).WithMessage("Validation.Branding.ExpectedVersionFormat")
            .Must(BeBase64).WithMessage("Validation.Branding.ExpectedVersionFormat");
    }

    private static bool IsDeclaredSidebarMode(string? value) =>
        value is not null
        && Enum.TryParse<SidebarMode>(value, ignoreCase: false, out var parsed)
        && Enum.IsDefined(parsed)
        // Rejects the numeric spelling: `TryParse` happily reads "1" as `Dark`.
        && !char.IsDigit(value[0]);

    private static bool BeBase64(string? value) =>
        value is not null && Convert.TryFromBase64String(value, new byte[32], out _);
}
