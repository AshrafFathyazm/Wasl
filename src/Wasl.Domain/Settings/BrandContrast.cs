using System.Globalization;

namespace Wasl.Domain.Settings;

/// <summary>
/// The rule that decides whether a brand colour may be used at all, and which of the two
/// candidate foregrounds goes on it. ADR-012 parts 1 and 2, plus the surface gate ruled in
/// on 2026-09-27 (spec Q-E).
/// </summary>
/// <remarks>
/// <para>
/// <b>This is the one implementation.</b> The client mirrors it to preview a verdict before
/// submitting, and the server is the authority (ADR-003, Constitution III, AC-23). A request
/// that bypasses the form and sends a refused colour still gets a <c>400</c>.
/// </para>
/// <para>
/// <b>Why it is in the domain and not in a validator.</b> Refusing a colour is a rule about the
/// product, not a rule about a request shape: the same rule decides which foreground is stored.
/// A validator that could only say "no" would need the acceptance half re-implemented beside it.
/// </para>
/// <para>
/// <b>It computes the oklab ramp rather than gating the base colour alone</b>, because the
/// stylesheet derives <c>--brand-hover</c> and <c>--brand-active</c> from the brand and puts
/// <c>--on-brand</c> text on both. The hover mix is lighter by construction and the active mix
/// is darker, so exactly one of them is the risk for any given foreground — and nobody hovers
/// during review (AC-13).
/// </para>
/// </remarks>
public static class BrandContrast
{
    /// <summary>White. One of the two candidate foregrounds (<c>design/theming.md</c>).</summary>
    public const string ForegroundWhite = "#FFFFFF";

    /// <summary>The product ink, <c>--Text-Primary</c>. The other candidate foreground.</summary>
    public const string ForegroundInk = "#0D2626";

    /// <summary>
    /// The page surface the brand has to stand out against.
    /// </summary>
    /// <remarks>
    /// The lighter of the two shell surfaces, which is the worst case: a brand that is visible
    /// against white is visible against the card surface too.
    /// </remarks>
    public const string PageSurface = "#FFFFFF";

    /// <summary>WCAG 1.4.3 for normal text.</summary>
    public const double RequiredTextRatio = 4.5;

    /// <summary>
    /// WCAG 1.4.11 for non-text contrast — a filled button against the page behind it.
    /// </summary>
    /// <remarks>
    /// <b>This gate is an addition to ADR-012, not an implementation of it</b>, ruled in by the
    /// product owner on 2026-09-27 (spec Q-E). ADR-012's stated worry is <i>"the first tenant who
    /// picks a pale yellow gets an unusable product"</i>, and the text gate does not catch that:
    /// pale yellow passes comfortably with the ink foreground and yields a primary button that
    /// cannot be seen against a white page.
    /// </remarks>
    public const double RequiredSurfaceRatio = 3.0;

    /// <summary>The hover mix, matching <c>--brand-hover</c> in <c>tokens.css</c>.</summary>
    /// <remarks>
    /// The smaller step of the two. Hover is a pointer passing over a control; active is a
    /// deliberate press, and it reads as more committed for being further from the base.
    /// </remarks>
    public const double HoverBrandWeight = 0.92;

    /// <summary>The active mix, matching <c>--brand-active</c> in <c>tokens.css</c>.</summary>
    public const double ActiveBrandWeight = 0.82;

    /// <summary>
    /// Normalises a caller-supplied colour to <c>#RRGGBB</c> in upper case, or returns
    /// <see langword="false"/> if it is not one.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Exactly six hexadecimal digits behind a <c>#</c>, and nothing else.</b> Three-digit
    /// shorthand, eight-digit alpha, <c>rgb(...)</c> and named colours are all refused — not
    /// because they are unparseable, but because each would have to round-trip through this
    /// column and back into a stylesheet, and a stored value the client cannot predict is a
    /// value the preview and the product disagree about.
    /// </para>
    /// <para>
    /// <b>Trimmed before validation, upper-cased after.</b> <c>" #1d174d "</c> is a paste, not a
    /// typo; <c>#1d174d</c> and <c>#1D174D</c> are the same colour and storing both spellings
    /// would make an idempotent <c>PUT</c> look like a change (BR-9.8).
    /// </para>
    /// </remarks>
    public static bool TryNormalise(string? input, out string normalised)
    {
        normalised = string.Empty;

        if (input is null)
        {
            return false;
        }

        var trimmed = input.Trim();

        if (trimmed.Length != 7 || trimmed[0] != '#')
        {
            return false;
        }

        for (var index = 1; index < trimmed.Length; index++)
        {
            if (!Uri.IsHexDigit(trimmed[index]))
            {
                return false;
            }
        }

        normalised = string.Concat("#", trimmed.AsSpan(1).ToString().ToUpperInvariant());
        return true;
    }

    /// <summary>
    /// Applies the three checks, in order, and reports which one refused the colour.
    /// </summary>
    /// <param name="normalisedBrandColor">
    /// A colour that has already been through <see cref="TryNormalise"/>. A malformed value is a
    /// <c>400 errors/validation</c> and never reaches here.
    /// </param>
    /// <remarks>
    /// <b>The order is part of the contract</b>, because the response names the gate that
    /// refused and the UI says something different for each. Text first, then the derived ramp,
    /// then the page surface — so a colour nobody can read text on is reported as that, rather
    /// than as a colour that is hard to see.
    /// </remarks>
    public static BrandContrastVerdict Evaluate(string normalisedBrandColor)
    {
        ArgumentNullException.ThrowIfNull(normalisedBrandColor);

        var brand = Parse(normalisedBrandColor);
        var white = Parse(ForegroundWhite);
        var ink = Parse(ForegroundInk);
        var surface = Parse(PageSurface);

        var againstWhite = Ratio(brand, white);
        var againstInk = Ratio(brand, ink);

        // THE WINNER IS THE FOREGROUND, and it is also what gets stored as `onBrand`. Picking
        // the better of the two rather than a fixed one is the whole of ADR-012 part 2:
        // hard-coded white looks correct for every dark brand, which is most of the ones anyone
        // tests with.
        var whiteWins = againstWhite >= againstInk;
        var foreground = whiteWins ? white : ink;
        var bestRatio = whiteWins ? againstWhite : againstInk;

        var surfaceRatio = Ratio(brand, surface);

        /* CHECK 2'S TWO DERIVED COLOURS, AND THEY MOVE AWAY FROM THE FOREGROUND.
         *
         * `006`'s ramp lightened on hover unconditionally, which makes a brand dark enough to
         * need white text LESS readable in the state a pointer produces. Measured 2026-09-27
         * across ten colours: it refused `#1570EF` at 3.66, `#4A9E96` at 3.10 and `#2E7D32` at
         * 4.07 — the last being the frozen contract's own example — while accepting only the
         * house navy and pure black, which pass because they are nearly black. **Nobody saw it
         * because the default brand is the one colour the old ramp could not break.**
         *
         * Moving away from the chosen foreground keeps contrast monotonic: a white-text brand
         * darkens on hover, an ink-text brand lightens. Ruled 2026-09-27, and `tokens.css`
         * carries `--brand-away` so the stylesheet and this method derive the same colour. */
        var away = whiteWins ? Black : White;

        var hoverRatio = Ratio(MixOklab(brand, away, HoverBrandWeight), foreground);
        var activeRatio = Ratio(MixOklab(brand, away, ActiveBrandWeight), foreground);
        var rampRatio = Math.Min(hoverRatio, activeRatio);

        var onBrand = whiteWins ? ForegroundWhite : ForegroundInk;

        var refusedBy =
            bestRatio < RequiredTextRatio ? BrandContrastGate.Text
            : rampRatio < RequiredTextRatio ? BrandContrastGate.Hover
            : surfaceRatio < RequiredSurfaceRatio ? BrandContrastGate.Surface
            : (BrandContrastGate?)null;

        return new BrandContrastVerdict(
            RefusedBy: refusedBy,
            OnBrand: onBrand,
            BestContrastRatio: Round(bestRatio),
            RampContrastRatio: Round(rampRatio),
            SurfaceContrastRatio: Round(surfaceRatio));
    }

    /// <summary>
    /// The relative luminance of a colour, WCAG 2.1 §relative-luminance. Exposed because the
    /// acceptance band is <b>computed</b> by the tests from the two candidate foregrounds and
    /// never hard-coded (AC-9).
    /// </summary>
    public static double RelativeLuminance(string normalisedColor) =>
        Luminance(Parse(normalisedColor));

    /// <summary>The WCAG contrast ratio between two normalised colours.</summary>
    public static double ContrastRatio(string first, string second) =>
        Ratio(Parse(first), Parse(second));

    /// <summary>
    /// The <c>color-mix(in oklab, …)</c> result, as a normalised hex string. Exposed so a test
    /// can compare it against what a browser computes for the same declaration.
    /// </summary>
    /// <remarks>
    /// <b>This is the assertion that makes the gate trustworthy</b>, and it was run: Chrome 154
    /// was asked for <c>color-mix(in oklab, X 88%, white)</c> and <c>… 82%, black</c> over ten
    /// colours and returned all twenty values byte-identical to this method. A gate that
    /// computes a different ramp from the one that renders would accept colours whose real
    /// hover state fails, with a green build.
    /// </remarks>
    public static string MixInOklab(string normalisedColor, bool towardWhite, double weight) =>
        Format(MixOklab(Parse(normalisedColor), towardWhite ? White : Black, weight));

    /// <summary>
    /// The colour <c>--brand-hover</c> and <c>--brand-active</c> are mixed toward, given the
    /// foreground the gate chose. <c>"black"</c> or <c>"white"</c> — a CSS keyword, because it
    /// is written straight into <c>--brand-away</c>.
    /// </summary>
    /// <remarks>
    /// <b>The client is told this rather than deriving it.</b> It follows from <c>onBrand</c>,
    /// which follows from the luminance rule, and that rule has exactly one implementation
    /// (Constitution III). A client that computed the direction itself would be one rounding
    /// difference away from mixing the opposite way.
    /// </remarks>
    public static string AwayFrom(string onBrand) =>
        onBrand == ForegroundWhite ? "black" : "white";

    private static readonly Rgb White = new(1d, 1d, 1d);

    private static readonly Rgb Black = new(0d, 0d, 0d);

    /// <summary>
    /// Two decimals, away from zero. The wire carries numbers rather than a preformatted
    /// sentence (contract), and two decimals is what the contract's examples show.
    /// </summary>
    private static double Round(double value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero);

    private static Rgb Parse(string normalisedColor) =>
        new(
            int.Parse(normalisedColor.AsSpan(1, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture) / 255d,
            int.Parse(normalisedColor.AsSpan(3, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture) / 255d,
            int.Parse(normalisedColor.AsSpan(5, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture) / 255d);

    private static string Format(Rgb colour) =>
        string.Create(
            CultureInfo.InvariantCulture,
            $"#{Channel(colour.R):X2}{Channel(colour.G):X2}{Channel(colour.B):X2}");

    private static int Channel(double value) =>
        (int)Math.Clamp(Math.Round(value * 255d, MidpointRounding.AwayFromZero), 0d, 255d);

    private static double Ratio(Rgb first, Rgb second)
    {
        var a = Luminance(first);
        var b = Luminance(second);

        return a >= b
            ? (a + 0.05d) / (b + 0.05d)
            : (b + 0.05d) / (a + 0.05d);
    }

    private static double Luminance(Rgb colour) =>
        (0.2126d * ToLinear(colour.R))
        + (0.7152d * ToLinear(colour.G))
        + (0.0722d * ToLinear(colour.B));

    private static double ToLinear(double channel) =>
        channel <= 0.04045d
            ? channel / 12.92d
            : Math.Pow((channel + 0.055d) / 1.055d, 2.4d);

    private static double ToSrgb(double linear) =>
        linear <= 0.0031308d
            ? linear * 12.92d
            : (1.055d * Math.Pow(linear, 1d / 2.4d)) - 0.055d;

    /// <summary>
    /// Interpolates two colours in OKLab, which is what <c>color-mix(in oklab, A p%, B)</c> does.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Not a shortcut through sRGB or HSL.</b> ADR-012 part 1 is that a brand is a ramp
    /// derived in oklab, and the failure mode of getting it wrong is that nothing errors: an HSL
    /// ramp renders, it just renders muddy for some hues and oversaturated for others. Here the
    /// consequence is sharper — a ramp computed differently from the stylesheet's means this gate
    /// accepts a colour whose real hover state fails, or refuses one whose real hover state is
    /// fine, and in both cases the browser and the server disagree with a green build.
    /// </para>
    /// <para>
    /// <b>Out-of-gamut results are clipped, not gamut-mapped.</b> CSS Color 4 specifies a
    /// chroma-reduction mapping for a mix that lands outside sRGB; this clamps each channel
    /// instead. The two agree for every mix between an in-gamut colour and pure white or pure
    /// black, which is the only thing this ramp does — a point on the line between two in-gamut
    /// colours is in gamut, so nothing here is ever out of it. <b>Stated rather than assumed</b>,
    /// because the day someone adds a mix toward a saturated colour the difference becomes real.
    /// </para>
    /// </remarks>
    private static Rgb MixOklab(Rgb first, Rgb second, double firstWeight)
    {
        var a = ToOklab(first);
        var b = ToOklab(second);

        return FromOklab(new Oklab(
            (a.L * firstWeight) + (b.L * (1d - firstWeight)),
            (a.A * firstWeight) + (b.A * (1d - firstWeight)),
            (a.B * firstWeight) + (b.B * (1d - firstWeight))));
    }

    // Björn Ottosson's sRGB↔OKLab matrices, which is what browsers implement.
    private static Oklab ToOklab(Rgb colour)
    {
        var r = ToLinear(colour.R);
        var g = ToLinear(colour.G);
        var b = ToLinear(colour.B);

        var l = Math.Cbrt((0.4122214708d * r) + (0.5363325363d * g) + (0.0514459929d * b));
        var m = Math.Cbrt((0.2119034982d * r) + (0.6806995451d * g) + (0.1073969566d * b));
        var s = Math.Cbrt((0.0883024619d * r) + (0.2817188376d * g) + (0.6299787005d * b));

        return new Oklab(
            (0.2104542553d * l) + (0.7936177850d * m) - (0.0040720468d * s),
            (1.9779984951d * l) - (2.4285922050d * m) + (0.4505937099d * s),
            (0.0259040371d * l) + (0.7827717662d * m) - (0.8086757660d * s));
    }

    private static Rgb FromOklab(Oklab colour)
    {
        var l = colour.L + (0.3963377774d * colour.A) + (0.2158037573d * colour.B);
        var m = colour.L - (0.1055613458d * colour.A) - (0.0638541728d * colour.B);
        var s = colour.L - (0.0894841775d * colour.A) - (1.2914855480d * colour.B);

        l = l * l * l;
        m = m * m * m;
        s = s * s * s;

        return new Rgb(
            Math.Clamp(ToSrgb((4.0767416621d * l) - (3.3077115913d * m) + (0.2309699292d * s)), 0d, 1d),
            Math.Clamp(ToSrgb((-1.2684380046d * l) + (2.6097574011d * m) - (0.3413193965d * s)), 0d, 1d),
            Math.Clamp(ToSrgb((-0.0041960863d * l) - (0.7034186147d * m) + (1.7076147010d * s)), 0d, 1d));
    }

    private readonly record struct Rgb(double R, double G, double B);

    private readonly record struct Oklab(double L, double A, double B);
}
