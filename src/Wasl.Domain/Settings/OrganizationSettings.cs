using Wasl.Domain.Common;

namespace Wasl.Domain.Settings;

/// <summary>
/// The organisation's interface settings. <b>Exactly one row</b>, seeded by the migration and
/// updated in place — never created, never deleted.
/// </summary>
/// <remarks>
/// <para>
/// <b>One row, and the database enforces it.</b> <c>CK_OrganizationSettings_SingleRow</c> pins
/// <see cref="Id"/> to a fixed value, so a second insert fails rather than producing two rows
/// whose read order decides the product's colour (AC-25). A code-side "there can be only one"
/// check would be check-then-act, which this codebase has a rule about.
/// </para>
/// <para>
/// <b>Seeded, so there is no "not configured" state.</b> <c>GET</c> answers <c>200</c> with the
/// product default on a clean database and never <c>404</c> (AC-1). A nullable settings row
/// would put a branch in every consumer including the pre-paint script, which is the one place
/// a branch costs a frame.
/// </para>
/// <para>
/// <b>"Tenant" is ADR-012's word for this one organisation</b> (spec Q-B). There is no
/// <c>TenantId</c>, no tenant resolution and no scoped query — multi-tenancy is out of scope
/// project-wide. If it ever arrives this is a column and a filter, not a redesign.
/// </para>
/// <para>
/// <b><see cref="OnBrand"/> is stored, not computed on read.</b> It is the output of the gate
/// that accepted <see cref="BrandColor"/>, so storing it records <i>what was decided</i> rather
/// than re-deriving it every read against thresholds that may have moved. A stored value also
/// means the token response and the settings read cannot disagree.
/// </para>
/// </remarks>
public sealed class OrganizationSettings : IAuditableEntity
{
    /// <summary>
    /// The single row's identity. A fixed <see cref="Guid"/> rather than an <c>int</c> identity,
    /// because the check constraint needs a literal to compare against and a sequence would make
    /// "the only row" depend on nothing having been deleted.
    /// </summary>
    public static readonly Guid SingletonId = new("0000022A-0000-0000-0000-000000000001");

    /// <summary>The colour the product ships as — the house navy, <c>--navy-900</c>.</summary>
    public const string DefaultBrandColor = "#1D174D";

    private OrganizationSettings()
    {
    }

    public Guid Id { get; private set; } = SingletonId;

    /// <summary><c>#RRGGBB</c>, upper case, normalised on write.</summary>
    public string BrandColor { get; private set; } = DefaultBrandColor;

    /// <summary>
    /// The foreground the gate chose for <see cref="BrandColor"/> — one of the two candidates.
    /// </summary>
    public string OnBrand { get; private set; } = BrandContrast.ForegroundWhite;

    public SidebarMode SidebarMode { get; private set; } = SidebarMode.Light;

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public Guid? CreatedByUserId { get; private set; }

    public Guid? UpdatedByUserId { get; private set; }

    /// <summary>ADR-006 / ADR-013 — a SQL Server <c>rowversion</c>, never a manual counter.</summary>
    public byte[] RowVersion { get; private set; } = [];

    /// <summary>
    /// Applies a branding change, refusing a colour the contrast gate will not accept.
    /// </summary>
    /// <returns>
    /// <see langword="true"/> when something actually changed. <see langword="false"/> means the
    /// submitted values equal the stored ones, and the caller writes <b>no audit row</b> — BR-9.8
    /// records fields that changed, and a row recording nothing is noise (spec edge cases).
    /// </returns>
    /// <exception cref="InaccessibleBrandColorException">
    /// The colour is well-formed and fails one of the three checks.
    /// </exception>
    /// <remarks>
    /// <b>The gate is here rather than in the validator</b> because the same evaluation decides
    /// both outcomes: whether to refuse, and which foreground to store. A validator could only
    /// produce the refusal, leaving the acceptance half implemented a second time beside it.
    /// </remarks>
    public bool ChangeBranding(string normalisedBrandColor, SidebarMode sidebarMode)
    {
        ArgumentNullException.ThrowIfNull(normalisedBrandColor);

        var verdict = BrandContrast.Evaluate(normalisedBrandColor);

        if (verdict.RefusedBy is { } gate)
        {
            throw new InaccessibleBrandColorException(gate, verdict);
        }

        if (BrandColor == normalisedBrandColor
            && OnBrand == verdict.OnBrand
            && SidebarMode == sidebarMode)
        {
            return false;
        }

        BrandColor = normalisedBrandColor;
        OnBrand = verdict.OnBrand;
        SidebarMode = sidebarMode;

        return true;
    }

    /// <summary>
    /// The seeded row. Used by the migration and by nothing else — every later change goes
    /// through <see cref="ChangeBranding"/>, so the gate cannot be bypassed.
    /// </summary>
    public static OrganizationSettings CreateDefault() => new();
}
