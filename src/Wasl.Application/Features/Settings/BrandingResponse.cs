using Wasl.Domain.Settings;

namespace Wasl.Application.Features.Settings;

/// <summary>
/// The organisation's branding, as it goes on the wire. `022`.
/// </summary>
/// <remarks>
/// <para>
/// <b>One shape for three places</b> — the <c>GET</c>, the <c>PUT</c> result, and the
/// <c>theme</c> object on the <c>POST /api/auth/token</c> response. AC-3 asserts the first and
/// the third are <b>field-for-field equal</b> by calling both and comparing, rather than by two
/// tests that each check a shape independently: two independent shape assertions both pass while
/// the two responses drift apart.
/// </para>
/// <para>
/// <b>No optional parameters on <see cref="From"/>, deliberately.</b> `016` measured what an
/// optional parameter costs on a shared mapper: five call sites, eleven fields silently dropped,
/// three of them live contract violations that every test walked past. Every caller passes
/// everything or the code does not compile.
/// </para>
/// <para>
/// <b>The ramp is not here, and that is `research.md` R-6.</b> The five derived values are
/// <c>color-mix(in oklab, …)</c> declarations in the stylesheet; sending hex values would be a
/// second implementation of the ramp that has to agree with the first forever. The client
/// receives the two colours the rule decided and the stylesheet derives the rest.
/// </para>
/// <para>
/// <b>The sidebar preset's colours are not here either</b>, for the same reason —
/// <c>sidebarMode</c> is a name, and the three presets live in CSS (ADR-012 part 4).
/// </para>
/// </remarks>
/// <param name="BrandColor"><c>#RRGGBB</c>, upper case. What is stored, not what was typed.</param>
/// <param name="OnBrand">
/// The foreground the contrast gate chose. The client writes it to <c>--on-brand</c> and does
/// <b>not</b> recompute it (Constitution III).
/// </param>
/// <param name="SidebarMode">One of three names. Never localized (BR-8.7).</param>
/// <param name="UpdatedAtUtc">When the branding last changed.</param>
/// <param name="Version">
/// The base64 <c>rowversion</c>. Required on the next <c>PUT</c> (ADR-006, spec Q-C).
/// </param>
public sealed record BrandingResponse(
    string BrandColor,
    string OnBrand,
    SidebarMode SidebarMode,
    DateTime UpdatedAtUtc,
    string Version)
{
    public static BrandingResponse From(OrganizationSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        return new BrandingResponse(
            settings.BrandColor,
            settings.OnBrand,
            settings.SidebarMode,
            settings.UpdatedAtUtc,
            Convert.ToBase64String(settings.RowVersion));
    }
}
