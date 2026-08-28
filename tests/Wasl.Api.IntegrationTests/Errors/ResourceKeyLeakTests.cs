using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using FluentAssertions;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Api.Seed;

namespace Wasl.Api.IntegrationTests.Errors;

/// <summary>
/// No human-readable field of any error response is a raw resource key. `004b`.
/// </summary>
/// <remarks>
/// <para>
/// <b>This guard exists because the same defect shipped twice.</b> `002`'s message source resolves
/// an unknown key by returning the key itself rather than throwing — a deliberate choice, and the
/// right one at runtime, because a missing translation should not turn a `409` into a `500`. The
/// cost is that the response stays perfectly well-formed and becomes useless.
/// </para>
/// <para>
/// `012` AC-3 caught it once: a `409` whose <c>detail</c> came back as
/// <c>Error.Ticket.InvalidTransition</c>, found only because that criterion required the detail to
/// <i>name</i> the current status. `004` shipped it again — <c>Error.Auth.InvalidCredentials</c> in
/// the `401` body, displayed verbatim on the login screen, and found by the frontend lane running
/// the real API rather than by any server test.
/// </para>
/// <para>
/// Two occurrences is a pattern, and per-criterion assertions will not catch the third: they only
/// look where someone thought to look. This asserts the <b>shape</b> instead — a resource key looks
/// like <c>Word.Word.Word</c> and a sentence does not — across every error response the suite can
/// reach. It cannot prove a key is absent from a path nothing exercises, which is stated in
/// `tests.md` rather than implied away.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class ResourceKeyLeakTests(WaslApiFactory factory)
{
    /// <summary>
    /// <c>Error.Auth.InvalidCredentials</c>, <c>Validation.Ticket.NoteTooLong</c> — two or more
    /// dot-separated PascalCase words, no spaces. No English sentence matches this.
    /// </summary>
    private static readonly Regex LooksLikeAResourceKey =
        new(@"^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*){1,}$", RegexOptions.Compiled);

    public static TheoryData<string, Func<HttpClient, Task<HttpResponseMessage>>> ErrorResponses() =>
        new()
        {
            {
                "401 rejected credentials",
                client => client.PostAsJsonAsync("/api/auth/token", new
                {
                    email = SupportUserSeeder.ManagerEmail,
                    password = "definitely-not-the-password",
                })
            },
            {
                "400 sign-in validation",
                client => client.PostAsJsonAsync("/api/auth/token", new { email = "", password = "" })
            },
            {
                "404 unknown ticket",
                client => client.GetAsync($"/api/tickets/{Guid.CreateVersion7()}")
            },
            {
                "400 create-ticket validation",
                client => client.PostAsJsonAsync("/api/tickets", new
                {
                    customerId = Guid.CreateVersion7(),
                    subject = "",
                    description = "",
                    category = "Technical",
                    channel = "Email",
                })
            },
            {
                "400 malformed enum",
                client => client.PostAsJsonAsync("/api/tickets", new
                {
                    customerId = Guid.CreateVersion7(),
                    subject = "x",
                    description = "y",
                    category = "NotACategory",
                    channel = "Email",
                })
            },
        };

    [Theory]
    [MemberData(nameof(ErrorResponses))]
    public async Task No_error_response_renders_a_resource_key(
        string label,
        Func<HttpClient, Task<HttpResponseMessage>> call)
    {
        var response = await call(factory.CreateManagerClient());

        response.IsSuccessStatusCode.Should().BeFalse($"{label} must be an error");

        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        AssertNotAKey(body, "title", label);
        AssertNotAKey(body, "detail", label);

        if (body.TryGetProperty("errors", out var errors))
        {
            foreach (var field in errors.EnumerateObject())
            {
                foreach (var message in field.Value.EnumerateArray())
                {
                    message.GetString().Should().NotMatchRegex(LooksLikeAResourceKey.ToString(),
                        $"{label}: errors.{field.Name} carries an unresolved key. Add it to "
                        + "StaticProblemMessageSource — the source returns the key rather than "
                        + "throwing, so the response looks correct and says nothing");
                }
            }
        }
    }

    /// <summary>
    /// A closed ticket refuses a status change, and the `409` must explain itself in words.
    /// </summary>
    /// <remarks>
    /// Separate because it needs a ticket walked to `Closed` first. It is the shape of the
    /// response `012` AC-3 caught the original defect in.
    /// </remarks>
    [Fact]
    public async Task A_conflict_on_a_closed_ticket_explains_itself_in_words()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var client = factory.CreateManagerClient();

        var created = await client.PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Resource key guard",
            description = "Walked to Closed so the 409 can be inspected.",
            category = "Technical",
            channel = "Email",
        });

        var ticket = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement;
        var id = ticket.GetProperty("id").GetGuid();
        var version = ticket.GetProperty("version").GetString();

        var closed = await client.PutAsJsonAsync($"/api/tickets/{id}/status", new
        {
            status = "Closed",
            expectedVersion = version,
            note = "closing so the conflict can be provoked",
        });

        var live = JsonDocument.Parse(await closed.Content.ReadAsStringAsync())
            .RootElement.GetProperty("version").GetString();

        var conflict = await client.PutAsJsonAsync($"/api/tickets/{id}/status", new
        {
            status = "Open",
            expectedVersion = live,
        });

        var body = JsonDocument.Parse(await conflict.Content.ReadAsStringAsync()).RootElement;

        AssertNotAKey(body, "title", "409 ticket-closed");
        AssertNotAKey(body, "detail", "409 ticket-closed");
    }

    private static void AssertNotAKey(JsonElement body, string property, string label)
    {
        if (!body.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.String)
        {
            return;
        }

        value.GetString().Should().NotMatchRegex(LooksLikeAResourceKey.ToString(),
            $"{label}: `{property}` is a raw resource key, not a message. BR-8.6 requires the "
            + "server to localize the strings it authors, and the message source returns an "
            + "unknown key verbatim rather than throwing — so a missing entry produces a "
            + "well-formed response that says nothing. Add the key to StaticProblemMessageSource");
    }
}
