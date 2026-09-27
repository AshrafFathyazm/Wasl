using System.Globalization;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Domain.Settings;

/// <summary>
/// A well-formed colour that the contrast gate refuses. ADR-012 parts 1 and 2, plus the surface
/// gate ruled in under spec Q-E.
/// </summary>
/// <remarks>
/// <para>
/// <b>A distinct <c>type</c> rather than plain <c>errors/validation</c>, because the interface
/// does something different with it.</b> A malformed colour is a typo and the message belongs on
/// the field. A refused colour is a <i>decision the user needs explained</i> — with the measured
/// ratios rendered, so they can nudge the colour and see which way they are moving (AC-21).
/// </para>
/// <para>
/// <b>It carries numbers, never a composed sentence.</b> A server-built string like
/// <c>"4.02:1, needs 4.5:1"</c> would put a formatted number inside a translated message, and
/// Arabic formats numbers differently — so the client formats them in the active locale. The
/// four ratios and <c>refusedBy</c> are byte-identical in every language (BR-8.7, AC-8).
/// </para>
/// <para>
/// <b>It carries <c>errors.brandColor</c> as well</b>, because the remedy is to change that
/// field and the message belongs on that control. Same reason
/// <c>errors/no-contact-for-channel</c> carries <c>errors.channel</c>.
/// </para>
/// </remarks>
public sealed class InaccessibleBrandColorException : DomainException
{
    /// <summary>The field every refusal is attributed to.</summary>
    public const string Field = "BrandColor";

    public InaccessibleBrandColorException(BrandContrastGate gate, BrandContrastVerdict verdict)
        : base(DomainErrorCodes.InaccessibleBrandColor, MessageKeyFor(gate))
    {
        ArgumentNullException.ThrowIfNull(verdict);

        Gate = gate;
        Verdict = verdict;

        FieldErrors = new Dictionary<string, string[]>
        {
            [Field] = [MessageKeyFor(gate)],
        };

        MachineExtensions = new Dictionary<string, object>(StringComparer.Ordinal)
        {
            // Lower-cased here rather than serialized as an enum, because the wire value is part
            // of the frozen contract and `"text"` must not become `"Text"` if the enum is renamed.
            ["refusedBy"] = gate.ToString().ToLowerInvariant(),
            ["bestContrastRatio"] = verdict.BestContrastRatio,
            ["requiredContrastRatio"] = BrandContrast.RequiredTextRatio,
            ["surfaceContrastRatio"] = verdict.SurfaceContrastRatio,
            ["requiredSurfaceContrastRatio"] = BrandContrast.RequiredSurfaceRatio,
        };
    }

    /// <summary>Which of the three checks refused the colour.</summary>
    public BrandContrastGate Gate { get; }

    /// <summary>Every measured ratio, including the ones that passed.</summary>
    public BrandContrastVerdict Verdict { get; }

    public override IReadOnlyDictionary<string, string[]> FieldErrors { get; }

    public override IReadOnlyDictionary<string, object> MachineExtensions { get; }

    /// <summary>
    /// A different sentence per gate, because they are different problems and merging them
    /// produces advice that is wrong for two of the three.
    /// </summary>
    /// <remarks>
    /// Telling someone whose pale yellow is invisible against the page that "no text colour is
    /// readable on it" sends them looking for the wrong fix — the text on it is perfectly
    /// readable; the button is not visible.
    /// </remarks>
    private static string MessageKeyFor(BrandContrastGate gate) => gate switch
    {
        BrandContrastGate.Text => "Error.Branding.NoReadableForeground",
        BrandContrastGate.Hover => "Error.Branding.HoverStateUnreadable",
        BrandContrastGate.Surface => "Error.Branding.InvisibleAgainstPage",
        _ => throw new ArgumentOutOfRangeException(
            nameof(gate),
            gate,
            string.Create(
                CultureInfo.InvariantCulture,
                $"No message key is registered for contrast gate {gate}.")),
    };
}
