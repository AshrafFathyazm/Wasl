using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;

namespace Wasl.Api.IntegrationTests.Localization;

/// <summary>
/// `Content-Language` on every response, thrown or not. `002b` AC-8 … AC-10, closing `005` AC-11.
/// </summary>
[Collection(WaslApiCollection.Name)]
public sealed class ContentLanguageTests(WaslApiFactory factory)
{
    private static string? Of(HttpResponseMessage response) =>
        response.Content.Headers.TryGetValues("Content-Language", out var values)
            ? values.FirstOrDefault()
            : null;

    private HttpClient Arabic(string? token = null)
    {
        var client = token is null ? factory.CreateClient() : factory.CreateManagerClient();
        client.DefaultRequestHeaders.Add("Accept-Language", "ar");

        return client;
    }

    /// <summary>
    /// AC-8 — **the exact probe that found the defect**.
    /// </summary>
    /// <remarks>
    /// One endpoint, two ways of failing with the same status. A `400` from model binding never
    /// throws, so <c>ExceptionHandlerMiddleware</c> never clears the response and the header
    /// survives. A `400` from FluentValidation throws, the handler clears, and the header went
    /// with it.
    /// <br/>
    /// <b>Everything else about both responses was already correct</b>, which is why this went
    /// unnoticed until the two were compared side by side. Asserting either one alone proves
    /// nothing.
    /// </remarks>
    [Fact]
    public async Task Both_ways_of_failing_with_a_400_carry_the_header()
    {
        var client = Arabic(factory.ManagerToken);

        // Binds and fails FluentValidation — this one throws.
        var thrown = await client.PostAsJsonAsync("/api/tickets", new
        {
            customerId = Guid.CreateVersion7(),
            subject = "",
            description = "x",
            category = "Technical",
            channel = "Email",
        });

        // Does not bind — no exception is raised at all.
        var bound = await client.PostAsJsonAsync("/api/tickets", new { subject = "" });

        thrown.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        bound.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        Of(bound).Should().Be("ar", "this path never throws, and it always worked");
        Of(thrown).Should().Be("ar",
            "the exception handler clears the response before writing the problem, taking the "
            + "header the localization middleware wrote on the way down. Same endpoint, same "
            + "status, same request headers — the only difference is whether something threw");
    }

    /// <summary>AC-9 — every status, thrown or not.</summary>
    [Fact]
    public async Task Every_error_status_carries_the_header()
    {
        var manager = Arabic(factory.ManagerToken);

        var probes = new (string Label, Func<Task<HttpResponseMessage>> Call)[]
        {
            ("200", () => manager.GetAsync("/api/tickets")),
            ("400 thrown", () => manager.PostAsJsonAsync("/api/tickets", new
            {
                customerId = Guid.CreateVersion7(), subject = "", description = "x",
                category = "Technical", channel = "Email",
            })),
            ("401", () => Arabic().GetAsync("/api/tickets")),
            ("404 thrown", () => manager.GetAsync($"/api/tickets/{Guid.CreateVersion7()}")),
            ("404 routing", () => manager.GetAsync("/api/nope")),
            ("405 routing", () => manager.DeleteAsync("/api/tickets")),
            ("415", () => manager.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/tickets")
            {
                Content = new StringContent("x", Encoding.UTF8, "text/plain"),
            })),
        };

        foreach (var (label, call) in probes)
        {
            Of(await call()).Should().Be("ar",
                "{0} must name the culture actually applied — a client that asked for Arabic and "
                + "cannot tell whether it got Arabic is the reason BR-8 asks for this header",
                label);
        }
    }

    /// <summary>
    /// AC-10 — the header names what was applied, not what was asked for.
    /// </summary>
    /// <remarks>
    /// BR-8.3: a locale the system does not speak is not a client error. It answers in English,
    /// and it says so — a header echoing `fr` would tell a client it got French.
    /// </remarks>
    [Fact]
    public async Task An_unspoken_locale_reports_the_one_that_was_actually_applied()
    {
        // ANONYMOUS, and that is not incidental. The seeded Manager's token claims `ar`, and
        // BR-8.4 ranks a claim above Accept-Language — so asking this question with a Manager's
        // client would be asking whether the claim wins, which is a different test that already
        // exists. With no token there is no claim, and the header is the only input.
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Accept-Language", "fr");

        var response = await client.GetAsync("/api/tickets/" + Guid.CreateVersion7());

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        Of(response).Should().Be("en");
    }
}
