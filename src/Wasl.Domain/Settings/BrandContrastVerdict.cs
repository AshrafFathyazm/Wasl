namespace Wasl.Domain.Settings;

/// <summary>Which of the three checks refused a brand colour. Never localized (BR-8.7).</summary>
/// <remarks>
/// The client branches on this to say <i>which</i> problem it is — a colour text cannot sit on
/// is a different conversation from a colour that disappears against the page — so it is a
/// machine value on the wire, not a translated sentence.
/// </remarks>
public enum BrandContrastGate
{
    /// <summary>Neither candidate foreground reaches 4.5:1 against the brand.</summary>
    Text,

    /// <summary>
    /// The base colour passes but a derived ramp member does not. Named <c>hover</c> on the wire
    /// because that is the state a user meets first, though <c>--brand-active</c> is measured too.
    /// </summary>
    Hover,

    /// <summary>The brand is under 3:1 against the page surface. Spec Q-E.</summary>
    Surface,
}

/// <summary>
/// The outcome of <see cref="BrandContrast.Evaluate"/>: whether the colour is usable, which
/// foreground goes on it, and the three measured ratios.
/// </summary>
/// <param name="RefusedBy">
/// <see langword="null"/> when the colour is accepted. Otherwise the first check that refused it.
/// </param>
/// <param name="OnBrand">
/// The better of the two candidate foregrounds. <b>Meaningful even on a refusal</b> — it is the
/// foreground the ratios were measured against, so a client can explain the verdict rather than
/// only report it.
/// </param>
/// <param name="BestContrastRatio">The winning foreground against the base colour.</param>
/// <param name="RampContrastRatio">
/// The worse of <c>--brand-hover</c> and <c>--brand-active</c> against the same foreground.
/// </param>
/// <param name="SurfaceContrastRatio">The base colour against the page surface.</param>
/// <remarks>
/// <b>All three ratios are reported whichever check refused.</b> A verdict that returned only
/// the failing number would make the response useless for the thing a user actually does next —
/// nudge the colour and look again — because they would not be able to see how close the other
/// two are to their own thresholds.
/// </remarks>
public sealed record BrandContrastVerdict(
    BrandContrastGate? RefusedBy,
    string OnBrand,
    double BestContrastRatio,
    double RampContrastRatio,
    double SurfaceContrastRatio)
{
    /// <summary>Whether the colour may be stored.</summary>
    public bool Accepted => RefusedBy is null;
}
