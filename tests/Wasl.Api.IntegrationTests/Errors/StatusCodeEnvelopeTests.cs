using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace Wasl.Api.IntegrationTests.Errors;

/// <summary>
/// The statuses the framework short-circuits without throwing. `002b` AC-1 … AC-7, AC-13 … AC-18.
/// </summary>
/// <remarks>
/// `002`'s `research.md` R-1 calls this its most important finding: routing writes a `404` or a
/// `405` and stops, so no exception handler in any framework sees them.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class StatusCodeEnvelopeTests(WaslApiFactory factory)
{
    private static async Task<(HttpStatusCode Status, string Raw, JsonElement Body)> ReadAsync(
        HttpResponseMessage response)
    {
        var raw = await response.Content.ReadAsStringAsync();

        return (response.StatusCode, raw, JsonDocument.Parse(raw).RootElement);
    }

    private static string? ContentLanguage(HttpResponseMessage response) =>
        response.Content.Headers.TryGetValues("Content-Language", out var values)
            ? values.FirstOrDefault()
            : null;

    private HttpClient Arabic()
    {
        var client = factory.CreateManagerClient();
        client.DefaultRequestHeaders.Add("Accept-Language", "ar");

        return client;
    }

    // ── AC-1, AC-2, AC-3 · the three that had no envelope of ours ──────────────────

    /// <summary>AC-1 — an unmatched route.</summary>
    [Fact]
    public async Task An_unmatched_route_is_enveloped()
    {
        var (status, raw, body) = await ReadAsync(
            await factory.CreateEnglishManagerClient().GetAsync("/api/nope"));

        status.Should().Be(HttpStatusCode.NotFound);
        raw.Should().NotBeEmpty("this response used to have no body at all");

        body.GetProperty("type").GetString().Should().Be("https://wasl.local/errors/not-found");
        body.GetProperty("status").GetInt32().Should().Be(404);
        body.GetProperty("instance").GetString().Should().Be("/api/nope");
        body.GetProperty("traceId").GetString().Should().NotBeNullOrEmpty();
        body.TryGetProperty("errors", out _).Should().BeFalse("no field is at fault on a 404");
    }

    /// <summary>AC-2 — a method the route does not declare.</summary>
    [Fact]
    public async Task An_undeclared_method_is_enveloped()
    {
        var (status, raw, body) = await ReadAsync(
            await factory.CreateEnglishManagerClient().DeleteAsync("/api/tickets"));

        status.Should().Be(HttpStatusCode.MethodNotAllowed);
        raw.Should().NotBeEmpty();

        body.GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/method-not-allowed");
        body.GetProperty("instance").GetString().Should().Be("/api/tickets");
    }

    /// <summary>
    /// AC-3 — and this one is asserted as an exact string on purpose.
    /// </summary>
    /// <remarks>
    /// <b>The `415` was never empty; it was plausible.</b> Before `002b` it returned MVC's own
    /// envelope carrying <c>https://tools.ietf.org/html/rfc9110#section-15.5.16</c> — well-formed,
    /// parseable, and useless: a client branching on the last path segment gets
    /// <c>section-15.5.16</c> forever. `002`'s summary recorded it as an empty body, and a shape
    /// assertion would agree with the recording rather than with the wire.
    /// </remarks>
    [Fact]
    public async Task An_unsupported_media_type_carries_our_type_and_not_an_rfc_uri()
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/tickets")
        {
            Content = new StringContent("x", Encoding.UTF8, "text/plain"),
        };

        var (status, _, body) = await ReadAsync(
            await factory.CreateEnglishManagerClient().SendAsync(request));

        status.Should().Be(HttpStatusCode.UnsupportedMediaType);

        body.GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/unsupported-media-type",
                "a client branches on the last path segment, and an RFC section number is not "
                + "one this contract registers");

        body.GetProperty("instance").GetString().Should().Be("/api/tickets");
        body.GetProperty("traceId").GetString().Should().NotBeNullOrEmpty();
    }

    // ── AC-4 · localized ───────────────────────────────────────────────────────────

    /// <summary>AC-4 — the three carry `Content-Language` and an Arabic title.</summary>
    [Fact]
    public async Task The_three_are_localized()
    {
        var notFound = await Arabic().GetAsync("/api/nope");
        ContentLanguage(notFound).Should().Be("ar");
        (await ReadAsync(notFound)).Body.GetProperty("title").GetString()
            .Should().Be("العنصر المطلوب غير موجود.");

        var methodNotAllowed = await Arabic().DeleteAsync("/api/tickets");
        ContentLanguage(methodNotAllowed).Should().Be("ar");
        (await ReadAsync(methodNotAllowed)).Body.GetProperty("title").GetString()
            .Should().Be("هذه العملية غير مسموح بها على هذا المسار.");

        var request = new HttpRequestMessage(HttpMethod.Post, "/api/tickets")
        {
            Content = new StringContent("x", Encoding.UTF8, "text/plain"),
        };

        var unsupported = await Arabic().SendAsync(request);
        ContentLanguage(unsupported).Should().Be("ar");
        (await ReadAsync(unsupported)).Body.GetProperty("title").GetString()
            .Should().Be("يجب أن يكون محتوى الطلب بصيغة JSON.");
    }

    // ── AC-6 · nothing that was already right has changed ──────────────────────────

    /// <summary>
    /// AC-6 — the responses that already had an envelope are untouched.
    /// </summary>
    /// <remarks>
    /// <b>This is the criterion the product owner named as the most important one, and the
    /// reason is A-1's failure mode:</b> <c>UseStatusCodePages</c> writing a second body onto a
    /// response that was already correct. That produces output which is not valid JSON at all,
    /// and <b>a shape assertion cannot see it</b> — <c>TryGetProperty("type")</c> succeeds on the
    /// first envelope and never reads the trailing bytes.
    /// <br/>
    /// So this compares the RAW text, and asserts it parses exactly once by requiring the parsed
    /// length to account for the whole payload.
    /// </remarks>
    [Fact]
    public async Task Every_status_that_already_had_an_envelope_is_unchanged()
    {
        var client = factory.CreateEnglishManagerClient();

        var probes = new (string Label, Func<Task<HttpResponseMessage>> Call, HttpStatusCode Expected)[]
        {
            ("401 no token", () => factory.CreateClient().GetAsync("/api/tickets"),
                HttpStatusCode.Unauthorized),
            ("403 agent on manager-only", () => factory.CreateAgentClient()
                .GetAsync(Auth.AuthProbeEndpoints.ManagerOnlyPath), HttpStatusCode.Forbidden),
            ("404 from a handler", () => client
                .GetAsync($"/api/tickets/{Guid.CreateVersion7()}"), HttpStatusCode.NotFound),
            ("400 from validation", () => client
                .PostAsJsonAsync("/api/tickets", new { subject = "" }), HttpStatusCode.BadRequest),
        };

        foreach (var (label, call, expected) in probes)
        {
            var response = await call();
            var raw = await response.Content.ReadAsStringAsync();

            response.StatusCode.Should().Be(expected, "{0}", label);

            // Exactly one JSON document, and it accounts for the entire body. A second envelope
            // appended by UseStatusCodePages would leave trailing bytes here and nowhere else.
            var reader = new Utf8JsonReader(Encoding.UTF8.GetBytes(raw));
            JsonDocument.TryParseValue(ref reader, out _).Should().BeTrue("{0} must parse", label);
            reader.BytesConsumed.Should().Be(Encoding.UTF8.GetByteCount(raw),
                "{0}: a second body appended after a correct one is still parseable as the first, "
                + "which is exactly why a shape assertion would pass here", label);

            var body = JsonDocument.Parse(raw).RootElement;
            body.GetProperty("type").GetString().Should().StartWith("https://wasl.local/errors/",
                "{0}", label);
        }
    }

    /// <summary>AC-7 — `/health` is still the documented exception.</summary>
    [Fact]
    public async Task Health_still_returns_the_health_report_shape()
    {
        var response = await factory.CreateClient().GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        body.TryGetProperty("status", out var health).Should().BeTrue();
        health.GetString().Should().Be("Healthy");
        body.TryGetProperty("type", out _).Should().BeFalse("health is not ProblemDetails");
    }

    // ── AC-18 · the security property the fix could have destroyed ─────────────────

    /// <summary>
    /// AC-18 — an anonymous caller cannot tell a real route from an invented one.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The fallback policy refuses before routing ever resolves a `404`, so every anonymous
    /// request — matched route, unmatched route, undeclared method, outside `/api` — returns an
    /// identical `401`. Measured before `002b` was written, and asserted here so that adding a
    /// body to `404` and `405` cannot start distinguishing them.
    /// </para>
    /// <para>
    /// <b>A claim this test was first written to support turned out to be false, and the
    /// correction belongs here.</b> `002b` argued that registering <c>UseStatusCodePages</c>
    /// before <c>UseAuthorization</c> would leak the route table — `404` for the invented path,
    /// `401` for the real one. <b>The control was run and this test still passed.</b> The `401`
    /// is produced INSIDE the wrapped section and short-circuits before routing resolves
    /// anything, so the middleware never sees the request whatever its position.
    /// </para>
    /// <para>
    /// The property is <c>RequireAuthenticatedUser</c>'s and it is `004`'s. A source guard on the
    /// registration order was written for the false reason and <b>deleted</b> rather than kept
    /// with better wording: it would have failed only on its own premise, never on behaviour.
    /// This test survives because it asserts the property itself.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task An_anonymous_caller_cannot_distinguish_a_real_route_from_an_invented_one()
    {
        var client = factory.CreateClient();

        var responses = new[]
        {
            await client.GetAsync("/api/tickets"),
            await client.GetAsync("/api/nope"),
            await client.DeleteAsync("/api/tickets"),
            await client.GetAsync("/nope"),
            await client.GetAsync("/api/tickets/not-a-guid"),
        };

        foreach (var response in responses)
        {
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
                "a real route and an invented one must answer identically to an anonymous "
                + "caller, or the 401/404 difference enumerates the route table");

            var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

            body.GetProperty("type").GetString()
                .Should().Be("https://wasl.local/errors/unauthenticated");
            body.GetProperty("status").GetInt32().Should().Be(401);
        }
    }

    // ── AC-13 · nothing internal on the wire ───────────────────────────────────────

    /// <summary>AC-13 — no internal detail in any newly-enveloped response.</summary>
    [Fact]
    public async Task No_newly_enveloped_response_names_anything_internal()
    {
        var client = factory.CreateEnglishManagerClient();

        var request = new HttpRequestMessage(HttpMethod.Post, "/api/tickets")
        {
            Content = new StringContent("x", Encoding.UTF8, "text/plain"),
        };

        var bodies = new[]
        {
            await (await client.GetAsync("/api/nope")).Content.ReadAsStringAsync(),
            await (await client.DeleteAsync("/api/tickets")).Content.ReadAsStringAsync(),
            await (await client.SendAsync(request)).Content.ReadAsStringAsync(),
        };

        foreach (var body in bodies)
        {
            foreach (var forbidden in new[]
            {
                "Exception", "Microsoft.", "System.", "LineNumber", "BytePositionInLine",
                "at Wasl.", ".cs:line", "Wasl.Api", "Stack",
            })
            {
                body.Should().NotContain(forbidden,
                    "a response is not a diagnostic surface");
            }
        }
    }
}
