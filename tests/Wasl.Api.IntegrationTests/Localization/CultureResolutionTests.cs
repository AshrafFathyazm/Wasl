using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Wasl.Api.IntegrationTests.Localization;

/// <summary>
/// BR-8.4's resolution order, and the pipeline position that makes it work. `005` AC-1 … AC-12c.
/// </summary>
[Collection(WaslApiCollection.Name)]
public sealed class CultureResolutionTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static string? ContentLanguage(HttpResponseMessage response) =>
        response.Content.Headers.TryGetValues("Content-Language", out var values)
            ? values.FirstOrDefault()
            : null;

    /// <summary>
    /// A token carrying a language claim, minted here.
    /// </summary>
    /// <remarks>
    /// <b>The product does issue this claim</b> — `004` ships <c>SupportUser.PreferredLanguage</c>,
    /// its column, and <c>preferred_language</c> in the token. `005`'s spec said otherwise for half
    /// a day, reasoned from ADR-005's three-claim list rather than from a decoded token.
    /// <br/>
    /// The claim is nonetheless minted <b>here</b> rather than taken from a seeded user, because
    /// these tests need to vary it — <c>en</c>, <c>ar</c>, <c>AR</c>, <c>de</c>, empty — and the
    /// seed offers exactly two values. A test that can only assert what the seed happens to
    /// contain is a test of the seed.
    /// </remarks>
    private static string TokenWithLanguage(string language)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(WaslApiFactory.TestSigningKey));

        var token = new JwtSecurityToken(
            issuer: "wasl",
            audience: "wasl-api",
            claims:
            [
                new Claim("sub", Guid.NewGuid().ToString()),
                new Claim("email", "language-probe@wasl.local"),
                new Claim("role", "Agent"),
                new Claim("preferred_language", language),
            ],
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private HttpClient ClientWith(string? token = null, string? acceptLanguage = null)
    {
        var client = factory.CreateClient();

        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new("Bearer", token);
        }

        if (acceptLanguage is not null)
        {
            client.DefaultRequestHeaders.Add("Accept-Language", acceptLanguage);
        }

        return client;
    }

    // ── AC-1, AC-2, AC-3 · the pipeline and the provider list ───────────────────────

    /// <summary>
    /// AC-1 — the only observable that distinguishes correct middleware order from the default.
    /// </summary>
    /// <remarks>
    /// With localization registered before <c>UseAuthentication()</c>, the claim is invisible,
    /// the header wins, the response is English, and **nothing anywhere reports a problem.**
    /// ADR-007 decision 4 calls this the single most likely defect in the build.
    /// </remarks>
    [Fact]
    public async Task An_arabic_claim_beats_an_english_header()
    {
        var response = await ClientWith(TokenWithLanguage("ar"), "en")
            .GetAsync("/api/tickets/11111111-1111-1111-1111-111111111111");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await BodyOf(response)).GetProperty("title").GetString()
            .Should().Be("العنصر المطلوب غير موجود.",
                "the claim outranks Accept-Language, and only middleware order makes it visible");
    }

    /// <summary>AC-3 — three providers, in order, and no cookie.</summary>
    /// <remarks>
    /// Asserted by type name against the configured options rather than by observing behaviour,
    /// because the cookie provider's effect is invisible until somebody has a stale cookie: it
    /// would outrank <c>Accept-Language</c> while appearing nowhere in BR-8.4.
    /// </remarks>
    [Fact]
    public void The_provider_list_is_exactly_three_and_carries_no_cookie_provider()
    {
        using var scope = factory.Services.CreateScope();
        var options = scope.ServiceProvider
            .GetRequiredService<IOptions<RequestLocalizationOptions>>().Value;

        options.RequestCultureProviders.Select(provider => provider.GetType().Name)
            .Should().Equal(
                "QueryStringRequestCultureProvider",
                "PreferredLanguageCultureProvider",
                "AcceptLanguageHeaderRequestCultureProvider");

        options.RequestCultureProviders.Should().NotContain(
            provider => provider is CookieRequestCultureProvider,
            "a stale cookie must not outrank what the browser asked for (BR-8.4)");
    }

    // ── AC-4 … AC-7 · the resolution order ──────────────────────────────────────────

    /// <summary>AC-4 — the query string beats both.</summary>
    /// <remarks>
    /// Asserted on the BODY, not on `Content-Language`, and that is Q-G rather than a preference:
    /// this is a `404` raised as an exception, and the exception handler clears the response —
    /// header included — before writing the problem. The cause lives outside `005` and the fix is
    /// not this feature's to make. `AC-11` records the gap.
    /// </remarks>
    [Fact]
    public async Task The_query_string_beats_an_english_claim_and_an_english_header()
    {
        var response = await ClientWith(TokenWithLanguage("en"), "en")
            .GetAsync("/api/tickets/11111111-1111-1111-1111-111111111111?culture=ar");

        (await BodyOf(response)).GetProperty("title").GetString()
            .Should().Be("العنصر المطلوب غير موجود.");
    }

    /// <summary>AC-6, AC-7 — the header, then the default.</summary>
    [Theory]
    [InlineData("ar", "ar")]
    [InlineData("en", "en")]
    [InlineData(null, "en")]
    public async Task With_no_claim_the_header_decides_and_english_is_the_default(
        string? acceptLanguage, string expected)
    {
        var response = await ClientWith(acceptLanguage: acceptLanguage).GetAsync("/api/tickets");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        ContentLanguage(response).Should().Be(expected);
    }

    // ── AC-8, AC-9, AC-10 · what must never be a 400 ────────────────────────────────

    /// <summary>AC-8 — a regional culture resolves to its parent (BR-8.2).</summary>
    [Theory]
    [InlineData("ar-EG")]
    [InlineData("ar-SA")]
    public async Task A_regional_arabic_resolves_to_neutral_arabic(string requested)
    {
        var response = await ClientWith(acceptLanguage: requested).GetAsync("/api/tickets");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        ContentLanguage(response).Should().Be("ar");
    }

    /// <summary>
    /// AC-9, AC-10 — an unspeakable or malformed locale falls through. Never a `400`.
    /// </summary>
    /// <remarks>
    /// BR-8.3 and FR-5.8: asking for a language the system does not speak is not a client error.
    /// The status here is `401` because the endpoint requires a token — the point is that it is
    /// not `400`, and that the response is in English.
    /// </remarks>
    [Theory]
    [InlineData("fr")]
    [InlineData("de-CH")]
    [InlineData("!!!")]
    [InlineData(";q=")]
    [InlineData("")]
    public async Task An_unsupported_or_malformed_locale_falls_through_to_english(string requested)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", requested);

        var response = await client.GetAsync("/api/tickets");

        response.StatusCode.Should().NotBe(HttpStatusCode.BadRequest,
            "a locale the system does not speak is not a client error (BR-8.3, FR-5.8)");

        (await BodyOf(response)).GetProperty("title").GetString()
            .Should().Be("Authentication is required.");
    }

    /// <summary>A claim naming an unsupported culture falls through to the header.</summary>
    [Fact]
    public async Task A_claim_naming_an_unspeakable_culture_falls_through_to_the_header()
    {
        var response = await ClientWith(TokenWithLanguage("de"), "ar")
            .GetAsync("/api/tickets/11111111-1111-1111-1111-111111111111");

        ContentLanguage(response).Should().BeNull("Q-G — see AuditedStatusesCarryContentLanguage");

        (await BodyOf(response)).GetProperty("title").GetString()
            .Should().Be("العنصر المطلوب غير موجود.",
                "the supported-culture filter rejects `de`, and resolution continues rather "
                + "than failing — not a 400, not a 500");
    }

    /// <summary>An empty or whitespace claim is treated as absent.</summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task An_empty_claim_is_treated_as_absent(string claim)
    {
        var response = await ClientWith(TokenWithLanguage(claim), "ar").GetAsync("/api/tickets");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        ContentLanguage(response).Should().Be("ar");
    }

    /// <summary>A claim in the wrong case still resolves (BR-8.2).</summary>
    [Fact]
    public async Task A_claim_in_the_wrong_case_still_resolves()
    {
        var response = await ClientWith(TokenWithLanguage("AR"), "en").GetAsync("/api/tickets");

        ContentLanguage(response).Should().Be("ar",
            "a token minted elsewhere must not break a request by capitalisation");
    }

    // ── AC-12, AC-12c · the two denials, localized ──────────────────────────────────

    /// <summary>
    /// AC-12 — and it is true **only** because localization sits before `UseAuthorization()`.
    /// </summary>
    /// <remarks>
    /// Both bodies are produced inside that middleware, by `004b`'s `AuthDenialResultHandler`.
    /// Registered after it, the localization middleware never runs for a denial at all: measured
    /// on 2026-08-29, every `401` came back with an empty `Content-Language` while an
    /// authenticated `200` on the same host came back `ar`.
    /// </remarks>
    [Fact]
    public async Task A_denial_carries_content_language_and_a_localized_title()
    {
        var challenge = await ClientWith(acceptLanguage: "ar").GetAsync("/api/tickets");

        challenge.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        ContentLanguage(challenge).Should().Be("ar");
        (await BodyOf(challenge)).GetProperty("title").GetString()
            .Should().Be("تسجيل الدخول مطلوب.");

        // `?culture=ar`, not an Accept-Language header, and the reason is BR-8.4 itself: the
        // seeded Agent's token claims `en`, and a claim outranks a header. Asserting `ar` from a
        // header here would be asserting that the resolution order is BROKEN.
        var forbidden = await ClientWith(factory.AgentToken)
            .GetAsync(Auth.AuthProbeEndpoints.ManagerOnlyPath + "?culture=ar");

        forbidden.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        ContentLanguage(forbidden).Should().Be("ar");
        (await BodyOf(forbidden)).GetProperty("title").GetString()
            .Should().Be("ليس لديك صلاحية للقيام بذلك.");
    }

    /// <summary>
    /// AC-12c — both titles under one `type`, in both cultures.
    /// </summary>
    /// <remarks>
    /// `004b` recorded that <c>errors/unauthenticated</c> carries two titles — the challenge and
    /// the failed sign-in — and that shipping the wrong one is invisible. Two locales is where
    /// that doubles to four, so all four are asserted.
    /// </remarks>
    [Theory]
    [InlineData("en", "Authentication is required.", "Email or password is incorrect.")]
    [InlineData("ar", "تسجيل الدخول مطلوب.", "البريد الإلكتروني أو كلمة المرور غير صحيحة.")]
    public async Task Both_titles_under_the_unauthenticated_type_are_localized(
        string culture, string challengeTitle, string credentialsTitle)
    {
        var challenge = await ClientWith(acceptLanguage: culture).GetAsync("/api/tickets");

        (await BodyOf(challenge)).GetProperty("title").GetString().Should().Be(challengeTitle);

        var signIn = await ClientWith(acceptLanguage: culture).PostAsJsonAsync(
            "/api/auth/token", new { email = "nobody@wasl.local", password = "wrong" });

        var body = await BodyOf(signIn);
        body.GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/unauthenticated", "one type, two titles");
        body.GetProperty("title").GetString().Should().Be(credentialsTitle);
    }

    // ── AC-13 · what must NOT differ ────────────────────────────────────────────────

    /// <summary>
    /// AC-13 — the machine-readable half is byte-identical across locales (BR-8.6, BR-8.7).
    /// </summary>
    /// <remarks>
    /// The rule that keeps a client working when the interface language changes. A `type` that
    /// varied by locale would break every client branching on it, and a translated `errors` KEY
    /// would detach a message from the form field it belongs to.
    /// </remarks>
    [Fact]
    public async Task Only_the_human_half_of_a_response_changes_with_the_locale()
    {
        async Task<JsonElement> Failing(string culture) => await BodyOf(
            await ClientWith(acceptLanguage: culture).PostAsJsonAsync(
                "/api/auth/token", new { email = "", password = "" }));

        var english = await Failing("en");
        var arabic = await Failing("ar");

        // Identical.
        arabic.GetProperty("type").GetString().Should().Be(english.GetProperty("type").GetString());
        arabic.GetProperty("status").GetInt32().Should().Be(english.GetProperty("status").GetInt32());
        arabic.GetProperty("instance").GetString().Should().Be(english.GetProperty("instance").GetString());

        arabic.GetProperty("errors").EnumerateObject().Select(field => field.Name)
            .Should().BeEquivalentTo(
                english.GetProperty("errors").EnumerateObject().Select(field => field.Name),
                "an `errors` key names a form field, not a sentence — translating it detaches "
                + "the message from the input it belongs to");

        // Different — and asserted, because a catalogue that silently served English for `ar`
        // would satisfy every assertion above.
        arabic.GetProperty("title").GetString()
            .Should().NotBe(english.GetProperty("title").GetString());

        arabic.GetProperty("errors").GetProperty("email")[0].GetString()
            .Should().NotBe(english.GetProperty("errors").GetProperty("email")[0].GetString());
    }

    // ── AC-16, the half CatalogueParityTests cannot see ─────────────────────────────

    /// <summary>
    /// AC-16 against the <b>running application's own</b> localizer, not a fresh one.
    /// </summary>
    /// <remarks>
    /// <b>Added after a negative control showed the gap.</b> `CatalogueParityTests` builds its own
    /// <c>ServiceCollection</c> and calls <c>AddLocalization()</c> with no <c>ResourcesPath</c>,
    /// so it proves the catalogues are findable — and is blind to how the product registers them.
    /// Setting <c>ResourcesPath = "Resources"</c> in `LocalizationRegistration` broke every lookup
    /// in the API while that test stayed green; `002`'s `ResourceKeyLeakTests` is what went red.
    /// <br/>
    /// This resolves through <c>factory.Services</c>, so it fails on the misconfiguration rather
    /// than on a copy of the intent. Two tests, two ends: one asks whether the files are right,
    /// this asks whether the application can reach them.
    /// </remarks>
    [Fact]
    public void The_running_application_resolves_every_key_it_ships()
    {
        using var scope = factory.Services.CreateScope();
        // Through the FACTORY with a reflected marker type, for two reasons: the marker is
        // `internal` to Wasl.Api, and the factory resolved from the app's own container carries
        // the app's own LocalizationOptions — which is the thing under test.
        var marker = typeof(Program).Assembly
            .GetType("Wasl.Api.Common.Localization.SharedResource")!;

        var localizer = scope.ServiceProvider
            .GetRequiredService<IStringLocalizerFactory>()
            .Create(marker);

        var keys = XDocument
            .Load(Path.Combine(
                CatalogueParityTests.CatalogueDirectoryPath, "SharedResource.resx"))
            .Root!.Elements("data")
            .Select(data => data.Attribute("name")!.Value)
            .ToList();

        keys.Should().NotBeEmpty();

        keys.Where(key => localizer[key].ResourceNotFound).Should().BeEmpty(
            "a ResourcesPath the application sets and the files do not match makes every key "
            + "render as itself — a well-formed response saying nothing, which has shipped three "
            + "times in this project");
    }

    // ── AC-18 · what is never translated ────────────────────────────────────────────

    /// <summary>AC-18 — `TicketNumber` and enum values are locale-independent (BR-8.13).</summary>
    [Fact]
    public async Task A_ticket_number_and_its_enums_are_byte_identical_across_locales()
    {
        var customerId = await Audit.AuditFixture.SeedCustomerAsync(factory, "locale probe");

        var created = await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Locale probe",
            description = "Created to compare the machine-readable half across two locales.",
            category = "Technical",
            channel = "Email",
        });

        var id = (await BodyOf(created)).GetProperty("id").GetGuid();

        async Task<JsonElement> Read(string culture) => await BodyOf(
            await ClientWith(factory.ManagerToken, culture).GetAsync($"/api/tickets/{id}"));

        var english = await Read("en");
        var arabic = await Read("ar");

        arabic.GetProperty("ticketNumber").GetString()
            .Should().Be(english.GetProperty("ticketNumber").GetString());
        arabic.GetProperty("status").GetString()
            .Should().Be(english.GetProperty("status").GetString());
        arabic.GetProperty("category").GetString()
            .Should().Be(english.GetProperty("category").GetString());
        arabic.GetProperty("channel").GetString()
            .Should().Be(english.GetProperty("channel").GetString());
    }
}
