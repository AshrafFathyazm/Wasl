using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Domain.Audit;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Tickets;

/// <summary>
/// Recording a reply that came <b>from the customer</b>, and the split feed. `034`.
/// </summary>
/// <remarks>
/// <para>
/// Real HTTP against a real SQL Server, which is the only place three of these can be proved: the
/// check constraint, the audit row's actor, and the two counts.
/// </para>
/// <para>
/// <b>Every assertion is scoped to a ticket this test created.</b> The suite shares one container
/// and therefore one database, so a <c>COUNT(*)</c> over a table would be right today and
/// intermittently wrong depending on which tests ran first.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class CustomerAuthoredCommentTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<(Guid TicketId, Guid CustomerId)> NewTicketAsync()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateEnglishManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Duplicate charge",
            description = "Charged twice for one purchase.",
            category = "Billing",
            channel = "Email",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        return ((await BodyOf(response)).GetProperty("id").GetGuid(), customerId);
    }

    private Task<HttpResponseMessage> PostCommentAsync(Guid ticketId, object body) =>
        factory.CreateEnglishManagerClient()
            .PostAsJsonAsync($"/api/tickets/{ticketId}/comments", body);

    // ---- AC-1 · both people end up on the row --------------------------------------------------

    [Fact]
    public async Task A_customer_reply_records_the_customer_AND_the_support_user_who_typed_it()
    {
        var (ticketId, customerId) = await NewTicketAsync();

        var response = await PostCommentAsync(ticketId, new
        {
            body = "I called again to ask for written confirmation.",
            channel = "Email",
            authorCustomerId = customerId,
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var comment = await BodyOf(response);

        comment.GetProperty("authorKind").GetString().Should().Be("Customer");
        comment.GetProperty("author").GetProperty("id").GetGuid().Should().Be(customerId,
            "the screen shows the customer's name on their own reply");
        comment.GetProperty("recordedBy").GetProperty("id").GetGuid().Should().NotBe(customerId,
            "somebody typed it, and that somebody is a support user");

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var row = await context.TicketComments
            .SingleAsync(candidate => candidate.Id == comment.GetProperty("id").GetGuid());

        row.AuthorCustomerId.Should().Be(customerId);
        row.AuthorUserId.Should().NotBe(Guid.Empty,
            "AuthorUserId stays NOT NULL. Relaxing it is how the NULL actor `011` found on "
            + "TicketHistory.PerformedByUserId comes back — every row written, none attributable");
    }

    [Fact]
    public async Task An_agent_note_reports_no_recorder()
    {
        // The negative half. Without it, a handler that always populated `recordedBy` would pass
        // the test above while making the field meaningless.
        var (ticketId, _) = await NewTicketAsync();

        var response = await PostCommentAsync(ticketId, new { body = "Called the customer." });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var comment = await BodyOf(response);

        comment.GetProperty("authorKind").GetString().Should().Be("Agent");
        comment.GetProperty("recordedBy").ValueKind.Should().Be(JsonValueKind.Null,
            "the author and the recorder are one person here, and saying so twice says nothing");
    }

    // ---- AC-2 · the audit row names the support user, not the customer -------------------------

    [Fact]
    public async Task The_audit_row_names_the_support_user_who_recorded_it()
    {
        /* READ THE ACTOR COLUMNS, DO NOT COUNT THE ROWS.
         *
         * `011`'s defect was NULL on every history row while the count was right, and `003`
         * moved its interceptor one hook later while COUNT(*) still returned 1 and every
         * `Changes` came back null. A test that checks a row EXISTS stays green on both. */
        var (ticketId, customerId) = await NewTicketAsync();

        var response = await PostCommentAsync(ticketId, new
        {
            body = "Please confirm the refund date in writing.",
            channel = "WhatsApp",
            authorCustomerId = customerId,
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var entry = await context.Set<AuditEntry>()
            .Where(row => row.Action == "Ticket.CommentAdded" && row.EntityId == ticketId)
            .OrderByDescending(row => row.OccurredAtUtc)
            .FirstAsync();

        entry.ActorUserId.Should().NotBeNull(
            "a customer-authored comment is still caused by an authenticated support user");
        entry.ActorUserId.Should().NotBe(customerId,
            "the customer never signed in — attributing the write to them would be a fake actor");
    }

    // ---- AC-3 / AC-4 / AC-5 · the three refusals, over HTTP -----------------------------------

    [Fact]
    public async Task A_customer_reply_marked_internal_is_refused()
    {
        var (ticketId, customerId) = await NewTicketAsync();

        var response = await PostCommentAsync(ticketId, new
        {
            body = "Reply.",
            channel = "Email",
            isInternal = true,
            authorCustomerId = customerId,
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var problem = await BodyOf(response);

        /* READ THE MESSAGE, NOT THE SHAPE. CLAUDE.md: `errors[field]` with one entry is a shape
         * assertion, and all seventeen unresolved resource keys went out under exactly that —
         * a raw key is one array entry under the right field name. */
        problem.GetProperty("errors").GetProperty("isInternal").EnumerateArray()
            .Should().ContainSingle().Which.GetString()
            .Should().Be("A reply from the customer cannot be marked internal.");
    }

    [Fact]
    public async Task A_customer_reply_with_no_channel_is_refused()
    {
        var (ticketId, customerId) = await NewTicketAsync();

        var response = await PostCommentAsync(ticketId, new
        {
            body = "Reply.",
            authorCustomerId = customerId,
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await BodyOf(response)).GetProperty("errors").GetProperty("channel").EnumerateArray()
            .Should().ContainSingle().Which.GetString()
            .Should().Be("Say which channel the customer replied through.");
    }

    [Fact]
    public async Task A_reply_from_a_customer_who_is_not_on_this_ticket_is_refused()
    {
        var (ticketId, _) = await NewTicketAsync();
        var somebodyElse = await AuditFixture.SeedCustomerAsync(factory);

        var response = await PostCommentAsync(ticketId, new
        {
            body = "Reply.",
            channel = "Email",
            authorCustomerId = somebodyElse,
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var raw = await response.Content.ReadAsStringAsync();

        raw.Should().Contain("That customer is not the customer on this ticket.");
        raw.Should().NotContain(somebodyElse.ToString(),
            "echoing either customer back turns a wrong request into a lookup — BR-4.4's "
            + "enumeration oracle, on a different resource");
    }

    // ---- AC-7 / AC-9 / AC-10 · the split feed --------------------------------------------------

    [Fact]
    public async Task The_two_tabs_are_disjoint_and_both_counts_are_reported()
    {
        var (ticketId, customerId) = await NewTicketAsync();

        (await PostCommentAsync(ticketId, new { body = "Our note." })).StatusCode
            .Should().Be(HttpStatusCode.Created);
        (await PostCommentAsync(ticketId, new
        {
            body = "Their reply.",
            channel = "Email",
            authorCustomerId = customerId,
        })).StatusCode.Should().Be(HttpStatusCode.Created);

        var client = factory.CreateEnglishManagerClient();

        var comments = await BodyOf(await client.GetAsync(
            $"/api/tickets/{ticketId}/timeline?type=Comments"));
        var history = await BodyOf(await client.GetAsync(
            $"/api/tickets/{ticketId}/timeline?type=History"));

        var commentIds = comments.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid()).ToList();
        var historyIds = history.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid()).ToList();

        commentIds.Should().HaveCount(2);
        historyIds.Should().HaveCount(3, "Created, and a CommentAdded for each comment");

        /* ASSERTED BY IDENTITY, NOT BY COUNTING. `013` found a cursor that repeated an entry
         * across two pages and counting entries passed on it; only "no id appears twice"
         * caught it. The same assertion shape applies across the two tabs. */
        commentIds.Should().NotIntersectWith(historyIds);

        // Both totals on both responses — the tab the reader is not on still shows its number.
        foreach (var page in new[] { comments, history })
        {
            page.GetProperty("commentCount").GetInt32().Should().Be(2);
            page.GetProperty("historyCount").GetInt32().Should().Be(3);
        }
    }

    [Fact]
    public async Task Omitting_the_filter_still_returns_the_union()
    {
        // `013`'s behaviour, unchanged. The split is additive: a client that never learned about
        // `type` sees exactly what it saw before.
        var (ticketId, _) = await NewTicketAsync();

        (await PostCommentAsync(ticketId, new { body = "One." })).StatusCode
            .Should().Be(HttpStatusCode.Created);

        var page = await BodyOf(await factory.CreateEnglishManagerClient()
            .GetAsync($"/api/tickets/{ticketId}/timeline"));

        page.GetProperty("items").EnumerateArray().Should().HaveCount(3,
            "Created, the comment, and its CommentAdded row");
    }

    [Fact]
    public async Task The_customers_reply_is_attributed_to_the_customer_in_the_feed()
    {
        var (ticketId, customerId) = await NewTicketAsync();

        (await PostCommentAsync(ticketId, new
        {
            body = "Their reply.",
            channel = "Email",
            authorCustomerId = customerId,
        })).StatusCode.Should().Be(HttpStatusCode.Created);

        var page = await BodyOf(await factory.CreateEnglishManagerClient()
            .GetAsync($"/api/tickets/{ticketId}/timeline?type=Comments"));

        var entry = page.GetProperty("items").EnumerateArray().Single();

        entry.GetProperty("authorKind").GetString().Should().Be("Customer");
        entry.GetProperty("actor").GetProperty("id").GetGuid().Should().Be(customerId);
        entry.GetProperty("actor").GetProperty("role").ValueKind.Should().Be(JsonValueKind.Null,
            "Role carries SupportUserRole values; a third differently-sourced value in the same "
            + "field is how a client switches on a string that means two things");
        entry.GetProperty("recordedBy").GetProperty("id").GetGuid().Should().NotBe(customerId);
    }

    // ---- AC-16 · closed is terminal, and answers "closed" first --------------------------------

    [Fact]
    public async Task A_closed_ticket_refuses_a_customer_reply_and_says_closed()
    {
        var (ticketId, _) = await NewTicketAsync();
        var somebodyElse = await AuditFixture.SeedCustomerAsync(factory);

        var client = factory.CreateEnglishManagerClient();
        var ticket = await BodyOf(await client.GetAsync($"/api/tickets/{ticketId}"));

        var close = await client.PutAsJsonAsync($"/api/tickets/{ticketId}/status", new
        {
            status = "Closed",
            note = "Resolved with the customer by phone.",
            expectedVersion = ticket.GetProperty("version").GetString(),
        });
        close.StatusCode.Should().Be(HttpStatusCode.OK);

        /* THE REQUEST IS WRONG TWICE — closed AND the wrong customer — and the answer must be
         * "closed". That is the one that tells the caller no retry can succeed. The ordering is
         * asserted rather than assumed, the way `011` asserted a stale version is answered
         * before a denial. */
        var response = await PostCommentAsync(ticketId, new
        {
            body = "Reply.",
            channel = "Email",
            authorCustomerId = somebodyElse,
        });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().EndWith("errors/ticket-closed");
    }
}
