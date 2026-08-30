using Microsoft.AspNetCore.Builder;
using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Wasl.Api.IntegrationTests.Localization;

/// <summary>
/// NFR-9's claim, tested rather than asserted. `002b` AC-12, closing `005` AC-19.
/// </summary>
/// <remarks>
/// <para>
/// NFR-9 says a third locale is a resource file plus a registered culture, <b>with no code
/// change</b>. `005` implemented the mechanism — the supported list is read from
/// <c>Localization:SupportedCultures</c> — and left the claim unproven, which is the difference
/// between a design that could support a third locale and one that does.
/// </para>
/// <para>
/// <b>Through a real host with different configuration, not by calling the registration
/// directly.</b> <c>LocalizationRegistration</c> is internal to <c>Wasl.Api</c>, and this project
/// keeps implementations internal on purpose — `Program` was made public specifically to avoid
/// opening the assembly with <c>InternalsVisibleTo</c>. Reconfiguring the host is also the
/// stronger test: it exercises the path a deployment would take.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class SupportedCulturesConfigurationTests(WaslApiFactory factory)
{
    /// <summary>A host that speaks a third language, configured and not coded.</summary>
    private WebApplicationFactory<Program> WithFrench() =>
        factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Localization:SupportedCultures:0", "en");
            builder.UseSetting("Localization:SupportedCultures:1", "ar");
            builder.UseSetting("Localization:SupportedCultures:2", "fr");
        });

    /// <summary>AC-12 — a third culture is configuration, not code.</summary>
    [Fact]
    public async Task A_third_culture_is_answered_with_no_code_change()
    {
        using var host = WithFrench();
        var client = host.CreateClient();

        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.ManagerToken);

        var response = await client.GetAsync(
            $"/api/tickets/{Guid.CreateVersion7()}?culture=fr");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);

        response.Content.Headers.GetValues("Content-Language").Single().Should().Be("fr",
            "NFR-9 claims a third locale needs no code change, and nothing proved it until this "
            + "test existed");

        // English text, because there is no French catalogue — which is the point. The claim is
        // that the CULTURE is configurable; shipping its translations is a separate act.
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement
            .GetProperty("title").GetString()
            .Should().Be("The requested resource was not found.",
                "a registered culture with no catalogue falls back to the neutral one (BR-8.12), "
                + "and does not fail");
    }

    /// <summary>The configured list is exactly three, and English is still the default.</summary>
    [Fact]
    public void The_configured_list_reaches_the_options_and_english_stays_the_default()
    {
        using var host = WithFrench();
        using var scope = host.Services.CreateScope();

        var options = scope.ServiceProvider
            .GetRequiredService<IOptions<RequestLocalizationOptions>>().Value;

        options.SupportedUICultures!.Select(culture => culture.Name)
            .Should().Equal("en", "ar", "fr");

        // Both lists. SupportedCultures governs formatting and SupportedUICultures resource
        // lookup — setting one gives a locale its own text with English number formatting.
        options.SupportedCultures!.Select(culture => culture.Name)
            .Should().Equal("en", "ar", "fr");

        options.DefaultRequestCulture.UICulture.Name.Should().Be("en");
    }

    /// <summary>
    /// The default host does **not** speak French — so the test above proves configuration.
    /// </summary>
    /// <remarks>
    /// `001` shipped an architecture test that was a false negative until someone broke it on
    /// purpose. Without this, a bug that accepted every installed culture would satisfy AC-12 and
    /// prove nothing about configuration at all.
    /// </remarks>
    [Fact]
    public async Task The_unconfigured_host_refuses_french_and_answers_in_english()
    {
        // Anonymous: the seeded Manager's token claims `ar`, and a claim outranks everything
        // except the query string — so a Manager here would answer `ar` and prove nothing about
        // whether `fr` was refused.
        var response = await factory.CreateClient().GetAsync(
            "/api/tickets/" + Guid.CreateVersion7() + "?culture=fr");

        response.Content.Headers.GetValues("Content-Language").Single().Should().Be("en",
            "the shipped configuration lists en and ar only, so `fr` must fall through — if this "
            + "said `fr`, AC-12 would be passing on a host that accepts anything");
    }
}
