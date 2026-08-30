using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace Wasl.Api.IntegrationTests.Errors;

/// <summary>
/// A body that could not be read is a different answer from a body with bad fields.
/// `002b` AC-15 … AC-17, Q-A.
/// </summary>
[Collection(WaslApiCollection.Name)]
public sealed class MalformedRequestTests(WaslApiFactory factory)
{
    private async Task<(HttpStatusCode Status, string Raw, JsonElement Body)> PostAsync(string body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/tickets")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };

        var response = await factory.CreateEnglishManagerClient().SendAsync(request);
        var raw = await response.Content.ReadAsStringAsync();

        return (response.StatusCode, raw, JsonDocument.Parse(raw).RootElement);
    }

    /// <summary>AC-15, AC-16 — the type is `malformed-request`, and there are no field errors.</summary>
    /// <remarks>
    /// Two shapes of unreadable, because they fail at different points in the parser: one is
    /// invalid from the first character, the other is valid until it stops.
    /// </remarks>
    [Theory]
    [InlineData("{not json")]
    [InlineData("")]
    [InlineData("[]")]
    public async Task An_unreadable_body_is_malformed_and_names_no_field(string payload)
    {
        var (status, _, body) = await PostAsync(payload);

        status.Should().Be(HttpStatusCode.BadRequest);

        body.GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/malformed-request",
                "`validation` means fix these fields; `malformed-request` means the request was "
                + "not readable at all, and the contract registers both deliberately");

        body.TryGetProperty("errors", out _).Should().BeFalse(
            "nothing about an unparseable payload is a field a client can fix — and the measured "
            + "alternative put `$`, the JSON root, and `command`, the action method's own "
            + "parameter name, on the wire as though they were form fields");
    }

    /// <summary>
    /// AC-17 — no parser diagnostic survives anywhere in the body.
    /// </summary>
    /// <remarks>
    /// What this replaced, measured on the running API:
    /// <code>
    /// "$": ["'n' is an invalid start of a property name. Expected a '\"'.
    ///        Path: $ | LineNumber: 0 | BytePositionInLine: 1."]
    /// </code>
    /// The same family as a stack trace in <c>detail</c>, which `CLAUDE.md` forbids — arriving
    /// through <c>errors</c> instead, and naming byte offsets in the caller's own payload.
    /// </remarks>
    [Fact]
    public async Task No_parser_diagnostic_reaches_the_client()
    {
        var (_, raw, _) = await PostAsync("{not json");

        foreach (var forbidden in new[]
        {
            "LineNumber", "BytePositionInLine", "invalid start of a property name",
            "command", "JsonException", "Path: $",
        })
        {
            raw.Should().NotContain(forbidden,
                "a parser diagnostic is an internal message, and `command` is the action "
                + "method's parameter name");
        }
    }

    /// <summary>
    /// A readable body with bad fields is still `validation`, and still names its fields.
    /// </summary>
    /// <remarks>
    /// The other side of the split, and the reason it is asserted: a detection rule that is too
    /// eager turns every ordinary form error into "your request was unreadable", which is a worse
    /// failure than the one being fixed and would look like a win in every malformed-body test.
    /// </remarks>
    [Fact]
    public async Task A_readable_body_with_bad_fields_is_still_a_validation_error()
    {
        var response = await factory.CreateEnglishManagerClient()
            .PostAsJsonAsync("/api/tickets", new { subject = "" });

        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        body.GetProperty("type").GetString().Should().Be("https://wasl.local/errors/validation");
        body.TryGetProperty("errors", out var errors).Should().BeTrue();
        errors.EnumerateObject().Should().NotBeEmpty("the client can act on these");
    }

    /// <summary>
    /// AC-17, and the worst thing the measurement found: a field that fails to PARSE.
    /// </summary>
    /// <remarks>
    /// <para>
    /// A truncated body and an unparseable enum both stay <c>errors/validation</c> — `002` chose
    /// that status, and a field the reader could not convert is still a field the client can fix.
    /// <b>What they used to carry is the problem.</b> Measured on the running API:
    /// </para>
    /// <code>
    /// "$.category": ["The JSON value could not be converted to
    ///   Wasl.Application.Features.Tickets.CreateTicket.CreateTicketCommand.
    ///   Path: $.category | LineNumber: 0 | BytePositionInLine: 102."]
    /// </code>
    /// <para>
    /// A fully-qualified internal type name — namespace, feature folder and command class — plus
    /// a byte offset, under a key that is a JSON path rather than a form field.
    /// <b>`002` already has a test for this exact request</b>
    /// (<c>ModelBindingEnvelopeTests.An_unparseable_guid_or_enum_returns_our_validation_envelope</c>)
    /// <b>and it passes, because it asserts the status and never reads the message.</b> That is
    /// the shape-not-content trap `CLAUDE.md` records, sitting in the suite since `002`.
    /// </para>
    /// </remarks>
    [Theory]
    [InlineData("{\"subject\":", "truncated mid-value")]
    [InlineData("{\"customerId\":\"11111111-1111-1111-1111-111111111111\",\"subject\":\"s\","
        + "\"description\":\"d\",\"category\":\"Nope\",\"channel\":\"Email\"}", "unconvertible enum")]
    public async Task A_field_that_could_not_be_parsed_names_the_field_and_nothing_internal(
        string payload, string label)
    {
        var (status, raw, body) = await PostAsync(payload);

        status.Should().Be(HttpStatusCode.BadRequest, "{0}", label);
        body.GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/validation", "{0}", label);

        foreach (var forbidden in new[]
        {
            "Wasl.Application", "Wasl.Domain", "CreateTicketCommand", "LineNumber",
            "BytePositionInLine", "Path: $", "$.", "command",
        })
        {
            raw.Should().NotContain(forbidden,
                "{0}: an internal type name is not a form message", label);
        }

        // The field is still named, without its JSON path — the client can highlight an input.
        body.GetProperty("errors").EnumerateObject().Should().NotBeEmpty("{0}", label);

        foreach (var field in body.GetProperty("errors").EnumerateObject())
        {
            field.Name.Should().NotStartWith("$", "{0}: a JSON path is not a form field", label);

            field.Value[0].GetString()
                .Should().Be("This value could not be read.",
                    "{0}: a symbolic key resolved from the catalogue, so it translates — the "
                    + "parser's own sentence never could", label);
        }
    }

    /// <summary>The malformed body is localized, like every other sentence the server authors.</summary>
    [Fact]
    public async Task The_malformed_response_is_localized()
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/tickets")
        {
            Content = new StringContent("{not json", Encoding.UTF8, "application/json"),
        };

        var client = factory.CreateManagerClient();
        client.DefaultRequestHeaders.Add("Accept-Language", "ar");

        var response = await client.SendAsync(request);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        body.GetProperty("title").GetString().Should().Be("تعذّرت قراءة الطلب.");
        body.GetProperty("detail").GetString().Should().Be("تعذّرت قراءة محتوى الطلب كـ JSON.");
    }
}
