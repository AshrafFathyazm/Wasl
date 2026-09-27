using Wasl.Application.Common.Messaging;
using Wasl.Domain.Audit;
using Wasl.Domain.Settings;

namespace Wasl.Application.Features.Settings.UpdateBranding;

/// <summary>
/// <c>PUT /api/settings/branding</c>. `022`, Manager only.
/// </summary>
/// <param name="BrandColor">
/// <c>#RRGGBB</c>. Case-insensitive on input, stored and returned upper case.
/// </param>
/// <param name="SidebarMode">
/// Exactly one of <c>Light</c>, <c>Dark</c>, <c>Brand</c>. <b>Case-sensitive</b> — it is an enum
/// value, not a label (BR-8.7), so <c>light</c> is a <c>400</c>.
/// </param>
/// <param name="ExpectedVersion">
/// The <c>version</c> from the last read. A mismatch is <c>409</c> (ADR-006, spec Q-C).
/// </param>
/// <remarks>
/// <para>
/// <b>Why <c>expectedVersion</c> is required on a settings row.</b> ADR-006 names <c>Ticket</c>
/// and <c>Customer</c>, not settings — but a single global row editable by every Manager is the
/// same hazard it describes, and worse for being invisible: a lost update here reverts the
/// organisation's colour for no reason anyone can trace. A <c>409</c> costs one refetch.
/// </para>
/// <para>
/// <b>A <c>PUT</c> replaces the resource, so nothing here is optional.</b> A missing
/// <c>brandColor</c> is a <c>400</c> and never "keep the current value" — a partial update that
/// silently preserved a field would make the same request mean different things depending on
/// what was stored.
/// </para>
/// </remarks>
public sealed record UpdateBrandingCommand(
    string BrandColor,
    string SidebarMode,
    string ExpectedVersion)
    : IAuditableCommand<BrandingResponse>
{
    /// <summary>BR-9. Named in <c>04-business-rules.md</c>'s action list (DOC-022-02).</summary>
    public string AuditAction => "Settings.BrandingChanged";

    /// <summary>
    /// The settings row. <b>There is exactly one</b>, so the id is a constant rather than
    /// something the request carries — and the label is the colour that was accepted, which is
    /// the one fact an investigation reading this row wants without opening the diff.
    /// </summary>
    /// <remarks>
    /// The colour is <b>not</b> sensitive and is deliberately not redacted. BR-9.7's list is
    /// about secrets and human text; a hex colour is neither, and a branding audit row that
    /// refused to say which colour was set would record nothing worth keeping.
    /// </remarks>
    public AuditTarget DescribeTarget(BrandingResponse? response) =>
        new(
            nameof(OrganizationSettings),
            OrganizationSettings.SingletonId,
            response?.BrandColor);
}
