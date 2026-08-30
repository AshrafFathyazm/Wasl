using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Domain.Audit;
using Wasl.Infrastructure.Persistence;
using Wasl.Infrastructure.Persistence.Seed;

namespace Wasl.Api.IntegrationTests.Users;

/// <summary>
/// `PUT /api/me/language`. `005b`, FR-5.5, BR-8.1.
/// </summary>
/// <remarks>
/// The column, the claim and the culture provider that reads them were built by `004` and `005`.
/// This is the one endpoint that lets a user change the value — and the reason `014`'s manual
/// Arabic pass could not start.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class ChangeMyLanguageTests(WaslApiFactory factory)
{
    private static string? ContentLanguage(HttpResponseMessage response) =>
        response.Content.Headers.TryGetValues("Content-Language", out var values)
            ? values.FirstOrDefault()
            : null;

    private async Task<string> StoredLanguageAsync(string email)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return context.SupportUsers.Single(user => user.Email == email).PreferredLanguage;
    }

    /// <summary>
    /// AC-1, AC-2 — stored, and it reaches the next token.
    /// </summary>
    /// <remarks>
    /// <b>Asserted end to end, because the column and the claim being in step is the whole point
    /// of storing it.</b> A test that only read the row back would pass on a build where
    /// <c>JwtAccessTokenIssuer</c> had stopped reading the column, and the user would switch
    /// language to no effect forever.
    /// <br/>
    /// The second Agent is used rather than the Manager: the Manager's `ar` preference is what
    /// several other tests depend on, and this one changes what it touches.
    /// </remarks>
    [Fact]
    public async Task The_stored_preference_changes_and_reaches_the_next_token()
    {
        var before = await StoredLanguageAsync(SupportUserSeeder.AgentTwoEmail);
        var target = before == "ar" ? "en" : "ar";

        var response = await factory.CreateAgentTwoClient()
            .PutAsJsonAsync("/api/me/language", new { language = target });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await response.Content.ReadAsStringAsync()).Should().BeEmpty("204 carries no body");

        (await StoredLanguageAsync(SupportUserSeeder.AgentTwoEmail)).Should().Be(target);

        // AC-2. A fresh sign-in, and the claim must have followed.
        var token = await factory.CreateClient().PostAsJsonAsync("/api/auth/token", new
        {
            email = SupportUserSeeder.AgentTwoEmail,
            password = WaslApiFactory.AgentTwoPassword,
        });

        var accessToken = JsonDocument.Parse(await token.Content.ReadAsStringAsync())
            .RootElement.GetProperty("accessToken").GetString()!;

        DecodeClaim(accessToken, "preferred_language").Should().Be(target,
            "the column and the claim being in step is why the preference is stored at all");

        // Put it back, so this test does not decide what the rest of the suite reads.
        await factory.CreateAgentTwoClient()
            .PutAsJsonAsync("/api/me/language", new { language = before });
    }

    /// <summary>AC-9 — a preference is not a state machine.</summary>
    /// <remarks>
    /// `012` answers a same-status transition with `409`. That rule does not generalise here:
    /// nobody is racing anybody for their own setting, and a client that re-sends the value it
    /// already holds has not made a mistake.
    /// </remarks>
    [Fact]
    public async Task Setting_the_same_language_twice_is_not_a_conflict()
    {
        var current = await StoredLanguageAsync(SupportUserSeeder.AgentEmail);

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var response = await factory.CreateAgentClient()
                .PutAsJsonAsync("/api/me/language", new { language = current });

            response.StatusCode.Should().Be(HttpStatusCode.NoContent, "attempt {0}", attempt + 1);
        }
    }

    /// <summary>
    /// AC-3 — two locales, lowercase, and a region tag is refused.
    /// </summary>
    /// <remarks>
    /// <b><c>ar-SA</c> is a `400` here even though <c>Accept-Language: ar-SA</c> resolves to `ar`
    /// on a read.</b> Resolution may fall back; storage may not, because a stored `ar-SA` is a
    /// stored value with no catalogue behind it. The frozen contract states it and this asserts
    /// it, so the asymmetry cannot be "tidied" later by someone who has met only one half.
    /// </remarks>
    [Theory]
    [InlineData("ar-SA")]
    [InlineData("en-GB")]
    [InlineData("AR")]
    [InlineData("fr")]
    [InlineData("")]
    [InlineData("   ")]
    public async Task An_unsupported_or_regional_language_is_refused(string language)
    {
        var response = await factory.CreateEnglishManagerClient()
            .PutAsJsonAsync("/api/me/language", new { language });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        body.GetProperty("type").GetString().Should().Be("https://wasl.local/errors/validation");
        body.GetProperty("errors").TryGetProperty("language", out var messages).Should().BeTrue();

        // Content, not shape. `004b` found seventeen raw keys under assertions that only counted
        // entries — a raw key is exactly one entry under exactly the right field name.
        messages[0].GetString().Should().BeOneOf(
            "Choose a language.", "Choose either English or Arabic.");
    }

    /// <summary>AC-4 — no token is `401`.</summary>
    [Fact]
    public async Task An_anonymous_request_is_unauthenticated()
    {
        var response = await factory.CreateClient()
            .PutAsJsonAsync("/api/me/language", new { language = "en" });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>
    /// AC-6 — the header names the locale applied to THIS request, not the new one.
    /// </summary>
    /// <remarks>
    /// <b>The single most confusing thing about this endpoint, asserted so that it cannot be filed
    /// as a defect later.</b> The culture was resolved from the claim that was current when the
    /// request arrived — long before the handler ran — so a `204` confirming a switch to `ar`
    /// still carries the language the caller was already using. A client reading this header to
    /// confirm the switch will conclude it failed.
    /// </remarks>
    [Fact]
    public async Task The_response_names_the_locale_of_this_request_not_the_new_one()
    {
        // The English-pinned client sends `?culture=en`, which outranks everything (BR-8.4), so
        // the request's own locale is known regardless of what the token claims.
        var response = await factory.CreateEnglishManagerClient()
            .PutAsJsonAsync("/api/me/language", new { language = "ar" });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        ContentLanguage(response).Should().Be("en",
            "the culture was resolved before the handler ran, so this names the language in use "
            + "BEFORE the switch. It is behaviour, not a defect — the frozen contract says so");
    }

    /// <summary>AC-5 — the change is audited, in the same transaction.</summary>
    [Fact]
    public async Task A_language_change_writes_one_audit_row_naming_the_actor()
    {
        var before = (await AuditFixture.RowsForAsync(factory, "User.LanguageChanged")).Count;

        var response = await factory.CreateAgentClient()
            .PutAsJsonAsync("/api/me/language", new { language = "en" });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var rows = (await AuditFixture.RowsForAsync(factory, "User.LanguageChanged"))
            .OrderByDescending(entry => entry.OccurredAtUtc)
            .ToList();

        rows.Should().HaveCount(before + 1);
        rows[0].Outcome.Should().Be(AuditOutcome.Success);
        rows[0].ActorEmail.Should().Be(SupportUserSeeder.AgentEmail);
        rows[0].EntityLabel.Should().Be("en", "the new language is what an investigation reads");
    }

    /// <summary>
    /// AC-7 — the request shape offers no way to name another user.
    /// </summary>
    /// <remarks>
    /// Asserted against the command's own surface rather than by trying an attack: there is no
    /// field to send, so there is nothing to defend. A future refactor that added a `userId`
    /// property would fail here before anyone had to think of the exploit.
    /// </remarks>
    [Fact]
    public void The_command_carries_no_user_identifier()
    {
        typeof(Wasl.Application.Features.Users.ChangeMyLanguage.ChangeMyLanguageCommand)
            .GetProperties()
            .Select(property => property.Name)
            .Should().NotContain(
                name => name.Contains("User", StringComparison.OrdinalIgnoreCase)
                    || name.Contains("Id", StringComparison.OrdinalIgnoreCase),
                "`me` is the subject of the token. A field naming a user would make one user able "
                + "to write another's preference, and no check is stronger than having nothing to "
                + "check");
    }

    private static string? DecodeClaim(string jwt, string claim)
    {
        var payload = jwt.Split('.')[1].Replace('-', '+').Replace('_', '/');
        payload = payload.PadRight(payload.Length + ((4 - (payload.Length % 4)) % 4), '=');

        return JsonDocument.Parse(Convert.FromBase64String(payload))
            .RootElement.TryGetProperty(claim, out var value) ? value.GetString() : null;
    }
}
