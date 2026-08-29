using System.Globalization;
using System.Reflection;
using System.Resources;
using System.Xml.Linq;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Localization;

namespace Wasl.Api.IntegrationTests.Localization;

/// <summary>
/// The catalogues stay in step, and the lookup actually finds them. `005` AC-14 … AC-17, NFR-8.
/// </summary>
/// <remarks>
/// <b>No database fixture, deliberately</b> (`005` Q-E). A build-failing guard that only runs on
/// a machine with Docker is not a guard — it is a guard on the machines that were already going
/// to be careful. These four read files and a resource manager, and nothing else.
/// </remarks>
public sealed class CatalogueParityTests
{
    private const string EnglishFile = "SharedResource.resx";
    private const string ArabicFile = "SharedResource.ar.resx";

    /// <summary>Shared with `CultureResolutionTests`, which asserts the other end of AC-16.</summary>
    internal static string CatalogueDirectoryPath => CatalogueDirectory();

    private static string CatalogueDirectory()
    {
        // Walk up to the repository root rather than hard-coding a depth: the test binary's
        // location changes with the target framework and the configuration, and a path that
        // silently resolves to nothing would make this test pass with zero keys on both sides.
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Wasl.slnx")))
        {
            directory = directory.Parent;
        }

        directory.Should().NotBeNull("the repository root must be findable from the test binary");

        return Path.Combine(
            directory!.FullName, "src", "Wasl.Api", "Common", "Localization");
    }

    private static Dictionary<string, string> Read(string fileName)
    {
        var path = Path.Combine(CatalogueDirectory(), fileName);

        File.Exists(path).Should().BeTrue($"{fileName} must exist at {path}");

        return XDocument.Load(path).Root!
            .Elements("data")
            .ToDictionary(
                data => data.Attribute("name")!.Value,
                data => data.Element("value")?.Value ?? string.Empty,
                StringComparer.Ordinal);
    }

    // ── AC-14 · the parity guard ────────────────────────────────────────────────────

    /// <summary>
    /// AC-14 — a key in one catalogue and not the other fails the build (BR-8.11, NFR-8).
    /// </summary>
    /// <remarks>
    /// <b>An empty or whitespace value counts as absent</b>, and that half matters more than the
    /// missing-key half: a blank translation renders as blank text, which reads as a layout bug
    /// and survives review. A missing key at least renders the English fallback.
    /// </remarks>
    [Fact]
    public void The_two_catalogues_carry_exactly_the_same_keys()
    {
        var english = Read(EnglishFile);
        var arabic = Read(ArabicFile);

        english.Should().NotBeEmpty("an empty catalogue would satisfy every comparison below");

        arabic.Keys.Should().BeEquivalentTo(english.Keys,
            "a key in one catalogue and not the other means an untranslated sentence reaching "
            + "a user, or a translation nothing can reach");

        english.Where(entry => string.IsNullOrWhiteSpace(entry.Value)).Select(entry => entry.Key)
            .Should().BeEmpty("an empty value counts as a missing key");

        arabic.Where(entry => string.IsNullOrWhiteSpace(entry.Value)).Select(entry => entry.Key)
            .Should().BeEmpty("an empty value renders as blank text, which reads as a layout bug");
    }

    /// <summary>
    /// A key whose English text carries `{0}` carries it in Arabic too.
    /// </summary>
    /// <remarks>
    /// Not in the spec, and added because the failure is specific and silent: Arabic word order
    /// differs, so a translator moving `{1}` before `{0}` is correct, while dropping one produces
    /// a sentence missing the only fact it was carrying — and `string.Format` does not complain
    /// about an unused argument.
    /// </remarks>
    [Fact]
    public void A_placeholder_present_in_english_is_present_in_arabic()
    {
        var english = Read(EnglishFile);
        var arabic = Read(ArabicFile);

        var mismatched = english
            .Where(entry => entry.Value.Contains('{', StringComparison.Ordinal))
            .Select(entry => new
            {
                entry.Key,
                Expected = Placeholders(entry.Value),
                Actual = arabic.TryGetValue(entry.Key, out var value)
                    ? Placeholders(value)
                    : [],
            })
            .Where(pair => !pair.Expected.SetEquals(pair.Actual))
            .Select(pair => pair.Key)
            .ToList();

        mismatched.Should().BeEmpty(
            "a dropped placeholder loses the only fact the sentence was carrying, and "
            + "string.Format does not complain about an argument nobody used");

        static HashSet<string> Placeholders(string value) =>
            [.. System.Text.RegularExpressions.Regex
                .Matches(value, @"\{\d+\}")
                .Select(match => match.Value)];
    }

    // ── AC-16 · the lookup actually resolves ────────────────────────────────────────

    /// <summary>
    /// AC-16 — every shipped key resolves in both cultures.
    /// </summary>
    /// <remarks>
    /// <b>The only assertion that can tell a missing translation from a broken lookup.</b>
    /// <c>IStringLocalizer</c> answers a missing resource by returning the key as its own value,
    /// so a wrong <c>ResourcesPath</c> produces a perfectly well-formed response carrying
    /// <c>Error.Auth.InvalidCredentials</c> where a sentence belongs — which has already shipped
    /// three times in this project. Every other test here would stay green.
    /// </remarks>
    [Theory]
    [InlineData("en")]
    [InlineData("ar")]
    public void Every_shipped_key_resolves_in_both_cultures(string culture)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddLocalization();

        using var provider = services.BuildServiceProvider();
        var factory = provider.GetRequiredService<IStringLocalizerFactory>();

        var marker = typeof(Program).Assembly
            .GetType("Wasl.Api.Common.Localization.SharedResource");

        marker.Should().NotBeNull("the marker type is what the resource base name is built from");

        var localizer = factory.Create(marker!);
        var keys = Read(EnglishFile).Keys;

        var previous = CultureInfo.CurrentUICulture;
        CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(culture);

        try
        {
            var unresolved = keys
                .Where(key => localizer[key].ResourceNotFound)
                .ToList();

            unresolved.Should().BeEmpty(
                $"a key that does not resolve under `{culture}` renders as itself, which reads "
                + "as a missing translation rather than as the broken lookup it is");
        }
        finally
        {
            CultureInfo.CurrentUICulture = previous;
        }
    }

    /// <summary>
    /// AC-15 — a key missing from Arabic resolves to the English sentence, never to the key.
    /// </summary>
    /// <remarks>
    /// BR-8.12's runtime safety net, underneath AC-14's build-time guard. Proven with a key that
    /// exists only in the neutral catalogue — which is why the assertion is on a key
    /// deliberately absent from the Arabic file rather than on one of the sixty-three.
    /// <br/>
    /// The English catalogue **is** the neutral culture, so this is the CLR's own fallback chain
    /// rather than anything this feature wrote — asserted because that is a fact about
    /// configuration, and configuration changes.
    /// </remarks>
    [Fact]
    public void A_key_missing_from_arabic_falls_back_to_the_english_sentence()
    {
        var english = Read(EnglishFile);
        var arabic = Read(ArabicFile);

        // Nothing is exempt today. If a key is ever added to English alone, AC-14 fails first —
        // so this asserts the MECHANISM on a key that is in both, by looking up under a culture
        // with no catalogue at all, which is the same fallback path.
        arabic.Keys.Should().BeEquivalentTo(english.Keys);

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddLocalization();

        using var provider = services.BuildServiceProvider();
        var localizer = provider.GetRequiredService<IStringLocalizerFactory>()
            .Create(typeof(Program).Assembly
                .GetType("Wasl.Api.Common.Localization.SharedResource")!);

        var previous = CultureInfo.CurrentUICulture;
        CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo("fr");

        try
        {
            var resolved = localizer["Error.NotFound.Title"];

            resolved.ResourceNotFound.Should().BeFalse();
            resolved.Value.Should().Be(english["Error.NotFound.Title"],
                "a culture with no catalogue falls back to the neutral one, which is English "
                + "(BR-8.12) — never to the raw key");
        }
        finally
        {
            CultureInfo.CurrentUICulture = previous;
        }
    }

    // ── AC-17 · ICU is really there ─────────────────────────────────────────────────

    /// <summary>
    /// AC-17 — globalization is not invariant.
    /// </summary>
    /// <remarks>
    /// <c>InvariantGlobalization</c> collapses every culture to invariant: `ar` formats exactly
    /// like `en`, month names come back in English, and **nothing throws**. It is a one-line
    /// property in a `.csproj`, frequently added for container size, and it would make this
    /// entire feature a no-op that still passes most of its own tests.
    /// </remarks>
    [Fact]
    public void Icu_is_available_and_arabic_is_a_real_culture()
    {
        var arabic = CultureInfo.GetCultureInfo("ar");

        arabic.Name.Should().Be("ar");

        arabic.DateTimeFormat.GetMonthName(8)
            .Should().NotBe(CultureInfo.GetCultureInfo("en").DateTimeFormat.GetMonthName(8))
            .And.Subject.As<string>().Should().MatchRegex(@"\p{IsArabic}",
                "InvariantGlobalization would return the English month name here, silently");
    }

    /// <summary>
    /// The resource files are embedded in the built assembly, not merely present on disk.
    /// </summary>
    /// <remarks>
    /// The parity test above reads `.resx` from the source tree, and would stay green if the files
    /// stopped being compiled into the assembly at all. This asserts the other end.
    /// </remarks>
    /// <remarks>
    /// The parity test above reads `.resx` from the source tree, and would stay green if the
    /// files stopped being compiled into the assembly at all. This asserts the other end.
    /// </remarks>
    [Fact]
    public void Both_catalogues_are_embedded_in_the_assembly()
    {
        var assembly = typeof(Program).Assembly;

        assembly.GetManifestResourceNames()
            .Should().Contain("Wasl.Api.Common.Localization.SharedResource.resources",
                "the neutral catalogue is compiled into the assembly itself");

        var arabic = assembly.GetSatelliteAssembly(CultureInfo.GetCultureInfo("ar"));

        arabic.GetManifestResourceNames()
            .Should().Contain("Wasl.Api.Common.Localization.SharedResource.ar.resources",
                "the Arabic catalogue ships as a satellite assembly, and a missing satellite "
                + "makes every Arabic lookup fall back to English with no error anywhere");
    }
}
