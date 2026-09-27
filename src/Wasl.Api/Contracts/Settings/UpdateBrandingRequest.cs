namespace Wasl.Api.Contracts.Settings;

/// <summary>
/// The body of <c>PUT /api/settings/branding</c>. `022`.
/// </summary>
/// <param name="BrandColor">
/// <c>#RRGGBB</c>. Case-insensitive on input, stored and returned upper case, trimmed before
/// validation.
/// </param>
/// <param name="SidebarMode">
/// Exactly one of <c>Light</c>, <c>Dark</c>, <c>Brand</c>. <b>Case-sensitive</b>: it is an enum
/// identifier, not a label (BR-8.7).
/// </param>
/// <param name="ExpectedVersion">The <c>version</c> from the last read (ADR-006, spec Q-C).</param>
/// <remarks>
/// <para>
/// <b>Three fields, and what is absent is the design.</b> <c>onBrand</c> is not here — it is
/// computed by the gate that accepts the colour, and a client-supplied foreground would be the
/// one input that could defeat the whole accessibility rule while looking like a preference.
/// Neither is <c>version</c> as an output field, <c>updatedAtUtc</c>, or an id: this resource has
/// exactly one instance and every one of those is server-owned.
/// </para>
/// <para>
/// <b>A <c>string</c> rather than a <c>SidebarMode</c> for the mode</b>, so an unknown value is a
/// catalogue-backed <c>400</c> from FluentValidation naming the field, rather than the model
/// binder's own English message before the pipeline runs (`002c`).
/// </para>
/// </remarks>
public sealed record UpdateBrandingRequest(
    string BrandColor,
    string SidebarMode,
    string ExpectedVersion);
