namespace Wasl.Domain.Settings;

/// <summary>
/// Which of the three sidebar presets the organisation has chosen. ADR-012 part 4.
/// </summary>
/// <remarks>
/// <para>
/// <b>A mode, not a colour, and that is the decision — not a simplification of one.</b> A free
/// colour on a 288px surface has to work against text, icons, hover, and the active indicator
/// all at once. Any one of those failing is a defect nobody notices until a tenant picks that
/// colour, and the tenant who picks it is the one who cannot use the product.
/// </para>
/// <para>
/// <b>The three presets live in the stylesheet, so the wire carries a name.</b> Sending four
/// hex values per preset would be a second implementation of the presets that has to agree with
/// the first forever — the same argument that keeps the brand <i>ramp</i> off the wire
/// (<c>research.md</c> R-6).
/// </para>
/// <para>
/// <b><see cref="Brand"/> is correct by construction for any accepted brand.</b> Its surface is
/// <c>var(--brand)</c> and its foreground is <c>var(--on-brand)</c> — the same pair the contrast
/// gate already accepted — so it cannot be made unreadable by a colour the gate let through. The
/// other two carry fixed values and need no gate at all.
/// </para>
/// <para>
/// <b><see cref="Dark"/> is not dark mode.</b> It is one dark surface inside an otherwise light
/// product; the app root keeps <c>color-scheme: light</c> (<c>DESIGN-BRIEF.md</c> rule 16) and
/// the preset scopes <c>color-scheme: dark</c> to the sidebar element alone. Without that scope
/// the browser paints a light scrollbar on a near-black surface, which reads as a rendering bug
/// and gets reported as "the sidebar looks broken" with no further detail
/// (<c>research.md</c> R-10).
/// </para>
/// <para>
/// <b>Stored as a string</b> (ADR-013, and the project-wide rule): an enum stored as an int
/// means reordering the members rewrites the meaning of every existing row.
/// </para>
/// </remarks>
public enum SidebarMode
{
    /// <summary>White surface, ink foreground. The default, and what the product ships as.</summary>
    Light,

    /// <summary>A fixed near-black surface. Not dark mode — see the type's remarks.</summary>
    Dark,

    /// <summary>The tenant's brand as the surface, with the computed foreground on it.</summary>
    Brand,
}
