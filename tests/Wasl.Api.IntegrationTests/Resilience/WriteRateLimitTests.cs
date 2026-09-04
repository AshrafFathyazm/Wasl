using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Users;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Resilience;

/// <summary>
/// `036` §3.4 — the general write limit. AC-11 to AC-14.
/// </summary>
/// <remarks>
/// <para>
/// <b>Every burst here runs as a support user this class created, never as the seeded Manager or
/// either Agent.</b> The limiter partitions per caller, so spending sixty writes as a shared
/// identity would leave every test that runs in the next minute one request from a `429` — an
/// intermittent failure in an unrelated class, which is the worst way to find out.
/// </para>
/// <para>
/// The requests are <c>PUT</c>s at a ticket id that does not exist. The limiter runs in
/// middleware, ahead of MVC, so a request that will `404` still consumes a permit — which is what
/// lets this measure the limit without writing sixty tickets into a shared database.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class WriteRateLimitTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>
    /// The limit this class tests against. Small on purpose.
    /// </summary>
    /// <remarks>
    /// <b>Five, not the production sixty.</b> Sixty would mean sixty HTTP round trips per test
    /// against a container, four times over — minutes of wall clock to prove arithmetic that is
    /// identical at five. What is under test is that the limiter counts, partitions and refuses
    /// correctly; the NUMBER is configuration, and `036` §3.4 makes it configuration precisely so
    /// it can differ per deployment.
    /// </remarks>
    private const int WritesPerWindow = 5;

    /// <summary>
    /// A host with the small limit, over the SAME container and the same seeded data.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The shared factory cannot be used directly here, and that is the whole reason this
    /// helper exists.</b> <c>WaslApiFactory</c> raises the limit to 100000 so the rest of the
    /// suite is not throttled by it — measured, after a run in which the limiter failed 174
    /// unrelated tests. A limiter test running under that setting would assert nothing.
    /// </para>
    /// <para>
    /// <c>WithWebHostBuilder</c> builds a second host from the same fixture, so the connection
    /// strings, the seeded users and the container are all the ones the suite already set up —
    /// only the one setting differs.
    /// </para>
    /// </remarks>
    private WebApplicationFactory<Program> LimitedHost() =>
        factory.WithWebHostBuilder(builder =>
            builder.UseSetting(WaslApiFactory.RateLimitKey, WritesPerWindow.ToString()));

    /// <summary>
    /// A support user nothing else uses, and a token for them.
    /// </summary>
    /// <remarks>
    /// <c>RandomNumberGenerator</c> for the discriminator, never a slice of a UUIDv7 —
    /// `CLAUDE.md`, and `007` collided two customers on a unique index doing exactly that.
    /// </remarks>
    private async Task<HttpClient> CreatePrivateClientAsync(
        WebApplicationFactory<Program> host,
        string language = "en",
        string password = "Private-Pa55!")
    {
        var email = $"limit-{RandomNumberGenerator.GetInt32(1_000_000_000):D9}@wasl.local";

        using (var scope = factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

            // ── The language is on the USER, not on an Accept-Language header ────────
            //
            // MEASURED. The localization test first sent `Accept-Language: ar` and got `en` back
            // — because BR-8.4's resolution order is `?culture=` → the user's stored
            // PreferredLanguage → Accept-Language → `en`, and a user seeded with the default
            // outranks the header. That is `005` working correctly, and asserting through the
            // header would have made this test a statement about the wrong mechanism.
            context.SupportUsers.Add(SupportUser.Create(
                "Rate Limit Probe", email, hasher.Hash(password), SupportRole.Agent,
                new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                preferredLanguage: language));

            await context.SaveChangesAsync();
        }

        var signIn = await host.CreateClient()
            .PostAsJsonAsync("/api/auth/token", new { email, password });

        signIn.StatusCode.Should().Be(HttpStatusCode.OK);

        var token = (await BodyOf(signIn)).GetProperty("accessToken").GetString();

        var client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return client;
    }

    /// <summary>
    /// Writes until the limiter refuses, or until the budget is provably not enforced.
    /// </summary>
    /// <remarks>
    /// One more than the permit limit, sequentially. Sequential rather than parallel because a
    /// parallel burst can interleave with the window's replenishment and make the count
    /// ambiguous — and the thing under test is the limit, not the concurrency of the limiter.
    /// </remarks>
    private static async Task<HttpResponseMessage> BurstUntilRefusedAsync(HttpClient client)
    {
        HttpResponseMessage last = null!;

        for (var attempt = 0; attempt <= WritesPerWindow; attempt++)
        {
            last = await client.PutAsJsonAsync(
                $"/api/tickets/{Guid.CreateVersion7()}/status",
                new { status = "Open", expectedVersion = "AAAAAAAAB9E=" });

            if (last.StatusCode == HttpStatusCode.TooManyRequests)
            {
                return last;
            }
        }

        return last;
    }

    // ---- AC-11 ------------------------------------------------------------------------------

    /// <summary>
    /// Past the limit: `429 errors/rate-limited` with a usable <c>Retry-After</c>.
    /// </summary>
    /// <remarks>
    /// <b>The same <c>type</c> `004b` froze, not a second `429` shape.</b> A client backs off
    /// identically for a throttled sign-in and a throttled write, so inventing a second type
    /// would make it learn two names for one reaction.
    /// </remarks>
    [Fact]
    public async Task Past_the_limit_a_write_is_refused_with_429_and_a_Retry_After()
    {
        using var host = LimitedHost();
        var client = await CreatePrivateClientAsync(host);

        var refused = await BurstUntilRefusedAsync(client);

        refused.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);

        refused.Headers.TryGetValues("Retry-After", out var retryAfter).Should().BeTrue();

        // Never zero — `004b`'s rule. A Retry-After of 0 invites the immediate retry the header
        // exists to prevent, and a client that honours it faithfully then hammers hardest.
        int.Parse(retryAfter!.Single()).Should().BeGreaterThanOrEqualTo(1);

        (await BodyOf(refused)).GetProperty("type").GetString()
            .Should().EndWith("/rate-limited");
    }

    // ---- AC-14 · the part a status assertion cannot see --------------------------------------

    /// <summary>
    /// The `429` is a full envelope and is localized.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>A limiter rejects the way routing does — by writing a status and stopping</b> — so
    /// nothing is thrown, <c>UseExceptionHandler</c> is never entered, and the default body is
    /// EMPTY. That is `002b`'s finding arriving on a new path, and an empty body passes every
    /// status assertion while <c>code === 'rate-limited'</c> stays false forever.
    /// </para>
    /// <para>
    /// <c>Content-Language</c> is asserted because <c>UseRateLimiter</c> is registered AFTER
    /// <c>UseRequestLocalization</c> for exactly this reason. Move it earlier and this goes red
    /// while every other test stays green — which is the shape `005` measured for the `401`.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task The_429_is_enveloped_and_localized()
    {
        using var host = LimitedHost();
        var client = await CreatePrivateClientAsync(host, language: "ar");

        var refused = await BurstUntilRefusedAsync(client);

        refused.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);

        var body = await BodyOf(refused);

        // Content, not presence. `CLAUDE.md`: a test checking that a field EXISTS would have
        // stayed green on every one of the seventeen raw resource keys `004b` found.
        body.GetProperty("type").GetString().Should().EndWith("/rate-limited");
        body.GetProperty("status").GetInt32().Should().Be(429);
        body.GetProperty("traceId").GetString().Should().NotBeNullOrWhiteSpace();

        var title = body.GetProperty("title").GetString();

        // Not a raw resource key. `002`'s message source returns the KEY when it cannot resolve
        // one, which is well-formed and useless — and has shipped three times.
        title.Should().NotStartWith("Error.");
        title.Should().NotBeNullOrWhiteSpace();

        refused.Content.Headers.ContentLanguage.Should().Contain("ar");
    }

    // ---- AC-12 · the sign-in throttle is NOT replaced -----------------------------------------

    /// <summary>
    /// <c>POST /api/auth/token</c> is exempt, so a busy office is not locked out by its address.
    /// </summary>
    /// <remarks>
    /// <b>`004b` AC-37 in a new place.</b> Sign-in is unauthenticated, so the general limiter
    /// would partition it by address — and every user behind one NAT address would share sixty
    /// sign-ins a minute between them. `004b` chose the <c>(address, email)</c> pair precisely to
    /// avoid that, and layering an address-only limit on top would put it back.
    /// </remarks>
    [Fact]
    public async Task Sign_in_is_exempt_from_the_general_write_limit()
    {
        using var host = LimitedHost();
        var client = host.CreateClient();

        // Well past the general limit, and every one of them a failure — so `004b`'s own throttle
        // is the only thing that may answer 429, and it answers with its own message.
        for (var attempt = 0; attempt < WritesPerWindow + 5; attempt++)
        {
            var response = await client.PostAsJsonAsync("/api/auth/token", new
            {
                email = $"nobody-{RandomNumberGenerator.GetInt32(1_000_000_000):D9}@wasl.local",
                password = "wrong-password",
            });

            // A distinct email each time, so `004b`'s (address, email) pair never accumulates ten
            // failures for one pair. Anything but 401 here means the GENERAL limiter reached this
            // endpoint, which is what this test forbids.
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
                "the general write limiter must not apply to sign-in");
        }
    }

    // ---- AC-13 -------------------------------------------------------------------------------

    /// <summary>
    /// <c>/health</c> is never limited.
    /// </summary>
    /// <remarks>
    /// A load balancer polls it, and a probe answering `429` reports the application as unhealthy
    /// while it is behaving correctly — the same failure `004` avoided by making <c>/health</c>
    /// explicitly anonymous rather than assuming health checks were exempt.
    /// </remarks>
    [Fact]
    public async Task Health_is_never_limited()
    {
        using var host = LimitedHost();
        var client = host.CreateClient();

        for (var attempt = 0; attempt < WritesPerWindow + 5; attempt++)
        {
            var response = await client.GetAsync("/health");

            response.StatusCode.Should().NotBe(HttpStatusCode.TooManyRequests);
        }
    }
}
