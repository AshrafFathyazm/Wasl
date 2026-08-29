using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Domain.Audit;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Auth;

/// <summary>
/// The last gap in BR-9.4, closed. `004b` AC-17 to AC-19, AC-31 to AC-38.
/// </summary>
/// <remarks>
/// Until `004b`, <c>dbo.AuditLog</c> had <b>no record of anyone being refused access</b>: sign-in
/// success and failure wrote rows through the pipeline, and a denial by the authorization
/// middleware threw nothing, so MediatR never saw it. `011` measured the consequence — the
/// placement of a permission check decided whether the refusal was recorded at all.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class AuthDenialAuditTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<int> CountAsync(string action)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.AuditLog.CountAsync(entry => entry.Action == action);
    }

    // ── AC-17, AC-19, AC-31, AC-32 · the 401 ────────────────────────────────────────

    /// <summary>AC-17, AC-19, AC-31, AC-32.</summary>
    [Fact]
    public async Task A_request_with_no_token_writes_one_denied_row_and_a_real_body()
    {
        var before = await CountAsync("Auth.Unauthenticated");

        var response = await factory.CreateClient().GetAsync("/api/tickets");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // AC-31. Over the RAW text — an empty body and a body of nulls are indistinguishable once
        // deserialised, and empty is exactly what this returned before `004b`.
        var raw = await response.Content.ReadAsStringAsync();
        raw.Should().NotBeEmpty("the middleware's 401 used to have no body at all");

        var problem = JsonDocument.Parse(raw).RootElement;
        problem.GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/unauthenticated");
        problem.GetProperty("status").GetInt32().Should().Be(401);
        problem.GetProperty("instance").GetString().Should().Be("/api/tickets");

        var rows = (await AuditFixture.RowsForAsync(factory, "Auth.Unauthenticated"))
            .OrderByDescending(entry => entry.OccurredAtUtc)
            .ToList();

        rows.Should().HaveCount(before + 1, "exactly one row per denial");

        var row = rows[0];
        row.Outcome.Should().Be(AuditOutcome.Denied);

        // AC-19, BR-9.9 — the row and the response are findable from each other.
        row.TraceId.Should().Be(problem.GetProperty("traceId").GetString());

        // AC-32. Null asserted, not omitted: a challenge means there was no authenticated
        // identity, so there is no actor — and "somebody with no token asked for this" is still
        // the fact worth recording.
        row.ActorUserId.Should().BeNull();
        row.ActorEmail.Should().BeNull();
        row.ActorRole.Should().BeNull();
    }

    // ── AC-18, AC-32 · the 403 ──────────────────────────────────────────────────────

    /// <summary>
    /// AC-18 — and the row is present although no business transaction committed.
    /// </summary>
    /// <remarks>
    /// The BR-9.4 asymmetry, on the half `004` left open. The Agent's token is valid, so the
    /// actor columns are populated here where the `401`'s are null.
    /// </remarks>
    [Fact]
    public async Task An_agents_token_on_a_manager_endpoint_writes_one_forbidden_row()
    {
        var before = await CountAsync("Auth.Forbidden");

        var response = await factory.CreateAgentClient()
            .GetAsync(AuthProbeEndpoints.ManagerOnlyPath);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var problem = await BodyOf(response);
        problem.GetProperty("type").GetString().Should().Be("https://wasl.local/errors/forbidden");

        var rows = (await AuditFixture.RowsForAsync(factory, "Auth.Forbidden"))
            .OrderByDescending(entry => entry.OccurredAtUtc)
            .ToList();

        rows.Should().HaveCount(before + 1);

        var row = rows[0];
        row.Outcome.Should().Be(AuditOutcome.Denied);
        row.TraceId.Should().Be(problem.GetProperty("traceId").GetString());

        // AC-32's other half — there IS a principal here, so the row names it.
        row.ActorEmail.Should().Be(Wasl.Api.Seed.SupportUserSeeder.AgentEmail);
        row.ActorRole.Should().Be("Agent");
        row.ActorUserId.Should().NotBeNull();
    }

    // ── AC-33 · health is still silent ──────────────────────────────────────────────

    /// <summary>AC-33 — `004` AC-20 preserved.</summary>
    /// <remarks>
    /// A liveness probe runs every few seconds. Auditing it would bury every real event, and it is
    /// anonymous by design so there is no denial to record.
    /// </remarks>
    [Fact]
    public async Task Health_still_writes_no_denial_row()
    {
        var before = await CountAsync("Auth.Unauthenticated");

        (await factory.CreateClient().GetAsync("/health")).StatusCode
            .Should().Be(HttpStatusCode.OK);

        (await CountAsync("Auth.Unauthenticated")).Should().Be(before);
    }

    // ── AC-34 · nothing sensitive ───────────────────────────────────────────────────

    /// <summary>
    /// AC-34 — asserted by searching every column, not by reading the writer.
    /// </summary>
    /// <remarks>
    /// The shape `013` AC-18 used to prove `003`'s redaction, and the reason it caught anything:
    /// the risk is a column somebody adds later, which only a scan over the whole row sees.
    /// </remarks>
    [Fact]
    public async Task The_denial_row_carries_no_token_and_no_header_value()
    {
        var token = factory.AgentToken;

        await factory.CreateAgentClient().GetAsync(AuthProbeEndpoints.ManagerOnlyPath);

        var row = (await AuditFixture.RowsForAsync(factory, "Auth.Forbidden"))
            .OrderByDescending(entry => entry.OccurredAtUtc)
            .First();

        var everyColumn = string.Join(' ', new[]
        {
            row.ActorEmail, row.ActorRole, row.Action, row.EntityType, row.EntityLabel,
            row.Changes, row.TraceId, row.EntityId?.ToString(), row.IpAddress, row.UserAgent,
        });

        everyColumn.Should().NotContain(token, "the bearer token must not reach any column");
        everyColumn.Should().NotContain("Bearer", "nor the header that carried it");
        everyColumn.ToLowerInvariant().Should().NotContain("password");
    }

    // ── AC-35 … AC-37 · the throttle ────────────────────────────────────────────────

    /// <summary>
    /// AC-35, AC-36, AC-37 — the three in one run, because they describe one behaviour.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>AC-37 is the criterion that decides whether the limit is usable</b>, and it is why the
    /// key is (address, email) rather than address alone: an office behind one NAT address must
    /// not lock out its own staff. Email alone would be the account lockout the ruling rejected,
    /// because anyone who knows an address could then lock its owner out from anywhere.
    /// </para>
    /// <para>
    /// The victim address is minted per run, so the counter starts empty however many times the
    /// suite has run against this container.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Repeated_failures_are_throttled_without_blocking_anyone_else()
    {
        var victim = $"t{Convert.ToHexString(RandomNumberGenerator.GetBytes(5)).ToLowerInvariant()}@wasl.local";
        var client = factory.CreateClient();
        var before = await CountAsync("Auth.RateLimited");

        HttpResponseMessage? limited = null;

        for (var attempt = 1; attempt <= 12 && limited is null; attempt++)
        {
            var response = await client.PostAsJsonAsync(
                "/api/auth/token", new { email = victim, password = "wrong" });

            if (response.StatusCode is HttpStatusCode.TooManyRequests)
            {
                limited = response;
            }
            else
            {
                response.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
                    $"attempt {attempt} is a wrong password, not a malformed request");
            }
        }

        limited.Should().NotBeNull("ten failures in five minutes is the ruling's limit");

        // AC-35. Retry-After, because a client told to wait and not told how long retries at once.
        limited!.Headers.RetryAfter.Should().NotBeNull();
        limited.Headers.RetryAfter!.Delta!.Value.Should().BeGreaterThan(TimeSpan.Zero);

        var problem = await BodyOf(limited);
        problem.GetProperty("type").GetString().Should().Be("https://wasl.local/errors/rate-limited");
        problem.GetProperty("status").GetInt32().Should().Be(429);
        problem.TryGetProperty("errors", out _).Should().BeFalse("no field is at fault");

        // The body says nothing about the account — the same reasoning as `004` AC-4. A throttle
        // that answers differently for a real address than for an invented one is an enumeration
        // oracle wearing a rate limit.
        (await limited.Content.ReadAsStringAsync()).Should().NotContain(victim);

        // AC-36.
        var rows = (await AuditFixture.RowsForAsync(factory, "Auth.RateLimited"))
            .OrderByDescending(entry => entry.OccurredAtUtc)
            .ToList();

        rows.Should().HaveCountGreaterThan(before);
        rows[0].Outcome.Should().Be(AuditOutcome.Denied);
        rows[0].EntityLabel.Should().Be(victim, "the attempted address is what an investigation reads");
        rows[0].TraceId.Should().Be(problem.GetProperty("traceId").GetString());

        // AC-37. The seeded Manager, from the same client and therefore the same address.
        var manager = await client.PostAsJsonAsync("/api/auth/token", new
        {
            email = Wasl.Api.Seed.SupportUserSeeder.ManagerEmail,
            password = WaslApiFactory.ManagerPassword,
        });

        manager.StatusCode.Should().Be(HttpStatusCode.OK,
            "an office behind one NAT address must not lock out its own staff. Keying the throttle "
            + "by address alone would have failed here, and keying it by email alone would be the "
            + "account lockout the ruling rejected");
    }

    /// <summary>A successful sign-in records nothing, so it cannot contribute to a lockout.</summary>
    [Fact]
    public async Task A_successful_sign_in_is_never_counted()
    {
        var client = factory.CreateClient();

        for (var attempt = 0; attempt < 12; attempt++)
        {
            var response = await client.PostAsJsonAsync("/api/auth/token", new
            {
                email = Wasl.Api.Seed.SupportUserSeeder.ManagerEmail,
                password = WaslApiFactory.ManagerPassword,
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                $"attempt {attempt + 1} — twelve correct sign-ins in a row must all succeed. Only "
                + "failures count, or a shared machine locks itself out during a working day");
        }
    }

    // ── AC-38 · the allocation ──────────────────────────────────────────────────────

    /// <summary>
    /// AC-38 — a huge `expectedVersion` is refused by a length rule, not by allocating a buffer.
    /// </summary>
    /// <remarks>
    /// <c>Convert.TryFromBase64String</c> needs a destination the size of the input, so validating
    /// a ten-megabyte token used to allocate ten megabytes before refusing it. A `MaximumLength`
    /// rule refuses it first.
    /// <br/>
    /// The README recorded a Kestrel body limit as "the cleaner fix"; that was **wrong** and is
    /// corrected there — a global limit would also cap a legitimate 4000-character comment body,
    /// and the defect is one field.
    /// </remarks>
    [Fact]
    public async Task A_huge_expected_version_is_refused_by_length()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory, "expected-version probe");

        var created = await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Version length probe",
            description = "Created so a status change can carry an oversized token.",
            category = "Technical",
            channel = "Email",
        });

        var id = (await BodyOf(created)).GetProperty("id").GetGuid();

        var response = await factory.CreateManagerClient().PutAsJsonAsync(
            $"/api/tickets/{id}/status",
            new { status = "Open", expectedVersion = new string('A', 10_000_000) });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await BodyOf(response)).GetProperty("errors").TryGetProperty("expectedVersion", out _)
            .Should().BeTrue("refused by a rule on the field, before any base64 buffer exists");
    }
}
