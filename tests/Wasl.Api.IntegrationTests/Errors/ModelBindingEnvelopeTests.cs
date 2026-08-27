using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace Wasl.Api.IntegrationTests.Errors;

/// <summary>
/// A model-binding failure carries `002`'s envelope, not the framework's. AC-2's missing half.
/// </summary>
/// <remarks>
/// <para>
/// <b>Found by rehearsing the demo, not by a test</b> — which is why this class exists. A
/// malformed body came back with
/// <c>"type": "https://tools.ietf.org/html/rfc9110#section-15.5.1"</c>: `[ApiController]`'s
/// automatic model-state filter short-circuits <b>before</b> any handler and before
/// <c>UseExceptionHandler</c>, so nothing `002` built ever saw the request.
/// </para>
/// <para>
/// `002` AC-2 says there is exactly one producer of the envelope, and `002`'s own test asserted
/// that by grepping <c>src/</c> for constructors of <c>ProblemDetails</c> — which was true and
/// insufficient: the framework constructs its own, inside itself, where no grep reaches. The
/// guarantee needed an assertion over a **response**, and this is it.
/// </para>
/// <para>
/// `002` A-2 assumed a malformed body would surface as a <c>BadHttpRequestException</c>. The
/// observed behaviour is more mundane: it never becomes an exception at all.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class ModelBindingEnvelopeTests(WaslApiFactory factory)
{
    private const string TypeBase = "https://wasl.local/errors/";

    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private Task<HttpResponseMessage> PostRawAsync(string json) =>
        factory.CreateManagerClient().PostAsync(
            "/api/tickets", new StringContent(json, Encoding.UTF8, "application/json"));

    /// <summary>Truncated JSON — the body cannot be parsed at all.</summary>
    [Fact]
    public async Task A_truncated_body_returns_our_validation_envelope()
    {
        var response = await PostRawAsync("""{"subject":""");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");

        var problem = await BodyOf(response);

        problem.GetProperty("type").GetString().Should().Be(TypeBase + "validation",
            "the framework's own type URI reaching a client is a contract violation no grep over "
            + "src/ can catch — it constructs its ProblemDetails inside itself");
        problem.GetProperty("instance").GetString().Should().Be("/api/tickets");
        problem.GetProperty("traceId").GetString().Should().NotBeNullOrWhiteSpace(
            "BR-9.9 — every non-2xx carries the id that matches the log");
        problem.TryGetProperty("errors", out _).Should().BeTrue("a 400 carries errors");
    }

    /// <summary>A `Guid` field that is not a `Guid`, and an enum value that does not exist.</summary>
    /// <remarks>
    /// `009` AC-5 asks for a `400` listing the accepted values for an unparseable enum. The status
    /// was already right; this asserts the **envelope**, which was not.
    /// </remarks>
    [Fact]
    public async Task An_unparseable_guid_or_enum_returns_our_validation_envelope()
    {
        var response = await PostRawAsync(
            """
            {"customerId":"not-a-guid","subject":"x","description":"y",
             "category":"NotACategory","channel":"Email"}
            """);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be(TypeBase + "validation");
    }

    /// <summary>
    /// The same for a <c>PUT</c>, so the fix is registered globally rather than per action.
    /// </summary>
    [Fact]
    public async Task The_envelope_is_the_same_on_a_put()
    {
        var response = await factory.CreateManagerClient().PutAsync(
            $"/api/tickets/{Guid.NewGuid()}/status",
            new StringContent("""{"status":}""", Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be(TypeBase + "validation",
                "configured once through ApiBehaviorOptions, not per controller — the per-action "
                + "version is the one the next controller forgets");
    }

    /// <summary>
    /// A well-formed body that fails a FluentValidation rule still comes out the same way.
    /// </summary>
    /// <remarks>
    /// The two paths are different — one is model binding, the other `003`'s pipeline behaviour —
    /// and a client must not be able to tell. That is what AC-2 is for.
    /// </remarks>
    [Fact]
    public async Task A_rule_failure_and_a_binding_failure_are_indistinguishable_to_a_client()
    {
        var binding = await BodyOf(await PostRawAsync("""{"subject":"""));

        var rule = await BodyOf(await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId = Guid.NewGuid(),
            subject = "",
            description = "",
            category = "Billing",
            channel = "Email",
        }));

        rule.GetProperty("type").GetString()
            .Should().Be(binding.GetProperty("type").GetString(),
                "one envelope, whichever layer refused the request");

        foreach (var field in new[] { "type", "title", "status", "instance", "traceId" })
        {
            binding.TryGetProperty(field, out _).Should().BeTrue($"binding failure carries {field}");
            rule.TryGetProperty(field, out _).Should().BeTrue($"rule failure carries {field}");
        }
    }
}
