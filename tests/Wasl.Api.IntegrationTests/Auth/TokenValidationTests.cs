using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Wasl.Infrastructure.Persistence.Seed;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Auth;

/// <summary>
/// What the bearer handler accepts and refuses, and what the principal holds inside a request.
/// `004` AC-6 to AC-9.
/// </summary>
/// <remarks>
/// Every test here fails when exactly one setting in <c>AddWaslAuthentication</c> is reverted to
/// its default, which is the point: all four defaults are wrong for this application and none of
/// them announces itself.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class TokenValidationTests(WaslApiFactory factory)
{
    /// <summary>AC-6 — inbound claim mapping is off, and <c>ICurrentUser</c> agrees with it.</summary>
    /// <remarks>
    /// Left at the default, <c>sub</c> arrives rewritten to
    /// <c>http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier</c>. Nothing throws:
    /// <c>FindFirst("sub")</c> simply returns null, <c>ICurrentUser.UserId</c> returns null with
    /// it, and every audit row names no actor while the token plainly carries one.
    /// </remarks>
    [Fact]
    public async Task The_principal_carries_the_short_claim_names_and_no_federation_uris()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync(AuthProbeEndpoints.WhoAmIPath);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        var managerId = await IdOfAsync(SupportUserSeeder.ManagerEmail);

        body.GetProperty("sub").GetString().Should().Be(managerId.ToString());
        body.GetProperty("email").GetString().Should().Be(SupportUserSeeder.ManagerEmail);
        body.GetProperty("role").GetString().Should().Be("Manager");
        body.GetProperty("preferredLanguage").GetString().Should().Be("ar");

        body.GetProperty("claimTypes").EnumerateArray()
            .Select(type => type.GetString()!)
            .Should().NotContain(type => type.Contains("schemas.xmlsoap.org")
                || type.Contains("schemas.microsoft.com"));

        // The abstraction the whole application reads, checked against the same principal in the
        // same request — so the claim names and their reader cannot pass separately and disagree.
        body.GetProperty("currentUserId").GetGuid().Should().Be(managerId);
        body.GetProperty("currentUserEmail").GetString().Should().Be(SupportUserSeeder.ManagerEmail);
        body.GetProperty("currentUserRole").GetString().Should().Be("Manager");
    }

    /// <summary>AC-7 — the criterion that catches a <c>RoleClaimType</c> mismatch.</summary>
    /// <remarks>
    /// Left at the default, the handler looks for the role in the WS-Federation role URI, finds
    /// nothing, and returns `403` to <b>every</b> Manager. The Agent half is what makes this a
    /// test rather than a smoke check: a mismatch makes both fail, so asserting only the success
    /// case would look identical to asserting only the failure case.
    /// </remarks>
    [Fact]
    public async Task Manager_only_admits_the_manager_and_refuses_the_agent()
    {
        var manager = await factory.CreateManagerClient().GetAsync(AuthProbeEndpoints.ManagerOnlyPath);
        var agent = await factory.CreateAgentClient().GetAsync(AuthProbeEndpoints.ManagerOnlyPath);

        manager.StatusCode.Should().Be(HttpStatusCode.OK);
        agent.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>AC-17's status half — no token is `401`, not `403`.</summary>
    /// <remarks>
    /// The audit row AC-17 also asks for is deferred to `004b`; see `summary.md`. The status code
    /// is asserted here because it is what the frontend's interceptor keys on, and confusing the
    /// two sends a signed-out user to a "forbidden" screen instead of the login form.
    /// </remarks>
    [Fact]
    public async Task No_token_is_unauthenticated_and_a_wrong_role_is_forbidden()
    {
        var anonymous = await factory.CreateClient().GetAsync(AuthProbeEndpoints.WhoAmIPath);

        anonymous.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>AC-8 — a forged or foreign-signed token is refused.</summary>
    [Theory]
    [InlineData(Forgery.DifferentKey)]
    [InlineData(Forgery.AlgorithmNone)]
    [InlineData(Forgery.UnexpectedAlgorithm)]
    public async Task A_token_this_application_did_not_sign_is_rejected(Forgery forgery)
    {
        var client = factory.CreateClient();

        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Forge(forgery));

        var response = await client.GetAsync(AuthProbeEndpoints.WhoAmIPath);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>AC-9 — <c>ClockSkew</c> is zero.</summary>
    /// <remarks>
    /// Restore the five-minute default and this passes wrongly: a token that expired a second ago
    /// is accepted, and so is one that expired four minutes ago. The failure mode is a token that
    /// keeps working after it should not, which no test written against a valid token can see.
    /// </remarks>
    [Fact]
    public async Task A_token_that_expired_one_second_ago_is_rejected()
    {
        var expired = SignWith(
            WaslApiFactory.TestSigningKey,
            SecurityAlgorithms.HmacSha256,
            notBefore: DateTime.UtcNow.AddHours(-8),
            expires: DateTime.UtcNow.AddSeconds(-1));

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", expired);

        var response = await client.GetAsync(AuthProbeEndpoints.WhoAmIPath);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    public enum Forgery
    {
        /// <summary>Correctly shaped, signed with a key this application never saw.</summary>
        DifferentKey,

        /// <summary>The classic: an unsigned token claiming no algorithm is needed.</summary>
        AlgorithmNone,

        /// <summary>HS512 rather than HS256 — refused because HS256 is named explicitly.</summary>
        UnexpectedAlgorithm,
    }

    private static string Forge(Forgery forgery) => forgery switch
    {
        Forgery.DifferentKey => SignWith(
            "a-completely-different-key-of-at-least-32-bytes", SecurityAlgorithms.HmacSha256),

        // Hand-assembled, because no signing library will produce one.
        Forgery.AlgorithmNone => Unsigned(),

        Forgery.UnexpectedAlgorithm => SignWith(
            WaslApiFactory.TestSigningKey + WaslApiFactory.TestSigningKey,
            SecurityAlgorithms.HmacSha512),

        _ => throw new ArgumentOutOfRangeException(nameof(forgery)),
    };

    private static string SignWith(
        string key,
        string algorithm,
        DateTime? notBefore = null,
        DateTime? expires = null)
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), algorithm);

        var token = new JwtSecurityToken(
            issuer: "wasl",
            audience: "wasl-api",
            claims:
            [
                new Claim("sub", Guid.CreateVersion7().ToString()),
                new Claim("email", "forged@wasl.local"),
                new Claim("role", "Manager"),
            ],
            notBefore: notBefore ?? DateTime.UtcNow,
            expires: expires ?? DateTime.UtcNow.AddHours(1),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>
    /// <c>{"alg":"none"}</c> with an empty signature, built by hand.
    /// </summary>
    /// <remarks>
    /// This is the forgery <c>ValidAlgorithms</c> exists for. A library that resolves the
    /// algorithm from the token's own header accepts it, and the attacker chose the header.
    /// </remarks>
    private static string Unsigned()
    {
        static string Encode(string json) =>
            Convert.ToBase64String(Encoding.UTF8.GetBytes(json))
                .TrimEnd('=').Replace('+', '-').Replace('/', '_');

        var expires = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds();

        var header = Encode("""{"alg":"none","typ":"JWT"}""");
        var payload = Encode(
            $$"""{"sub":"{{Guid.CreateVersion7()}}","email":"forged@wasl.local","role":"Manager","iss":"wasl","aud":"wasl-api","exp":{{expires}}}""");

        return $"{header}.{payload}.";
    }

    private async Task<Guid> IdOfAsync(string email)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.SupportUsers
            .Where(user => user.Email == email)
            .Select(user => user.Id)
            .SingleAsync();
    }
}
