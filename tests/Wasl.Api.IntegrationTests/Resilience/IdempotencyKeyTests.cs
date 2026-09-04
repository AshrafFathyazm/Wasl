using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Resilience;

/// <summary>
/// `036` §3.5 — <c>Idempotency-Key</c> on <c>POST /api/tickets</c>. AC-15 to AC-19.
/// </summary>
/// <remarks>
/// <b>Every count is scoped to one customer this test created.</b> The suite shares one database,
/// so a <c>COUNT</c> over <c>dbo.Tickets</c> would be right today and wrong depending on which
/// tests ran first — `CLAUDE.md`'s rule after `003`.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class IdempotencyKeyTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>
    /// Random, never a slice of a UUIDv7 — `CLAUDE.md`, and `007` collided two customers on a
    /// unique index doing exactly that.
    /// </summary>
    private static string NewKey() =>
        $"key-{RandomNumberGenerator.GetInt32(1_000_000_000):D9}-{RandomNumberGenerator.GetInt32(1_000_000_000):D9}";

    private static HttpRequestMessage Create(Guid customerId, string? key, string subject = "Idempotent")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/tickets")
        {
            Content = JsonContent.Create(new
            {
                customerId,
                subject,
                description = "A ticket created under an idempotency key.",
                category = "Billing",
                channel = "Email",
            }),
        };

        if (key is not null)
        {
            request.Headers.Add("Idempotency-Key", key);
        }

        return request;
    }

    private async Task<int> TicketCountForAsync(Guid customerId)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.Tickets.CountAsync(ticket => ticket.CustomerId == customerId);
    }

    // ---- AC-15 and AC-16 --------------------------------------------------------------------

    /// <summary>
    /// Two deliveries of one key create ONE ticket, and the second replays the first's response.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b><c>ticketNumber</c> is the assertion that matters, not the status.</b> A second run of
    /// the handler would draw a second value from <c>dbo.TicketNumberSeq</c>, so an identical
    /// number is proof the action did not execute twice — where two `201`s with two numbers would
    /// be the exact defect `CLAUDE.md` opens its concurrency checklist with.
    /// </para>
    /// <para>
    /// The row count is scoped to this test's customer, so it means one ticket and not "one more
    /// than before".
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Two_deliveries_of_one_key_create_one_ticket_and_replay_the_first_response()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var client = factory.CreateEnglishManagerClient();
        var key = NewKey();

        var first = await client.SendAsync(Create(customerId, key));
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        var second = await client.SendAsync(Create(customerId, key));

        var firstBody = await BodyOf(first);
        var secondBody = await BodyOf(second);

        // AC-16. Same ticket, same number, same Location — the replay names the ticket that
        // exists rather than creating a twin.
        secondBody.GetProperty("id").GetGuid()
            .Should().Be(firstBody.GetProperty("id").GetGuid());

        secondBody.GetProperty("ticketNumber").GetString()
            .Should().Be(firstBody.GetProperty("ticketNumber").GetString());

        second.Headers.Location.Should().Be(first.Headers.Location);

        // AC-15. One row, not two.
        (await TicketCountForAsync(customerId)).Should().Be(1);
    }

    // ---- AC-17 ------------------------------------------------------------------------------

    /// <summary>
    /// The same key with a different body is refused, never replayed.
    /// </summary>
    /// <remarks>
    /// <b>Replaying would be the dangerous answer.</b> It would report success for a request the
    /// server never ran, and the client would believe a ticket exists with the subject it just
    /// sent. Q-5's ruling, 2026-09-05: same key, different body is a `409`.
    /// </remarks>
    [Fact]
    public async Task The_same_key_with_a_different_body_is_a_409()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var client = factory.CreateEnglishManagerClient();
        var key = NewKey();

        (await client.SendAsync(Create(customerId, key, subject: "First subject")))
            .StatusCode.Should().Be(HttpStatusCode.Created);

        var second = await client.SendAsync(Create(customerId, key, subject: "A DIFFERENT subject"));

        second.StatusCode.Should().Be(HttpStatusCode.Conflict);

        (await BodyOf(second)).GetProperty("type").GetString()
            .Should().EndWith("/idempotency-conflict");

        // And nothing was written for the second attempt.
        (await TicketCountForAsync(customerId)).Should().Be(1);
    }

    // ---- AC-18 · the guarantee is the index, not the check -----------------------------------

    /// <summary>
    /// Two SIMULTANEOUS deliveries of one key produce one ticket.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This is the case a lookup cannot cover.</b> Both requests read an empty table and both
    /// try to reserve; only <c>UX_IdempotencyKeys_User_Endpoint_Key</c> stops the second.
    /// <c>CLAUDE.md</c>'s first concurrency row — *the client guard is not the guarantee*.
    /// </para>
    /// <para>
    /// The loser is answered `201` (it lost the race but the winner had already recorded a
    /// response) or `503 transient-conflict` (the winner had not finished yet). Both are correct
    /// and which one appears is timing; what must NEVER happen is a second row. So the row count
    /// is the assertion, and the status is only checked for the one value it may not be.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Two_simultaneous_deliveries_of_one_key_produce_one_ticket()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var client = factory.CreateEnglishManagerClient();
        var key = NewKey();

        var responses = await Task.WhenAll(
            client.SendAsync(Create(customerId, key)),
            client.SendAsync(Create(customerId, key)));

        (await TicketCountForAsync(customerId)).Should().Be(1);

        responses.Should().NotContain(
            response => response.StatusCode == HttpStatusCode.InternalServerError);
    }

    // ---- AC-19 · the header is opt-in ---------------------------------------------------------

    /// <summary>
    /// With no key, the endpoint behaves exactly as it did before `036`.
    /// </summary>
    /// <remarks>
    /// <b>Two clicks, two tickets — and that is the ASSERTION, not a known limitation.</b>
    /// Requiring the header would be a breaking change to a frozen contract, and
    /// `05-api-conventions.md` §Idempotency deliberately accepts double-submitted tickets rather
    /// than guessing intent. This test is what stops the default quietly changing.
    /// </remarks>
    [Fact]
    public async Task Without_a_key_two_identical_requests_still_create_two_tickets()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var client = factory.CreateEnglishManagerClient();

        (await client.SendAsync(Create(customerId, key: null))).StatusCode
            .Should().Be(HttpStatusCode.Created);
        (await client.SendAsync(Create(customerId, key: null))).StatusCode
            .Should().Be(HttpStatusCode.Created);

        (await TicketCountForAsync(customerId)).Should().Be(2);
    }

    // ---- The key is scoped to its owner ------------------------------------------------------

    /// <summary>
    /// One user's key never replays another user's response.
    /// </summary>
    /// <remarks>
    /// <b>The one security property in §3.5.</b> A globally scoped key would let any caller
    /// receive a ticket body they were never entitled to by reusing a key they saw or guessed.
    /// The unique index is <c>(UserId, Endpoint, KeyValue)</c> precisely so this cannot happen —
    /// and so two users may mint the same key without colliding.
    /// </remarks>
    [Fact]
    public async Task A_key_is_scoped_to_the_user_who_spent_it()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var key = NewKey();

        var manager = await factory.CreateManagerClient().SendAsync(Create(customerId, key));
        manager.StatusCode.Should().Be(HttpStatusCode.Created);

        var agent = await factory.CreateAgentClient().SendAsync(Create(customerId, key));
        agent.StatusCode.Should().Be(HttpStatusCode.Created);

        // Two DIFFERENT tickets: the agent ran the request rather than being handed the
        // manager's response.
        (await BodyOf(agent)).GetProperty("id").GetGuid()
            .Should().NotBe((await BodyOf(manager)).GetProperty("id").GetGuid());

        (await TicketCountForAsync(customerId)).Should().Be(2);
    }

    // ---- A failed request releases its key ----------------------------------------------------

    /// <summary>
    /// A key spent on a request that FAILED can be used again.
    /// </summary>
    /// <remarks>
    /// Otherwise a validation mistake would make the key unusable for twenty-four hours and the
    /// client could not correct it without minting a new one — which is a worse experience than
    /// the duplicate the key exists to prevent.
    /// </remarks>
    [Fact]
    public async Task A_key_spent_on_a_failed_request_can_be_reused()
    {
        var client = factory.CreateEnglishManagerClient();
        var key = NewKey();

        // A customer that does not exist — a `404` from the handler, so the reservation must be
        // released on the way out.
        var failed = await client.SendAsync(Create(Guid.CreateVersion7(), key));
        failed.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var corrected = await client.SendAsync(Create(customerId, key));
        corrected.StatusCode.Should().Be(HttpStatusCode.Created);
    }
}
