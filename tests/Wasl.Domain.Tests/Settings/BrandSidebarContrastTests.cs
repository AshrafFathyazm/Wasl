using System.Globalization;
using System.Text.RegularExpressions;
using FluentAssertions;
using Wasl.Domain.Settings;
using Xunit.Abstractions;

namespace Wasl.Domain.Tests.Settings;

/// <summary>
/// `022` AC-15. Every TEXT role in the Brand sidebar reaches 4.5:1 against <c>--brand</c>, for
/// every accepted colour.
/// </summary>
/// <remarks>
/// <para>
/// <b>Written because AC-15 had been recorded PARTIAL on a number nobody had measured, and the
/// measurement disproved it.</b> The Brand preset set
/// <c>--sidebar-muted: color-mix(in oklab, var(--on-brand) 72%, transparent)</c>, with a comment
/// saying it "stays high enough to be text". Measured over every colour the gate accepts in a
/// 16-step sweep of the sRGB cube: <b>1079 of 1800 accepted brands put that text below 4.5:1,
/// worst <c>#EE0000</c> at 2.72:1.</b>
/// </para>
/// <para>
/// <b>It could not be tuned, and</b>
/// <see cref="No_reduced_opacity_clears_the_threshold_for_a_brand_at_the_boundary"/> <b>is the
/// proof.</b> The gate accepts a brand whose full-strength foreground reaches 4.5:1, some brands
/// reach it with nothing to spare, and any alpha below 1 blends the text toward the surface it
/// sits on. AC-15 already prescribed the fix in words — mixed foregrounds for borders and
/// dividers only — and the first implementation used one for text.
/// </para>
/// <para>
/// <b>Composited in sRGB, because that is what a browser does for alpha.</b> The mix produces a
/// colour with alpha; painting it over an opaque surface is ordinary source-over compositing in
/// the output space, so the composite here is the colour a screen shows.
/// </para>
/// </remarks>
public sealed class BrandSidebarContrastTests(ITestOutputHelper output)
{
    /// <summary>
    /// Every colour from the gate's fixture that the gate ACCEPTS, plus a sweep of the cube.
    /// </summary>
    /// <remarks>
    /// The fixture alone is five accepted colours chosen to exercise the gate's branches, not to
    /// find the worst case for a different rule. The colours nearest the acceptance boundary are
    /// where a derived text colour is most likely to fall short, and nobody picks those by hand.
    /// </remarks>
    public static IReadOnlyList<string> AcceptedColours()
    {
        var accepted = new List<string> { "#1D174D", "#1570EF", "#4A9E96", "#000000", "#2E7D32" };

        for (var r = 0; r <= 255; r += 17)
        {
            for (var g = 0; g <= 255; g += 17)
            {
                for (var b = 0; b <= 255; b += 17)
                {
                    var colour = string.Create(CultureInfo.InvariantCulture, $"#{r:X2}{g:X2}{b:X2}");

                    if (BrandContrast.Evaluate(colour).Accepted)
                    {
                        accepted.Add(colour);
                    }
                }
            }
        }

        return accepted.Distinct().ToList();
    }

    /// <summary>
    /// The guard: in the Brand preset, every TEXT token is the accepted foreground at full
    /// strength, read from the stylesheet that ships.
    /// </summary>
    /// <remarks>
    /// <b>It reads <c>tokens.css</c>, not a constant in this file.</b> A constant would be a second
    /// statement of the preset that could drift from the first — which is precisely how the 72%
    /// survived: the comment beside it and the arithmetic disagreed, and nothing compared them.
    /// </remarks>
    [Fact]
    public void Every_text_token_in_the_brand_preset_is_the_full_strength_foreground()
    {
        var preset = BrandPresetBlock();

        Declaration(preset, "--sidebar-fg").Should().Be("var(--on-brand)");
        Declaration(preset, "--sidebar-muted").Should().Be(
            "var(--on-brand)",
            "any opacity below 100% fails AC-15 for a brand at the acceptance boundary — "
            + "see No_reduced_opacity_clears_the_threshold_for_a_brand_at_the_boundary");
    }

    /// <summary>
    /// With the foreground at full strength, every accepted brand clears 4.5:1 — by the gate's own
    /// arithmetic, re-measured here so the claim is a result and not an inference.
    /// </summary>
    [Fact]
    public void The_full_strength_foreground_clears_the_threshold_on_every_accepted_brand()
    {
        var accepted = AcceptedColours();

        // `008`'s rule: a sweep that found nothing must not report success over an empty set.
        accepted.Should().HaveCountGreaterThan(50);

        var worst = accepted
            .Select(brand => (brand, ratio: BrandContrast.ContrastRatio(
                BrandContrast.Evaluate(brand).OnBrand, brand)))
            .OrderBy(entry => entry.ratio)
            .First();

        output.WriteLine($"accepted brands measured: {accepted.Count}");
        output.WriteLine($"worst full-strength text ratio: {worst.brand} at {worst.ratio:F2}:1");

        worst.ratio.Should().BeGreaterThanOrEqualTo(BrandContrast.RequiredTextRatio);
    }

    /// <summary>
    /// Why no percentage was chosen instead: for the accepted brand with the least headroom, every
    /// opacity below 100% fails.
    /// </summary>
    /// <remarks>
    /// Kept as a test rather than a comment, because the obvious next move for anyone who finds
    /// muted text "too loud" is to put 85% back — and this goes red naming the brand it breaks.
    /// </remarks>
    [Fact]
    public void No_reduced_opacity_clears_the_threshold_for_a_brand_at_the_boundary()
    {
        var boundary = AcceptedColours()
            .Select(brand => (brand, onBrand: BrandContrast.Evaluate(brand).OnBrand))
            .OrderBy(entry => BrandContrast.ContrastRatio(entry.onBrand, entry.brand))
            .First();

        output.WriteLine(
            $"the accepted brand with the least headroom: {boundary.brand} "
            + $"({BrandContrast.ContrastRatio(boundary.onBrand, boundary.brand):F2}:1 at full strength)");

        foreach (var alpha in new[] { 0.99, 0.95, 0.90, 0.85, 0.72 })
        {
            var ratio = BrandContrast.ContrastRatio(
                Composite(boundary.onBrand, boundary.brand, alpha), boundary.brand);

            output.WriteLine($"  at {alpha:P0}: {ratio:F2}:1");

            ratio.Should().BeLessThan(
                BrandContrast.RequiredTextRatio,
                $"{alpha:P0} of the foreground over {boundary.brand} is the case that rules out "
                + "a reduced-opacity text token");
        }
    }

    /// <summary>
    /// The border, measured and printed — NOT asserted. Spec Q-I.
    /// </summary>
    /// <remarks>
    /// AC-15 says borders are "held to 3:1". A 20% border cannot reach 3:1 against the surface it
    /// sits on, and neither does the Light sidebar's <c>--border-subtle</c> on white, which the
    /// product has shipped with since `023`. Holding the Brand preset to a standard the default
    /// has never met is a question for the product owner, so the figure is recorded and the
    /// criterion is not silently rewritten to fit it.
    /// </remarks>
    [Fact]
    public void The_brand_border_contrast_is_measured_for_the_open_question()
    {
        var ratios = AcceptedColours()
            .Select(brand => BrandContrast.ContrastRatio(
                Composite(BrandContrast.Evaluate(brand).OnBrand, brand, 0.20), brand))
            .ToList();

        output.WriteLine(
            $"20% border against the brand: best {ratios.Max():F2}:1, worst {ratios.Min():F2}:1");

        ratios.Should().NotBeEmpty();
    }

    /// <summary>Source-over, per sRGB channel.</summary>
    private static string Composite(string foreground, string background, double alpha)
    {
        static (double R, double G, double B) Parse(string hex) =>
            (Convert.ToInt32(hex[1..3], 16) / 255d,
             Convert.ToInt32(hex[3..5], 16) / 255d,
             Convert.ToInt32(hex[5..7], 16) / 255d);

        static int Channel(double value) =>
            (int)Math.Clamp(Math.Round(value * 255d, MidpointRounding.AwayFromZero), 0d, 255d);

        var f = Parse(foreground);
        var b = Parse(background);

        return string.Create(
            CultureInfo.InvariantCulture,
            $"#{Channel((f.R * alpha) + (b.R * (1 - alpha))):X2}"
            + $"{Channel((f.G * alpha) + (b.G * (1 - alpha))):X2}"
            + $"{Channel((f.B * alpha) + (b.B * (1 - alpha))):X2}");
    }

    /// <summary>The body of the <c>[data-sidebar-mode='brand']</c> rule, comments removed.</summary>
    private static string BrandPresetBlock()
    {
        var css = File.ReadAllText(Path.Combine(
            RepositoryRoot(), "src", "wasl-web", "src", "styles", "tokens.css"));

        // Comments first: the block's own prose quotes the old `color-mix` declaration.
        css = Regex.Replace(css, @"/\*.*?\*/", " ", RegexOptions.Singleline);

        var match = Regex.Match(
            css,
            @"\[data-sidebar-mode='brand'\]\s*\{(?<body>[^}]*)\}",
            RegexOptions.Singleline);

        match.Success.Should().BeTrue("tokens.css must declare the Brand sidebar preset");

        return match.Groups["body"].Value;
    }

    private static string Declaration(string block, string property)
    {
        var match = Regex.Match(
            block,
            Regex.Escape(property) + @"\s*:\s*(?<value>[^;]+);",
            RegexOptions.Singleline);

        match.Success.Should().BeTrue($"the Brand preset must declare {property}");

        return Regex.Replace(match.Groups["value"].Value.Trim(), @"\s+", " ");
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null
            && !directory.EnumerateFiles("*.sln").Any()
            && !directory.EnumerateFiles("*.slnx").Any())
        {
            directory = directory.Parent;
        }

        directory.Should().NotBeNull("the repository root must be findable from the test binary");

        return directory!.FullName;
    }
}
