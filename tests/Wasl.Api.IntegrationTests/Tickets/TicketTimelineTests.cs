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
/// <c>POST /api/tickets/{id}/comments</c> and <c>GET /api/tickets/{id}/timeline</c>. `013`.
/// </summary>
[Collection(WaslApiCollection.Name)]
public sealed class TicketTimelineTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<(Guid Id, string Version)> NewTicketAsync()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Timeline test",
            description = "Created so the timeline has something to render.",
            category = "Technical",
            channel = "Email",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await BodyOf(response);

        return (body.GetProperty("id").GetGuid(), body.GetProperty("version").GetString()!);
    }

    private Task<HttpResponseMessage> CommentAsync(
        Guid id, string body, bool isInternal = false, string? channel = null) =>
        factory.CreateManagerClient().PostAsJsonAsync(
            $"/api/tickets/{id}/comments",
            channel is null
                ? new { body, isInternal }
                : (object)new { body, isInternal, channel });

    private async Task<JsonElement> TimelineAsync(Guid id, string? before = null, int? limit = null)
    {
        var query = before is null && limit is null
            ? string.Empty
            : "?" + string.Join('&', new[]
            {
                before is null ? null : $"before={Uri.EscapeDataString(before)}",
                limit is null ? null : $"limit={limit}",
            }.Where(part => part is not null));

        var response = await factory.CreateManagerClient()
            .GetAsync($"/api/tickets/{id}/timeline{query}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        return await BodyOf(response);
    }

    /// <summary>AC-1, AC-5, AC-6, AC-15.</summary>
    [Fact]
    public async Task A_comment_is_created_and_names_the_author_from_the_token()
    {
        var (id, _) = await NewTicketAsync();

        var response = await CommentAsync(id, "  The customer called back.  ", channel: "WhatsApp");

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location!.ToString().Should().Be($"/api/tickets/{id}/timeline",
            "a comment is append-only, so there is no GET for one — pointing Location at a route "
            + "that would 404 is worse than pointing at the feed the client reloads anyway");

        var body = await BodyOf(response);

        body.GetProperty("body").GetString().Should().Be("The customer called back.", "trimmed");
        body.GetProperty("isInternal").GetBoolean().Should().BeFalse();
        body.GetProperty("channel").GetString().Should().Be("WhatsApp");
        body.GetProperty("ticketNumber").GetString().Should().StartWith("TCK-");

        var author = body.GetProperty("author");
        author.GetProperty("fullName").GetString().Should().Be("منى العتيبي",
            "the seeded Manager, from the token — Arabic through the whole stack");
        author.GetProperty("role").GetString().Should().Be("Manager");
    }

    /// <summary>
    /// Arabic in a comment body round-trips byte-identical.
    /// </summary>
    /// <remarks>
    /// <b>Written because a manual check said otherwise, and the manual check was the liar.</b>
    /// Posting an Arabic body with PowerShell's <c>Invoke-RestMethod</c> stored <c>?????</c>: PS
    /// 5.1 encodes a string body as ASCII unless a charset is named, so the mangling happened
    /// before the request left the client. This asserts it through <c>PostAsJsonAsync</c>, which
    /// sends UTF-8 — and the column is <c>nvarchar(4000)</c>, which is the half that would fail if
    /// it were the server.
    /// <br/>
    /// A comment body is the single field in this product most likely to be written in Arabic, and
    /// <c>varchar</c> would return <c>????</c> and read as a font problem (ADR-013).
    /// </remarks>
    [Fact]
    public async Task Arabic_in_a_comment_body_round_trips()
    {
        const string arabic = "العميل اتصل مرة تانية ولسه المشكلة موجودة.";

        var (id, _) = await NewTicketAsync();

        var created = await BodyOf(await CommentAsync(id, arabic));
        created.GetProperty("body").GetString().Should().Be(arabic, "on the way out");

        var items = (await TimelineAsync(id)).GetProperty("items").EnumerateArray().ToList();

        items.Single(item => item.GetProperty("type").GetString() == "Comment")
            .GetProperty("body").GetString().Should().Be(arabic, "and back through the timeline");
    }

    /// <summary>AC-15, the half that matters: the body cannot name an author.</summary>
    [Fact]
    public async Task An_author_in_the_body_has_nowhere_to_arrive()
    {
        var (id, _) = await NewTicketAsync();
        var smuggled = Guid.CreateVersion7();

        var response = await factory.CreateAgentClient().PostAsJsonAsync(
            $"/api/tickets/{id}/comments",
            new { body = "Posted as an Agent", authorUserId = smuggled, createdAtUtc = "1999-01-01T00:00:00Z" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await BodyOf(response);

        body.GetProperty("author").GetProperty("id").GetGuid().Should().NotBe(smuggled);
        body.GetProperty("author").GetProperty("fullName").GetString().Should().Be("Omar Khalid",
            "the token's user, not the body's");

        body.GetProperty("createdAtUtc").GetDateTime().Should().BeAfter(new DateTime(2020, 1, 1),
            "a backdated createdAtUtc has nowhere to bind either");
    }

    /// <summary>AC-2 and AC-3.</summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n  ")]
    public async Task An_empty_body_is_refused(string body)
    {
        var (id, _) = await NewTicketAsync();

        var response = await CommentAsync(id, body);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var problem = await BodyOf(response);
        problem.GetProperty("type").GetString().Should().EndWith("errors/validation");
        problem.GetProperty("errors").GetProperty("body").EnumerateArray()
            .Select(message => message.GetString())
            .Should().ContainSingle().Which.Should().Be("Write something before posting.",
                "a message, not the key — `004b` found seventeen of those");
    }

    /// <summary>AC-3's boundary, both sides.</summary>
    [Fact]
    public async Task Four_thousand_characters_is_accepted_and_four_thousand_and_one_is_not()
    {
        var (id, _) = await NewTicketAsync();

        (await CommentAsync(id, new string('a', 4000))).StatusCode
            .Should().Be(HttpStatusCode.Created, "the column is nvarchar(4000)");

        var tooLong = await CommentAsync(id, new string('a', 4001));

        tooLong.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "one character over must be refused at the boundary — the column would silently "
            + "truncate it and store a comment that looks complete and is missing its last word");
    }

    /// <summary>AC-7.</summary>
    [Fact]
    public async Task An_invalid_channel_is_refused()
    {
        var (id, _) = await NewTicketAsync();

        var response = await CommentAsync(id, "Fine body", channel: "Telepathy");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>AC-4, BR-5.2.</summary>
    [Fact]
    public async Task A_closed_ticket_accepts_no_comment()
    {
        var (id, version) = await NewTicketAsync();

        var closed = await factory.CreateManagerClient().PutAsJsonAsync(
            $"/api/tickets/{id}/status",
            new { status = "Closed", expectedVersion = version, note = "closing for the test" });

        closed.StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await CommentAsync(id, "One last thought");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/ticket-closed");
    }

    /// <summary>AC-16, on both endpoints.</summary>
    [Fact]
    public async Task An_unknown_ticket_is_not_found_on_both_endpoints()
    {
        var unknown = Guid.CreateVersion7();

        (await CommentAsync(unknown, "Into the void")).StatusCode
            .Should().Be(HttpStatusCode.NotFound);

        (await factory.CreateManagerClient().GetAsync($"/api/tickets/{unknown}/timeline"))
            .StatusCode.Should().Be(HttpStatusCode.NotFound,
                "an empty timeline and a missing ticket must not look the same to the client");
    }

    /// <summary>AC-8, BR-5.5 — the history row records the event, never the text.</summary>
    [Fact]
    public async Task The_history_row_carries_the_comment_id_and_not_its_body()
    {
        const string secret = "Body-that-must-not-appear-in-history-8412";

        var (id, _) = await NewTicketAsync();
        var comment = await BodyOf(await CommentAsync(id, secret));
        var commentId = comment.GetProperty("id").GetGuid();

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var row = await context.TicketHistory
            .Where(entry => entry.TicketId == id
                && entry.EventType == Wasl.Domain.Tickets.TicketHistoryEventType.CommentAdded)
            .SingleAsync();

        row.NewValue.Should().Be(commentId.ToString(), "spec.md Q-1 — the link, so the client can "
            + "merge the two branches without rendering the same event twice");
        row.OldValue.Should().BeNull();

        string.Join(' ', row.OldValue, row.NewValue, row.Note).Should().NotContain(secret);
        row.PerformedByUserId.Should().NotBeNull("stamped from the token, since `011`");
    }

    /// <summary>
    /// AC-18. The criterion that turns `003`'s redaction from registered into verified.
    /// </summary>
    /// <remarks>
    /// <c>AuditRedaction</c> has listed <c>TicketComment.Body</c> and <c>TicketComments.Body</c>
    /// since `003`, and until this feature existed **nothing could exercise it** — there were no
    /// comments. The assertion searches every column of the audit row for a distinctive string
    /// rather than reading the redaction list, because reading the list only proves the list says
    /// what it says.
    /// </remarks>
    [Fact]
    public async Task The_comment_body_reaches_no_column_of_the_audit_row()
    {
        const string secret = "Distinctive-body-for-BR-9-7-redaction-5591";

        var (id, _) = await NewTicketAsync();
        await CommentAsync(id, secret, isInternal: true, channel: "Email");

        var row = (await AuditFixture.RowsForAsync(factory, "Ticket.CommentAdded"))
            .Single(entry => entry.EntityId == id);

        row.Outcome.Should().Be(AuditOutcome.Success);
        row.EntityType.Should().Be("Ticket", "the ticket is what the action was about, not the "
            + "comment — an investigation follows one entity id through the ticket's whole life");
        row.EntityLabel.Should().StartWith("TCK-");

        var everyColumn = string.Join(' ', new[]
        {
            row.ActorEmail, row.ActorRole, row.Action, row.EntityType, row.EntityLabel,
            row.Changes, row.TraceId, row.EntityId?.ToString(), row.IpAddress, row.UserAgent,
        });

        everyColumn.Should().NotContain(secret,
            "BR-9.7 with BR-5.5: the audit trail records THAT a comment was added, never its text. "
            + "`003` registered the rule before any comment existed and nothing had ever "
            + "exercised it");

        // The row is not empty — a redaction that worked by writing nothing at all would pass the
        // assertion above and prove nothing.
        row.Changes.Should().NotBeNull();
        row.Changes.Should().Contain("TicketComment",
            "the diff must still record that the entity changed, with the body's value redacted "
            + "rather than the whole entity omitted");
    }

    /// <summary>AC-9, AC-11 — the merge, and what each branch carries.</summary>
    [Fact]
    public async Task The_timeline_merges_both_branches_in_ascending_order()
    {
        var (id, version) = await NewTicketAsync();

        await factory.CreateManagerClient().PutAsJsonAsync(
            $"/api/tickets/{id}/status", new { status = "Open", expectedVersion = version });

        await CommentAsync(id, "A note from the agent", isInternal: true);

        var page = await TimelineAsync(id);
        var items = page.GetProperty("items").EnumerateArray().ToList();

        items.Select(item => item.GetProperty("type").GetString())
            .Should().Equal(["Created", "StatusChanged", "Comment", "CommentAdded"],
                "ascending by instant — and the comment and its CommentAdded row share one, so "
                + "the tie-break decides the last two");

        var timestamps = items.Select(item => item.GetProperty("occurredAtUtc").GetDateTime()).ToList();
        timestamps.Should().BeInAscendingOrder("BR-5.7");

        var status = items[1];
        status.GetProperty("oldValue").GetString().Should().Be("New");
        status.GetProperty("newValue").GetString().Should().Be("Open");
        status.GetProperty("body").ValueKind.Should().Be(JsonValueKind.Null, "history has no body");

        var comment = items[2];
        comment.GetProperty("body").GetString().Should().Be("A note from the agent");
        comment.GetProperty("isInternal").GetBoolean().Should().BeTrue("BR-5.4 — marked, not hidden");
        comment.GetProperty("actor").GetProperty("fullName").GetString().Should().Be("منى العتيبي");

        page.GetProperty("hasMore").GetBoolean().Should().BeFalse();
    }

    /// <summary>
    /// AC-10 — and the tie is guaranteed, not contrived.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>`010` recorded the same kind of guard as unproven after three attempts</b>, because six
    /// HTTP requests are six scopes and therefore six distinct instants. Here a tie happens on
    /// every comment: <c>IRequestTimestamp</c> memoizes the clock once per request, and one request
    /// writes both the comment and its <c>CommentAdded</c> row.
    /// </para>
    /// <para>
    /// So this asserts two things a weaker test would miss: that the two entries genuinely share a
    /// timestamp — proving the tie exists — and that repeated requests order them identically.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Entries_sharing_an_instant_order_identically_on_every_request()
    {
        var (id, _) = await NewTicketAsync();

        await CommentAsync(id, "First");
        await CommentAsync(id, "Second");

        var first = await TimelineAsync(id);
        var second = await TimelineAsync(id);

        static List<string> Shape(JsonElement page) =>
            page.GetProperty("items").EnumerateArray()
                .Select(item => $"{item.GetProperty("type").GetString()}:{item.GetProperty("id").GetGuid()}")
                .ToList();

        var order = Shape(first);
        order.Should().Equal(Shape(second), "identical requests must return an identical order");

        // The tie exists. Without this the test above could pass on data that never tied, which is
        // exactly how `010`'s equivalent passed with the tie-break deleted.
        var byInstant = first.GetProperty("items").EnumerateArray()
            .GroupBy(item => item.GetProperty("occurredAtUtc").GetDateTime())
            .ToList();

        byInstant.Should().Contain(group => group.Count() > 1,
            "a comment and its CommentAdded row are written in one request from one memoized "
            + "instant, so every comment produces a tie — if this fails, IRequestTimestamp has "
            + "stopped memoizing and AC-10 has become untestable");
    }

    /// <summary>AC-12 — the cursor, and that it does not skip or repeat.</summary>
    [Fact]
    public async Task Load_older_returns_the_previous_page_without_skipping_or_repeating()
    {
        var (id, _) = await NewTicketAsync();

        for (var index = 0; index < 4; index++)
        {
            await CommentAsync(id, $"Comment {index}");
        }

        // 1 Created + 4 comments + 4 CommentAdded = 9 entries.
        var newest = await TimelineAsync(id, limit: 4);

        newest.GetProperty("hasMore").GetBoolean().Should().BeTrue();
        var cursor = newest.GetProperty("nextCursor").GetString();
        cursor.Should().NotBeNullOrWhiteSpace();

        var older = await TimelineAsync(id, before: cursor, limit: 4);

        static List<Guid> Ids(JsonElement page) =>
            page.GetProperty("items").EnumerateArray()
                .Select(item => item.GetProperty("id").GetGuid()).ToList();

        var newestIds = Ids(newest);
        var olderIds = Ids(older);

        newestIds.Should().HaveCount(4);
        olderIds.Should().HaveCount(4);
        olderIds.Should().NotIntersectWith(newestIds, "no entry appears on two pages");

        var last = await TimelineAsync(id, before: older.GetProperty("nextCursor").GetString(), limit: 4);

        last.GetProperty("hasMore").GetBoolean().Should().BeFalse();

        newestIds.Concat(olderIds).Concat(Ids(last)).Distinct()
            .Should().HaveCount(9, "every entry appears exactly once across the three pages");
    }

    /// <summary>BR-7.2's ceiling still applies, and a nonsense limit does not empty the page.</summary>
    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(5000)]
    public async Task The_limit_is_clamped_never_rejected(int limit)
    {
        var (id, _) = await NewTicketAsync();

        var page = await TimelineAsync(id, limit: limit);

        page.GetProperty("items").EnumerateArray().Should().NotBeEmpty(
            "a client asking for nonsense gets a working screen, not an error it cannot act on — "
            + "and an empty page would read as 'this ticket has no history'");
    }

    /// <summary>A brand-new ticket has exactly one entry, and it is not an empty state.</summary>
    [Fact]
    public async Task A_new_ticket_shows_only_its_creation()
    {
        var (id, _) = await NewTicketAsync();

        var items = (await TimelineAsync(id)).GetProperty("items").EnumerateArray().ToList();

        items.Should().ContainSingle();
        items[0].GetProperty("type").GetString().Should().Be("Created");
        items[0].GetProperty("newValue").GetString().Should().Be("New");
    }

    /// <summary>
    /// A history row with no actor renders a name rather than a blank.
    /// </summary>
    /// <remarks>
    /// <c>--seed</c> writes such rows legitimately, so the demo database contains them and the UI
    /// meets them on day one. Provoked here by writing one directly, because every row the API
    /// writes now has an actor.
    /// </remarks>
    [Fact]
    public async Task An_actorless_history_row_renders_a_name()
    {
        var (id, _) = await NewTicketAsync();

        using (var scope = factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

            context.TicketHistory.Add(Wasl.Domain.Tickets.TicketHistoryEntry.StatusChanged(
                id,
                Wasl.Domain.Tickets.TicketStatus.New,
                Wasl.Domain.Tickets.TicketStatus.Open,
                DateTime.UtcNow,
                note: "written with no authenticated user, the way --seed does"));

            await context.SaveChangesAsync(CancellationToken.None);
        }

        var items = (await TimelineAsync(id)).GetProperty("items").EnumerateArray().ToList();

        var actorless = items.Single(item =>
            item.GetProperty("type").GetString() == "StatusChanged");

        actorless.GetProperty("actor").GetProperty("id").ValueKind
            .Should().Be(JsonValueKind.Null);
        actorless.GetProperty("actor").GetProperty("fullName").GetString()
            .Should().Be("System", "a blank where a person should be reads as a loading bug");
    }

    /// <summary>An unparseable cursor is the newest page, not a `400`.</summary>
    [Fact]
    public async Task A_corrupt_cursor_returns_the_newest_page()
    {
        var (id, _) = await NewTicketAsync();
        await CommentAsync(id, "Something to find");

        var page = await TimelineAsync(id, before: "not-a-real-cursor");

        page.GetProperty("items").EnumerateArray().Should().NotBeEmpty(
            "the worst a corrupted cursor does is send the reader back to the top; refusing the "
            + "request strands a client whose stored cursor went stale");
    }

    /// <summary>Both endpoints are behind the fallback authentication policy.</summary>
    [Fact]
    public async Task Both_endpoints_refuse_an_unauthenticated_caller()
    {
        var (id, _) = await NewTicketAsync();

        (await factory.CreateClient().PostAsJsonAsync(
            $"/api/tickets/{id}/comments", new { body = "anonymous" }))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        (await factory.CreateClient().GetAsync($"/api/tickets/{id}/timeline"))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>AC-13 — there is no route to edit or delete a comment.</summary>
    /// <remarks>
    /// Asserted against the endpoint metadata rather than by trying verbs and reading `405`,
    /// because a `405` from a route that does not exist proves nothing about a route that might.
    /// BR-5.3's whole value is that the absence is structural.
    /// </remarks>
    [Fact]
    public void No_endpoint_edits_or_deletes_a_comment()
    {
        var endpoints = factory.Services
            .GetRequiredService<Microsoft.AspNetCore.Routing.EndpointDataSource>().Endpoints
            .OfType<Microsoft.AspNetCore.Routing.RouteEndpoint>()
            .Where(endpoint => endpoint.RoutePattern.RawText?.Contains("comments") == true)
            .Select(endpoint => new
            {
                Route = endpoint.RoutePattern.RawText,
                Methods = endpoint.Metadata
                    .GetMetadata<Microsoft.AspNetCore.Routing.HttpMethodMetadata>()?.HttpMethods
                    ?? [],
            })
            .ToList();

        endpoints.Should().ContainSingle("only the POST exists");
        endpoints[0].Methods.Should().Equal(["POST"]);
    }
}
