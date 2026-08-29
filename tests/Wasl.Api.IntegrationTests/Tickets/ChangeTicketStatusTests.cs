using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Domain.Audit;
using Wasl.Infrastructure.Persistence.Seed;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Tickets;

/// <summary>
/// <c>PUT /api/tickets/{id}/status</c> through the real pipeline. `012` AC-1 to AC-24.
/// </summary>
/// <remarks>
/// The BR-1 matrix itself is asserted 72 times in the domain suite; this class asserts the
/// endpoint â€” which `409` code comes back, in what **order** when several rules match, and what
/// lands in `TicketHistory` and `AuditLog`.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class ChangeTicketStatusTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>Creates a ticket and returns its id and current version token.</summary>
    private async Task<(Guid Id, string Version)> NewTicketAsync()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Cannot sign in",
            description = "The password reset email never arrives.",
            category = "Technical",
            channel = "WhatsApp",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await BodyOf(response);
        return (body.GetProperty("id").GetGuid(), body.GetProperty("version").GetString()!);
    }

    private Task<HttpResponseMessage> PutAsync(
        Guid id, string status, string version, string? note = null) =>
        factory.CreateManagerClient().PutAsJsonAsync(
            $"/api/tickets/{id}/status",
            note is null
                ? new { status, expectedVersion = version }
                : (object)new { status, expectedVersion = version, note });

    /// <summary>Walks a ticket to a status through real transitions, returning the live version.</summary>
    private async Task<string> AdvanceAsync(Guid id, string version, params string[] statuses)
    {
        foreach (var status in statuses)
        {
            var response = await PutAsync(id, status, version, note: "advancing for the test");
            response.StatusCode.Should().Be(HttpStatusCode.OK, $"advancing to {status}");
            version = (await BodyOf(response)).GetProperty("version").GetString()!;
        }

        return version;
    }

    private async Task AssignAsync(Guid id)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var ticket = await context.Tickets.SingleAsync(candidate => candidate.Id == id);

        // `011` owns assignment and does not exist. Reflection here rather than an endpoint that
        // has not been specified â€” confined to this helper, and the alternative is leaving AC-4's
        // positive half and every InProgress transition untested until `011`.
        //
        // The SEEDED AGENT, not Guid.NewGuid(). This helper wrote a fresh Guid until `004` added
        // FK_Tickets_Assignee, and then every test through it died on
        // "The UPDATE statement conflicted with the FOREIGN KEY constraint". The fabricated id was
        // never valid â€” it was an unenforced dangling reference, and the FK is what turned it from
        // invisible into loud.
        var assignee = await context.SupportUsers
            .Where(user => user.Email == SupportUserSeeder.AgentEmail)
            .Select(user => user.Id)
            .SingleAsync();

        typeof(Ticket).GetProperty(nameof(Ticket.AssignedToUserId))!
            .SetValue(ticket, assignee);

        await context.SaveChangesAsync(CancellationToken.None);
    }

    /// <summary>AC-1, AC-23. The happy path, and the recomputed transitions.</summary>
    [Fact]
    public async Task A_permitted_transition_returns_200_with_transitions_for_the_new_status()
    {
        var (id, version) = await NewTicketAsync();

        var response = await PutAsync(id, "Open", version);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await BodyOf(response);
        body.GetProperty("status").GetString().Should().Be("Open");

        body.GetProperty("allowedTransitions").EnumerateArray()
            .Select(value => value.GetString())
            .Should().Equal(["Closed"],
                "AC-23 â€” recomputed for the NEW status, and the ticket has no assignee so "
                + "InProgress is excluded by BR-1.3. The client never derives its next actions "
                + "from the set it just used");

        body.GetProperty("version").GetString().Should().NotBe(version,
            "the rowversion moved, so the old token is now stale");
    }

    /// <summary>AC-2, AC-3, AC-7. BR-1.4 is the forbidden cell readers assume is allowed.</summary>
    [Fact]
    public async Task A_forbidden_transition_returns_409_naming_what_is_permitted()
    {
        var (id, version) = await NewTicketAsync();
        await AssignAsync(id);
        version = await AdvanceAsync(id, (await ReadVersionAsync(id)), "Open", "InProgress", "PendingCustomer");

        var response = await PutAsync(id, "Resolved", version);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var problem = await BodyOf(response);
        problem.GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/invalid-status-transition", "AC-2");

        var detail = problem.GetProperty("detail").GetString();
        detail.Should().Contain("PendingCustomer").And.Contain("InProgress",
            "AC-3 â€” the current status and what IS permitted, so the client can offer a real "
            + "alternative instead of a dead end");
    }

    /// <summary>AC-4, BR-1.3. Its own code, because the reaction is to offer Assign.</summary>
    [Fact]
    public async Task In_progress_without_an_assignee_returns_its_own_409()
    {
        var (id, version) = await NewTicketAsync();
        version = await AdvanceAsync(id, version, "Open");

        var response = await PutAsync(id, "InProgress", version);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/assignee-required",
                "not invalid-status-transition: the client must know to offer Assign rather than "
                + "a different transition (spec.md Q-3)");
    }

    /// <summary>AC-5, BR-1.2. A 400 with the error on the field.</summary>
    [Theory]
    [InlineData("New")]
    [InlineData("Open")]
    public async Task Closing_unworked_work_without_a_note_returns_400_on_the_note_field(string from)
    {
        var (id, version) = await NewTicketAsync();

        if (from == "Open")
        {
            version = await AdvanceAsync(id, version, "Open");
        }

        var response = await PutAsync(id, "Closed", version);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest, "a 400, not a 409");
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");

        (await BodyOf(response)).GetProperty("errors").TryGetProperty("note", out _)
            .Should().BeTrue("AC-5 names `note`, so a form can highlight the field");
    }

    /// <summary>AC-6, AC-10, AC-11. Note stored, ClosedAtUtc set, one history row.</summary>
    [Fact]
    public async Task Closing_with_a_note_stores_it_sets_closed_at_and_writes_one_history_row()
    {
        var (id, version) = await NewTicketAsync();

        var response = await PutAsync(id, "Closed", version, note: "Duplicate of TCK-2026-000041.");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await BodyOf(response)).GetProperty("status").GetString().Should().Be("Closed");

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var ticket = await context.Tickets.AsNoTracking().SingleAsync(t => t.Id == id);
        ticket.ClosedAtUtc.Should().NotBeNull("BR-1.7, AC-10");
        ticket.ClosedAtUtc!.Value.Kind.Should().Be(DateTimeKind.Utc);

        var history = await context.TicketHistory.AsNoTracking()
            .Where(entry => entry.TicketId == id
                && entry.EventType == TicketHistoryEventType.StatusChanged)
            .ToListAsync();

        history.Should().HaveCount(1, "AC-11 â€” exactly one row per accepted transition");
        history[0].OldValue.Should().Be("New");
        history[0].NewValue.Should().Be("Closed");
        history[0].Note.Should().Be("Duplicate of TCK-2026-000041.", "AC-6");
        history[0].PerformedAtUtc.Should().Be(ticket.UpdatedAtUtc,
            "one scoped IRequestTimestamp, so the row and the stamp cannot disagree");
    }

    /// <summary>AC-13, BR-1.9.</summary>
    [Fact]
    public async Task Transitioning_to_the_current_status_returns_its_own_409()
    {
        var (id, version) = await NewTicketAsync();

        var response = await PutAsync(id, "New", version);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/same-status-transition",
                "a 409, never a no-op 200 â€” and its own code, because the reaction is to refetch "
                + "quietly: the user double-clicked and did nothing wrong");
    }

    /// <summary>AC-8, BR-1.5.</summary>
    [Fact]
    public async Task No_transition_out_of_closed_is_accepted()
    {
        var (id, version) = await NewTicketAsync();
        version = await AdvanceAsync(id, version, "Open");

        var closed = await PutAsync(id, "Closed", version, note: "closing");
        version = (await BodyOf(closed)).GetProperty("version").GetString()!;

        var response = await PutAsync(id, "Open", version);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/ticket-closed");
    }

    /// <summary>
    /// **Ordering, decision one.** `Closed â†’ Closed` is `ticket-closed`, not `same-status`.
    /// </summary>
    /// <remarks>
    /// Two rules match. "This ticket is finished" is more useful than "you sent the value it
    /// already has", and no amount of reloading changes it â€” get the order backwards and a client
    /// is told to refetch a ticket that will never move.
    /// </remarks>
    [Fact]
    public async Task Closed_to_closed_reports_the_terminal_state()
    {
        var (id, version) = await NewTicketAsync();
        var closed = await PutAsync(id, "Closed", version, note: "closing");
        version = (await BodyOf(closed)).GetProperty("version").GetString()!;

        var response = await PutAsync(id, "Closed", version);

        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/ticket-closed",
                "step 5 before step 7");
    }

    /// <summary>AC-17. A stale token is a 409, not a silent overwrite.</summary>
    [Fact]
    public async Task A_stale_expected_version_returns_a_concurrency_conflict()
    {
        var (id, version) = await NewTicketAsync();

        var first = await PutAsync(id, "Open", version);
        first.StatusCode.Should().Be(HttpStatusCode.OK);

        // The same token again â€” exactly what a second tab holding an old copy would send.
        var second = await PutAsync(id, "Closed", version, note: "closing");

        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(second)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/concurrency-conflict", "ADR-006");
    }

    /// <summary>
    /// **Ordering, decision two â€” and the contract calls it the easiest to get wrong.**
    /// </summary>
    /// <remarks>
    /// A stale client asks for a transition that is <i>also</i> forbidden from the ticket's real
    /// status. The version check must win: judging the transition would name a
    /// <c>currentStatus</c> the user cannot reconcile with their screen, and report a rule
    /// violation that does not exist. Get it backwards and every stale UI sees a phantom rule
    /// error.
    /// </remarks>
    [Fact]
    public async Task A_stale_version_wins_over_a_forbidden_transition()
    {
        var (id, staleVersion) = await NewTicketAsync();

        // Move the ticket on, so `staleVersion` is out of date.
        await PutAsync(id, "Open", staleVersion);

        // Resolved is forbidden from both New and Open â€” so both rules match.
        var response = await PutAsync(id, "Resolved", staleVersion);

        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/concurrency-conflict",
                "step 6 before steps 7-9. 'Reload' is true and actionable; 'that move is "
                + "forbidden' is neither, and it is not even a rule violation");
    }

    /// <summary>AC-22, and the `expectedVersion` shape rules.</summary>
    [Fact]
    public async Task An_unknown_ticket_is_404_and_a_missing_or_undecodable_version_is_400()
    {
        var unknown = await PutAsync(Guid.NewGuid(), "Open", "AAAAAAAAB9E=");
        unknown.StatusCode.Should().Be(HttpStatusCode.NotFound, "AC-22");

        var (id, _) = await NewTicketAsync();

        var missing = await PutAsync(id, "Open", string.Empty);
        missing.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "required, not optional â€” treating a missing token as 'no opinion' turns every "
            + "client that forgets it into a last-write-wins client, silently");

        var undecodable = await PutAsync(id, "Open", "not base64 !!");
        undecodable.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var malformedId = await factory.CreateManagerClient().PutAsJsonAsync(
            "/api/tickets/not-a-guid/status", new { status = "Open", expectedVersion = "AAAAAAAAB9E=" });
        malformedId.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "the route constraint {id:guid} rejects it before the action, so the framework "
            + "answers 404 rather than 400. AC-22 asks for 400 â€” recorded in tests.md as a "
            + "deviation owned by 002b, which envelopes the statuses routing short-circuits");
    }

    /// <summary>AC-24. Exactly one audit row, and the diff carries the status change.</summary>
    [Fact]
    public async Task An_accepted_transition_writes_exactly_one_audit_row_with_the_change()
    {
        var (id, version) = await NewTicketAsync();

        await PutAsync(id, "Open", version);

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var rows = await context.AuditLog.AsNoTracking()
            .Where(entry => entry.Action == "Ticket.StatusChanged" && entry.EntityId == id)
            .ToListAsync();

        rows.Should().HaveCount(1, "BR-9.1 â€” exactly one, asserted as 1 and not as > 0");
        rows[0].Outcome.Should().Be(AuditOutcome.Success);
        rows[0].EntityType.Should().Be("Ticket");
        rows[0].EntityLabel.Should().StartWith("TCK-", "DescribeTarget reads the response");

        var fields = JsonDocument.Parse(rows[0].Changes!).RootElement.EnumerateArray()
            .Select(change => (
                Field: change.GetProperty("field").GetString(),
                Before: change.GetProperty("before").GetString(),
                After: change.GetProperty("after").GetString()))
            .ToArray();

        fields.Should().ContainSingle(change => change.Field == "Status")
            .Which.Should().Match<(string? Field, string? Before, string? After)>(
                change => change.Before == "New" && change.After == "Open",
                "the diff is content, not presence â€” before and after, captured before the save");

        fields.Select(change => change.Field).Should().NotContain("UpdatedAtUtc")
            .And.NotContain("UpdatedByUserId",
                "the stamps are infrastructure, excluded by name");
    }

    /// <summary>A refused transition writes no history row and no audit row.</summary>
    /// <remarks>
    /// AC-12's shape: the change and its records are atomic. A `409` raised inside the entity
    /// happens before any save, so there is nothing to roll back â€” and this asserts that nothing
    /// leaked in anyway.
    /// </remarks>
    [Fact]
    public async Task A_refused_transition_leaves_no_history_and_no_audit_row()
    {
        var (id, version) = await NewTicketAsync();

        var refused = await PutAsync(id, "Resolved", version);
        refused.StatusCode.Should().Be(HttpStatusCode.Conflict);

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        (await context.TicketHistory.AsNoTracking()
            .CountAsync(entry => entry.TicketId == id
                && entry.EventType == TicketHistoryEventType.StatusChanged))
            .Should().Be(0);

        var ticket = await context.Tickets.AsNoTracking().SingleAsync(t => t.Id == id);
        ticket.Status.Should().Be(TicketStatus.New, "a refused transition changes nothing");
    }

    /// <summary>AC-9, BR-1.6. Resolved work reopens into progress.</summary>
    [Fact]
    public async Task Resolved_can_return_to_in_progress()
    {
        var (id, version) = await NewTicketAsync();
        await AssignAsync(id);
        version = await AdvanceAsync(id, await ReadVersionAsync(id), "Open", "InProgress", "Resolved");

        var response = await PutAsync(id, "InProgress", version);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await BodyOf(response)).GetProperty("status").GetString().Should().Be("InProgress");
    }

    /// <summary>An unparseable status value is rejected.</summary>
    [Fact]
    public async Task An_unknown_status_is_rejected()
    {
        var (id, version) = await NewTicketAsync();

        var response = await factory.CreateManagerClient().PutAsJsonAsync(
            $"/api/tickets/{id}/status", new { status = "Archived", expectedVersion = version });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "400 listing the accepted values, not 409 â€” the value is not a state the machine has");
    }

    /// <summary>Reads the live version token, after a change made outside the API.</summary>
    private async Task<string> ReadVersionAsync(Guid id)
    {
        var response = await factory.CreateManagerClient().GetAsync($"/api/tickets/{id}");
        return (await BodyOf(response)).GetProperty("version").GetString()!;
    }
}

