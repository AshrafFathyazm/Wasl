using FluentAssertions;
using Wasl.Domain.Settings;

namespace Wasl.Domain.Tests.Settings;

/// <summary>
/// The settings entity. `022`.
/// </summary>
public sealed class OrganizationSettingsTests
{
    [Fact]
    public void The_default_row_is_the_house_navy_with_white_text_and_a_light_sidebar()
    {
        var settings = OrganizationSettings.CreateDefault();

        settings.Id.Should().Be(OrganizationSettings.SingletonId);
        settings.BrandColor.Should().Be("#1D174D");
        settings.OnBrand.Should().Be(BrandContrast.ForegroundWhite);
        settings.SidebarMode.Should().Be(SidebarMode.Light);
    }

    /// <summary>
    /// The seeded default must itself pass the gate, or the product ships in a state its own
    /// settings screen would refuse to let anyone re-enter.
    /// </summary>
    [Fact]
    public void The_seeded_default_passes_the_gate_it_will_be_judged_by()
    {
        var verdict = BrandContrast.Evaluate(OrganizationSettings.DefaultBrandColor);

        verdict.Accepted.Should().BeTrue();
        verdict.OnBrand.Should().Be(OrganizationSettings.CreateDefault().OnBrand);
    }

    [Fact]
    public void A_change_stores_the_colour_and_the_computed_foreground()
    {
        var settings = OrganizationSettings.CreateDefault();

        var changed = settings.ChangeBranding("#4A9E96", SidebarMode.Brand);

        changed.Should().BeTrue();
        settings.BrandColor.Should().Be("#4A9E96");
        settings.SidebarMode.Should().Be(SidebarMode.Brand);

        // The INK foreground, computed — not white, which is what a hard-coded implementation
        // would store and which would be unreadable here (ADR-012 part 2).
        settings.OnBrand.Should().Be(BrandContrast.ForegroundInk);
    }

    /// <summary>
    /// A refused colour changes nothing. Asserted field by field, because an entity that threw
    /// <i>after</i> assigning would leave a rolled-back transaction as the only thing standing
    /// between a refused colour and the database.
    /// </summary>
    [Theory]
    [InlineData("#808080", BrandContrastGate.Text)]
    [InlineData("#FFF59D", BrandContrastGate.Surface)]
    public void A_refused_colour_is_not_stored(string brandColor, BrandContrastGate gate)
    {
        var settings = OrganizationSettings.CreateDefault();

        var act = () => settings.ChangeBranding(brandColor, SidebarMode.Dark);

        act.Should().Throw<InaccessibleBrandColorException>()
            .Which.Gate.Should().Be(gate);

        settings.BrandColor.Should().Be(OrganizationSettings.DefaultBrandColor);
        settings.OnBrand.Should().Be(BrandContrast.ForegroundWhite);
        settings.SidebarMode.Should().Be(SidebarMode.Light);
    }

    /// <summary>
    /// The refusal carries the measurements the screen renders, and they are numbers.
    /// </summary>
    [Fact]
    public void A_refusal_carries_machine_readable_ratios_and_no_sentence()
    {
        var settings = OrganizationSettings.CreateDefault();

        var act = () => settings.ChangeBranding("#808080", SidebarMode.Light);

        var exception = act.Should().Throw<InaccessibleBrandColorException>().Which;

        exception.MachineExtensions["refusedBy"].Should().Be("text");
        exception.MachineExtensions["requiredContrastRatio"].Should().Be(4.5d);
        exception.MachineExtensions["requiredSurfaceContrastRatio"].Should().Be(3.0d);

        // Numbers, not preformatted strings — Arabic formats numbers differently, so the client
        // formats them in the active locale (BR-8.7, AC-8).
        exception.MachineExtensions["bestContrastRatio"].Should().BeOfType<double>();
        exception.MachineExtensions["surfaceContrastRatio"].Should().BeOfType<double>();

        // The field-level message is a KEY, never a sentence (ADR-007 §5).
        exception.FieldErrors.Should().ContainKey(InaccessibleBrandColorException.Field);
        exception.FieldErrors[InaccessibleBrandColorException.Field].Should()
            .ContainSingle().Which.Should().StartWith("Error.Branding.");
    }

    /// <summary>
    /// Each gate gets its own sentence, because they are different problems and merged advice
    /// is wrong for two of the three.
    /// </summary>
    [Fact]
    public void The_three_gates_carry_three_different_message_keys()
    {
        var keys = new[] { "#808080", "#FFF59D" }
            .Select(colour =>
            {
                try
                {
                    OrganizationSettings.CreateDefault().ChangeBranding(colour, SidebarMode.Light);
                    return null;
                }
                catch (InaccessibleBrandColorException exception)
                {
                    return exception.MessageKey;
                }
            })
            .ToArray();

        keys.Should().OnlyHaveUniqueItems();
        keys.Should().NotContainNulls();
    }

    /// <summary>
    /// BR-9.8 — an identical submit changes nothing, and the caller is told so.
    /// </summary>
    [Fact]
    public void Resubmitting_the_same_values_reports_no_change()
    {
        var settings = OrganizationSettings.CreateDefault();

        settings.ChangeBranding("#1570EF", SidebarMode.Brand).Should().BeTrue();
        settings.ChangeBranding("#1570EF", SidebarMode.Brand).Should().BeFalse();
    }

    /// <summary>
    /// Casing is not a change: <c>#1570ef</c> and <c>#1570EF</c> are one colour, and treating
    /// them as different would make an idempotent <c>PUT</c> look like an edit.
    /// </summary>
    [Fact]
    public void A_different_spelling_of_the_same_colour_is_not_a_change()
    {
        var settings = OrganizationSettings.CreateDefault();
        settings.ChangeBranding("#1570EF", SidebarMode.Light);

        BrandContrast.TryNormalise("#1570ef", out var normalised).Should().BeTrue();

        settings.ChangeBranding(normalised, SidebarMode.Light).Should().BeFalse();
    }

    [Fact]
    public void Only_the_sidebar_mode_changing_is_still_a_change()
    {
        var settings = OrganizationSettings.CreateDefault();

        settings.ChangeBranding(OrganizationSettings.DefaultBrandColor, SidebarMode.Dark)
            .Should().BeTrue();
    }
}
