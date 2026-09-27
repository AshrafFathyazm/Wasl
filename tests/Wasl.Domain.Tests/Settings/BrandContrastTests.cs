using FluentAssertions;
using Wasl.Domain.Settings;
using Xunit.Abstractions;

namespace Wasl.Domain.Tests.Settings;

/// <summary>
/// The contrast gate. `022` AC-7 … AC-13.
/// </summary>
/// <remarks>
/// <b>This is where the feature's risk lives.</b> Everything else in `022` is a row, two
/// endpoints and a screen; the part that can be wrong while looking right is the arithmetic —
/// an oklab ramp computed differently from the stylesheet's would accept colours whose real
/// hover state fails, with a green build.
/// </remarks>
public sealed class BrandContrastTests(ITestOutputHelper output)
{
    /* AC-11. FOUR DISTINCT VERDICTS, AT LEAST ONE ROW EACH.
     *
     * A fixture of only pale and dark colours never reaches the refusal path at all, so the
     * refusal code is never executed and every test still passes. These four are named in
     * `spec.md` and each exercises a different branch. */
    public static TheoryData<string, string, BrandContrastGate?> Fixture => new()
    {
        // colour      expected onBrand              expected refusal (null = accepted)
        { "#1D174D", BrandContrast.ForegroundWhite, null },
        { "#1570EF", BrandContrast.ForegroundWhite, null },
        { "#4A9E96", BrandContrast.ForegroundInk, null },
        { "#000000", BrandContrast.ForegroundWhite, null },
        { "#2E7D32", BrandContrast.ForegroundWhite, null },
        { "#808080", BrandContrast.ForegroundInk, BrandContrastGate.Text },
        { "#FFF59D", BrandContrast.ForegroundInk, BrandContrastGate.Surface },
        { "#FFFFFF", BrandContrast.ForegroundInk, BrandContrastGate.Surface },
        { "#FFC107", BrandContrast.ForegroundInk, BrandContrastGate.Surface },
    };

    [Theory]
    [MemberData(nameof(Fixture))]
    public void The_gate_returns_the_expected_verdict(
        string brandColor,
        string expectedOnBrand,
        BrandContrastGate? expectedRefusal)
    {
        var verdict = BrandContrast.Evaluate(brandColor);

        verdict.OnBrand.Should().Be(expectedOnBrand);
        verdict.RefusedBy.Should().Be(expectedRefusal);
        verdict.Accepted.Should().Be(expectedRefusal is null);
    }

    /// <summary>AC-10, asserted per row rather than in aggregate.</summary>
    [Theory]
    [MemberData(nameof(Fixture))]
    public void An_accepted_colour_carries_the_better_foreground_at_or_above_the_threshold(
        string brandColor,
        string expectedOnBrand,
        BrandContrastGate? expectedRefusal)
    {
        _ = expectedOnBrand;

        var verdict = BrandContrast.Evaluate(brandColor);

        if (expectedRefusal is not null)
        {
            return;
        }

        var againstWhite = BrandContrast.ContrastRatio(brandColor, BrandContrast.ForegroundWhite);
        var againstInk = BrandContrast.ContrastRatio(brandColor, BrandContrast.ForegroundInk);

        // The WINNER, recomputed here from the two candidates rather than read off the verdict —
        // otherwise this asserts that the method agrees with itself.
        var expectedWinner = againstWhite >= againstInk
            ? BrandContrast.ForegroundWhite
            : BrandContrast.ForegroundInk;

        verdict.OnBrand.Should().Be(expectedWinner);
        verdict.BestContrastRatio.Should().BeGreaterThanOrEqualTo(BrandContrast.RequiredTextRatio);
    }

    /// <summary>
    /// AC-13. The gate is applied to the derived ramp, not to the base colour alone.
    /// </summary>
    /// <remarks>
    /// <b>This criterion exists because nobody hovers during review</b>, and it was not
    /// hypothetical: measured on 2026-09-27, `006`'s original ramp — which lightened on hover
    /// unconditionally — refused `#1570EF` at 3.66, `#4A9E96` at 3.10 and `#2E7D32` at 4.07,
    /// the last being the frozen contract's own example. The ramp direction was corrected;
    /// this test is what stops it reverting.
    /// </remarks>
    [Theory]
    [MemberData(nameof(Fixture))]
    public void An_accepted_colours_hover_and_active_states_are_also_readable(
        string brandColor,
        string expectedOnBrand,
        BrandContrastGate? expectedRefusal)
    {
        _ = expectedOnBrand;

        if (expectedRefusal is not null)
        {
            return;
        }

        var verdict = BrandContrast.Evaluate(brandColor);

        verdict.RampContrastRatio.Should().BeGreaterThanOrEqualTo(
            BrandContrast.RequiredTextRatio,
            "a state a pointer produces is still text on a background");
    }

    /// <summary>
    /// The ramp moves AWAY from the chosen foreground, which is what keeps contrast monotonic.
    /// </summary>
    /// <remarks>
    /// Asserted as a property over the fixture rather than as fixed hex values, because the
    /// property is the rule and the hex values are its output. A future weight change should
    /// not turn this red.
    /// </remarks>
    [Theory]
    [MemberData(nameof(Fixture))]
    public void The_ramp_never_moves_toward_the_foreground(
        string brandColor,
        string expectedOnBrand,
        BrandContrastGate? expectedRefusal)
    {
        _ = expectedRefusal;

        var verdict = BrandContrast.Evaluate(brandColor);
        var awayIsWhite = expectedOnBrand == BrandContrast.ForegroundInk;

        var hover = BrandContrast.MixInOklab(
            brandColor, awayIsWhite, BrandContrast.HoverBrandWeight);
        var active = BrandContrast.MixInOklab(
            brandColor, awayIsWhite, BrandContrast.ActiveBrandWeight);

        var baseRatio = BrandContrast.ContrastRatio(brandColor, verdict.OnBrand);

        BrandContrast.ContrastRatio(hover, verdict.OnBrand)
            .Should().BeGreaterThanOrEqualTo(baseRatio - 0.001d);
        BrandContrast.ContrastRatio(active, verdict.OnBrand)
            .Should().BeGreaterThanOrEqualTo(baseRatio - 0.001d);
    }

    /* THE OKLAB MIX, CHECKED AGAINST THE THING THAT ACTUALLY RENDERS.
     *
     * `CLAUDE.md`: verify a measurement with something below it. These are not values this
     * implementation produced and then had written down — they were read out of Chrome 154 on
     * 2026-09-27 by painting `color-mix(in oklab, X 88%, white)` onto a 1×1 canvas and sampling
     * the pixel, and all twenty matched. A first attempt read `getComputedStyle().color`, which
     * returns `oklab(0.647882 0.0000295174 0.0000129533)` — a number regex over that mis-slots
     * every channel and reports confident nonsense, the same shape of failure `037` recorded for
     * SVG arc flags.
     *
     * The weights here are 88/82 — `006`'s ORIGINAL ramp — deliberately. This test is about the
     * colour-space arithmetic agreeing with a browser, not about which direction `022` mixes,
     * so it must not move when the direction does. */
    public static TheoryData<string, string, string> BrowserMeasured => new()
    {
        { "#1D174D", "#323162", "#140F39" },
        { "#1570EF", "#3A83F3", "#0D54B7" },
        { "#4A9E96", "#63A9A2", "#377872" },
        { "#808080", "#8E8E8E", "#616161" },
        { "#FFF59D", "#FFF6AA", "#C4BC77" },
        { "#FFFFFF", "#FFFFFF", "#C4C4C4" },
        { "#000000", "#060606", "#000000" },
        { "#2E7D32", "#4A8C4B", "#215E24" },
        { "#FF6B00", "#FF803D", "#C45000" },
        { "#FFC107", "#FFC94A", "#C49404" },
    };

    [Theory]
    [MemberData(nameof(BrowserMeasured))]
    public void The_oklab_mix_matches_what_a_browser_computes(
        string brandColor,
        string chromeHover,
        string chromeActive)
    {
        BrandContrast.MixInOklab(brandColor, towardWhite: true, 0.88d)
            .Should().Be(chromeHover);

        BrandContrast.MixInOklab(brandColor, towardWhite: false, 0.82d)
            .Should().Be(chromeActive);
    }

    /// <summary>
    /// AC-9. The band is <b>computed</b> from the two candidate foregrounds and printed, never
    /// hard-coded in an assertion.
    /// </summary>
    /// <remarks>
    /// <b>So that changing <c>--Text-Primary</c> is a re-run rather than a rewrite.</b> A test
    /// asserting "luminance between 0.18 and 0.36 is refused" would be asserting today's ink
    /// colour, and it would keep passing for the wrong reason after someone changed it.
    /// </remarks>
    [Fact]
    public void The_refusal_band_is_derived_from_the_candidate_foregrounds()
    {
        var whiteLuminance = BrandContrast.RelativeLuminance(BrandContrast.ForegroundWhite);
        var inkLuminance = BrandContrast.RelativeLuminance(BrandContrast.ForegroundInk);

        // A brand passes against WHITE when it is dark enough, and against INK when it is light
        // enough. Both boundaries fall out of the ratio equation.
        var darkestThatFailsWhite =
            ((whiteLuminance + 0.05d) / BrandContrast.RequiredTextRatio) - 0.05d;
        var lightestThatFailsInk =
            (BrandContrast.RequiredTextRatio * (inkLuminance + 0.05d)) - 0.05d;

        output.WriteLine($"white luminance            {whiteLuminance:F6}");
        output.WriteLine($"ink   luminance            {inkLuminance:F6}");
        output.WriteLine($"a brand LIGHTER than       {darkestThatFailsWhite:F6} fails against white");
        output.WriteLine($"a brand DARKER  than       {lightestThatFailsInk:F6} fails against ink");
        output.WriteLine(
            $"=> the TEXT gate refuses luminance in ({darkestThatFailsWhite:F6}, "
            + $"{lightestThatFailsInk:F6})");

        // The band must be non-empty, or no colour could ever be refused by the text gate and
        // AC-11's `#808080` row would be unreachable.
        darkestThatFailsWhite.Should().BeLessThan(lightestThatFailsInk);

        // And `#808080` must sit inside it — which is what makes the fixture row prove something
        // rather than coincide with one.
        var grey = BrandContrast.RelativeLuminance("#808080");

        grey.Should().BeInRange(darkestThatFailsWhite, lightestThatFailsInk);
        output.WriteLine($"#808080 luminance          {grey:F6}  — inside the band");
    }

    /* AC-7. SIX MALFORMED INPUTS, one table. Each is a shape somebody will actually paste. */
    [Theory]
    [InlineData("#ABC")]
    [InlineData("1D174D")]
    [InlineData("#1D174DFF")]
    [InlineData("rgb(29,23,77)")]
    [InlineData("#GGGGGG")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void A_malformed_colour_is_refused(string? input)
    {
        BrandContrast.TryNormalise(input, out var normalised).Should().BeFalse();
        normalised.Should().BeEmpty();
    }

    [Theory]
    [InlineData("#1d174d", "#1D174D")]
    [InlineData(" #1D174D ", "#1D174D")]
    [InlineData("#AbCdEf", "#ABCDEF")]
    public void A_well_formed_colour_is_trimmed_and_upper_cased(string input, string expected)
    {
        BrandContrast.TryNormalise(input, out var normalised).Should().BeTrue();
        normalised.Should().Be(expected);
    }

    /// <summary>
    /// The direction the stylesheet must mix in follows from the foreground, and the server
    /// states it rather than letting the client derive it.
    /// </summary>
    [Theory]
    [InlineData("#FFFFFF", "black")]
    [InlineData("#0D2626", "white")]
    public void The_ramp_direction_follows_the_chosen_foreground(string onBrand, string expected) =>
        BrandContrast.AwayFrom(onBrand).Should().Be(expected);

    /// <summary>
    /// `#000000` is the easiest possible case, which is exactly why testing with it proves
    /// nothing on its own — recorded so nobody reads the fixture as "we tested black, it works".
    /// </summary>
    [Fact]
    public void The_darkest_possible_brand_is_the_easiest_case()
    {
        var verdict = BrandContrast.Evaluate("#000000");

        verdict.Accepted.Should().BeTrue();
        verdict.OnBrand.Should().Be(BrandContrast.ForegroundWhite);
        verdict.BestContrastRatio.Should().Be(21d);
        verdict.SurfaceContrastRatio.Should().Be(21d);
    }

    /// <summary>
    /// Every ratio is reported whichever gate refused, so a screen can explain the verdict
    /// rather than only report it.
    /// </summary>
    [Fact]
    public void A_refusal_still_carries_all_three_measurements()
    {
        var verdict = BrandContrast.Evaluate("#FFF59D");

        verdict.RefusedBy.Should().Be(BrandContrastGate.Surface);
        verdict.BestContrastRatio.Should().BeGreaterThan(0d);
        verdict.RampContrastRatio.Should().BeGreaterThan(0d);
        verdict.SurfaceContrastRatio.Should().BeGreaterThan(0d);
    }
}
