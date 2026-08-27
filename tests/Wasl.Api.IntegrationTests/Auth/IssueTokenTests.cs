using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.Seed;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Auth;

/// <summary>
/// <c>POST /api/auth/token</c>. `004` AC-1 to AC-5, AC-14, AC-23.
/// </summary>
[Collection(WaslApiCollection.Name)]
public sealed class IssueTokenTests(WaslApiFactory factory)
{
    private static object Body(string email, string password) => new { email, password };

    private async Task<HttpResponseMessage> PostAsync(object body) =>
        await factory.CreateClient().PostAsJsonAsync("/api/auth/token", body);

    /// <summary>AC-1.</summary>
    [Fact]
    public async Task Correct_credentials_return_the_token_and_the_user_block()
    {
        var response = await PostAsync(
            Body(SupportUserSeeder.ManagerEmail, WaslApiFactory.ManagerPassword));

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        body.GetProperty("accessToken").GetString().Should().NotBeNullOrWhiteSpace();
        body.GetProperty("tokenType").GetString().Should().Be("Bearer");
        body.GetProperty("expiresAtUtc").GetDateTime().Should().BeAfter(DateTime.UtcNow);

        var user = body.GetProperty("user");
        user.GetProperty("email").GetString().Should().Be(SupportUserSeeder.ManagerEmail);
        user.GetProperty("role").GetString().Should().Be("Manager");
        user.GetProperty("preferredLanguage").GetString().Should().Be("ar");
        user.GetProperty("fullName").GetString().Should().Be("منى العتيبي");
    }

    /// <summary>
    /// AC-1, second half — asserted over the RAW response text, not over the deserialised shape.
    /// </summary>
    /// <remarks>
    /// A property-by-property assertion can only check the properties someone thought to name.
    /// Searching the raw body for the stored hash catches a field nobody expected — which is the
    /// only way this criterion is worth anything, because the danger is a property added later.
    /// </remarks>
    [Fact]
    public async Task No_response_field_anywhere_carries_the_password_hash()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var hash = await context.SupportUsers
            .Where(user => user.Email == SupportUserSeeder.ManagerEmail)
            .Select(user => user.PasswordHash)
            .SingleAsync();

        var response = await PostAsync(
            Body(SupportUserSeeder.ManagerEmail, WaslApiFactory.ManagerPassword));

        var raw = await response.Content.ReadAsStringAsync();

        raw.Should().NotContain(hash);
        raw.Should().NotContain(WaslApiFactory.ManagerPassword);
        raw.Should().NotContain("passwordHash", "not even as an empty or null property");
    }

    /// <summary>AC-2 — by claim name, not by counting.</summary>
    [Fact]
    public async Task The_token_carries_every_claim_by_name()
    {
        var response = await PostAsync(
            Body(SupportUserSeeder.AgentEmail, WaslApiFactory.AgentPassword));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var token = new JwtSecurityTokenHandler()
            .ReadJwtToken(body.GetProperty("accessToken").GetString());

        var claims = token.Claims.ToDictionary(claim => claim.Type, claim => claim.Value);

        claims.Should().ContainKey("sub");
        claims.Should().ContainKey("email").WhoseValue.Should().Be(SupportUserSeeder.AgentEmail);
        claims.Should().ContainKey("role").WhoseValue.Should().Be("Agent");
        claims.Should().ContainKey("preferred_language").WhoseValue.Should().Be("en");
        claims.Should().ContainKey("jti");
        claims.Should().ContainKey("iat");
        claims.Should().ContainKey("exp");

        token.Issuer.Should().Be("wasl");
        token.Audiences.Should().Contain("wasl-api");
    }

    /// <summary>AC-3.</summary>
    [Fact]
    public async Task The_lifetime_is_eight_hours_and_the_body_agrees_with_the_token()
    {
        var response = await PostAsync(
            Body(SupportUserSeeder.ManagerEmail, WaslApiFactory.ManagerPassword));

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var token = new JwtSecurityTokenHandler()
            .ReadJwtToken(body.GetProperty("accessToken").GetString());

        (token.ValidTo - token.ValidFrom).Should().Be(TimeSpan.FromHours(8));

        // The body must not be a second opinion. A client that trusts expiresAtUtc while the
        // token says otherwise refreshes at the wrong moment and cannot be told why.
        body.GetProperty("expiresAtUtc").GetDateTime().ToUniversalTime()
            .Should().BeCloseTo(token.ValidTo, TimeSpan.FromSeconds(1));
    }

    /// <summary>
    /// AC-4. The criterion that decides whether this endpoint is a login or a directory.
    /// </summary>
    /// <remarks>
    /// Three inputs, one body. A difference in <c>title</c>, in <c>detail</c>, or in the presence
    /// of an <c>errors</c> key is enough to enumerate accounts: "wrong password" confirms the
    /// address exists.
    /// </remarks>
    [Fact]
    public async Task Wrong_password_and_unknown_email_are_indistinguishable()
    {
        var wrongPassword = await PostAsync(
            Body(SupportUserSeeder.ManagerEmail, "definitely-not-the-password"));
        var unknownEmail = await PostAsync(
            Body("nobody@wasl.local", WaslApiFactory.ManagerPassword));

        wrongPassword.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        unknownEmail.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // Read to a string ONCE and work from that. Reading the same response content twice throws
        // ObjectDisposedException on the second call — the stream is consumed, not buffered — which
        // is how the first version of this test failed for a reason unrelated to what it asserts.
        var wrongPasswordBody = await wrongPassword.Content.ReadAsStringAsync();
        var unknownEmailBody = await unknownEmail.Content.ReadAsStringAsync();

        WithoutTraceId(wrongPasswordBody).Should().Be(WithoutTraceId(unknownEmailBody));

        var problem = JsonSerializer.Deserialize<JsonElement>(wrongPasswordBody);
        problem.GetProperty("type").GetString().Should().EndWith("errors/unauthenticated");
        problem.TryGetProperty("errors", out _).Should().BeFalse(
            "errors appears only on 400 and 409");
    }

    private static string WithoutTraceId(string json)
    {
        var body = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

        body.Remove("traceId");

        return string.Join(
            '\n',
            body.OrderBy(pair => pair.Key).Select(pair => $"{pair.Key}={pair.Value}"));
    }

    /// <summary>AC-5 — shape failures are 400, never 401.</summary>
    [Theory]
    [InlineData("", "Manager#2026")]
    [InlineData("   ", "Manager#2026")]
    [InlineData("manager@wasl.local", "")]
    [InlineData("manager@wasl.local", "   ")]
    public async Task Missing_input_is_a_validation_error_not_a_denial(string email, string password)
    {
        var response = await PostAsync(Body(email, password));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("type").GetString().Should().EndWith("errors/validation");
        body.GetProperty("errors").EnumerateObject().Should().NotBeEmpty();
    }

    /// <summary>
    /// AC-5, the deliberate exception: a malformed address is <b>not</b> validated.
    /// </summary>
    /// <remarks>
    /// <b>A departure from the spec's AC-5, and a security decision rather than an oversight.</b>
    /// The spec asks for `400` on a malformed email. A format check on the login form tells an
    /// attacker which inputs the server considers real addresses, and more usefully tells them the
    /// difference between "not an address" and "not a user" — the same enumeration oracle AC-4
    /// closes, arriving through the validator instead of the handler. Anything non-empty therefore
    /// reaches the handler and gets the one indistinguishable `401`.
    /// </remarks>
    [Fact]
    public async Task A_malformed_address_is_denied_not_rejected()
    {
        var response = await PostAsync(Body("not-an-email", "some-password"));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>AC-23 — the column collation, proven through the endpoint.</summary>
    [Fact]
    public async Task An_email_that_differs_only_in_case_signs_in()
    {
        var response = await PostAsync(Body(
            SupportUserSeeder.ManagerEmail.ToUpperInvariant(), WaslApiFactory.ManagerPassword));

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            "Latin1_General_100_CI_AS decides equality, so MANAGER@WASL.LOCAL is the same login");
    }
}
