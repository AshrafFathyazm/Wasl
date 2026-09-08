using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Domain.Audit;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Tickets;

/// <summary>
/// <c>POST /api/tickets/{id}/escalate</c> through the real pipeline. `016`.
/// </summary>
/// <remarks>
/// <para>
/// <b>This is the first endpoint in the product to carry
/// <c>[Authorize(Policy = WaslPolicies.ManagerOnly)]</c>.</b> `CLAUDE.md` records that the policy
/// had no production consumer — `011` deliberately did not use it, because BR-2.2 lets an Agent
/// self-assign and a role gate there would refuse the legitimate case. BR-3.2 has no such
/// exception, so this endpoint is where it belongs, and AC-2 is what proves it in the product
/// rather than against a test-host endpoint.
/// </para>
/// <para>
/// <b>Every assertion is scoped</b> — by ticket id or by audit action. One
/// <c>ICollectionFixture</c> means one container and one database shared with every other
/// integration class, so a <c>COUNT(*)</c> over <c>dbo.TicketHistory</c> would fail depending on
/// which tests ran first.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class EscalateTicketTests(WaslApiFactory factory)
{
    private const string AuditAction = "Ticket.Escalated";

    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<(Guid Id, string Version)> NewTicketAsync(string priority = "Normal")
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Escalation test",
            description = "Created so a ticket exists to escalate.",
            category = "Technical",
            channel = "Email",
            priority,
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await BodyOf(response);

        return (body.GetProperty("id").GetGuid(), body.GetProperty("version").GetString()!);
    }

    private static Task<HttpResponseMessage> EscalateAsync(
        HttpClient client, Guid id, string reason, string version) =>
        client.PostAsJsonAsync(
            $"/api/tickets/{id}/escalate",
            new { reason, expectedVersion = version });

    /// <summary>
    /// Walks the ticket to <paramref name="status"/> through the real endpoint.
    /// </summary>
    /// <remarks>
    /// Never with raw SQL. `CLAUDE.md` records three defects that came from writing an entity from
    /// outside its real path, and a ticket forced into <c>Resolved</c> by an <c>UPDATE</c> would
    /// skip the rowversion the next call has to send.
    /// </remarks>
    private async Task<(Guid Id, string Version)> TicketAtAsync(TicketStatus status)
    {
        var (id, version) = await NewTicketAsync();
        var client = factory.CreateManagerClient();

        // No `note` on any step, and BR-1.2 does not need one: the walk goes through InProgress, so
        // the ticket has been worked by the time it closes.
        async Task Move(string target)
        {
            var response = await client.PutAsJsonAsync(
                $"/api/tickets/{id}/status",
                new { status = target, expectedVersion = version });

            response.StatusCode.Should().Be(
                HttpStatusCode.OK, $"the walk to {status} must actually reach {target}");

            version = (await BodyOf(response)).GetProperty("version").GetString()!;
        }

        await Move("Open");

        // BR-1.3 — InProgress requires an assignee, so the walk has to assign before it moves.
        var assign = await client.PutAsJsonAsync(
            $"/api/tickets/{id}/assignee",
            new { assigneeId = await ManagerIdAsync(), expectedVersion = version });

        assign.StatusCode.Should().Be(HttpStatusCode.OK);
        version = (await BodyOf(assign)).GetProperty("version").GetString()!;

        await Move("InProgress");

        if (status is TicketStatus.InProgress)
        {
            return (id, version);
        }

        await Move("Resolved");

        if (status is TicketStatus.Closed)
        {
            await Move("Closed");
        }

        return (id, version);
    }

    private async Task<Guid> ManagerIdAsync()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.SupportUsers
            .Where(user => user.Role == Domain.Users.SupportRole.Manager)
            .Select(user => user.Id)
            .FirstAsync();
    }

    private async Task<List<TicketHistoryEntry>> HistoryAsync(Guid ticketId)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        // Scoped to ONE ticket. `dbo.TicketHistory` is shared with every other integration class.
        return await context.Set<TicketHistoryEntry>()
            .AsNoTracking()
            .Where(entry => entry.TicketId == ticketId)
            .OrderBy(entry => entry.Id)
            .ToListAsync(CancellationToken.None);
    }

    // ── AC-1 — the happy path ───────────────────────────────────────────────────

    /// <summary>AC-1, AC-6, AC-7, AC-15 — the whole `200` body.</summary>
    [Fact]
    public async Task A_manager_escalates_an_open_ticket()
    {
        var (id, version) = await NewTicketAsync();

        var response = await EscalateAsync(
            factory.CreateManagerClient(), id, "Customer threatened to cancel.", version);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await BodyOf(response);

        body.GetProperty("isEscalated").GetBoolean().Should().BeTrue();
        body.GetProperty("escalationReason").GetString().Should().Be("Customer threatened to cancel.");
        body.GetProperty("escalatedAtUtc").GetDateTime().Should().BeAfter(
            DateTime.UtcNow.AddMinutes(-5), "the stamp comes from IRequestTimestamp, not the CLR default");

        // The nested object, not a bare id — the client must not have to look the name up. Same
        // shape as `011`'s `assignee`, and it is the same record type.
        var escalatedBy = body.GetProperty("escalatedBy");
        escalatedBy.GetProperty("id").GetGuid().Should().Be(await ManagerIdAsync());
        escalatedBy.GetProperty("fullName").GetString().Should().NotBeNullOrWhiteSpace();
        escalatedBy.GetProperty("role").GetString().Should().Be("Manager");

        body.GetProperty("priority").GetString().Should().Be(
            "High", "BR-3.6 raises Normal to the floor");

        body.GetProperty("canEscalate").GetBoolean().Should().BeFalse(
            "the response that reports the success already says the action is unavailable — the "
            + "client never offers it twice, and it does not have to derive that from isEscalated");
    }

    /// <summary>
    /// The read returns byte-identical escalation fields to the write. `007` AC-14's rule.
    /// </summary>
    /// <remarks>
    /// <b>This is the assertion that would have caught three earlier defects</b> — `011`'s
    /// <c>assignee</c> null on the read, `007`'s tick-precision mismatch, and `034`'s missing
    /// <c>tags</c>. A field-by-field comparison walks past a precision difference; a full-body
    /// comparison does not.
    /// </remarks>
    [Fact]
    public async Task The_read_returns_the_same_escalation_fields_as_the_write()
    {
        var (id, version) = await NewTicketAsync();

        var written = await BodyOf(await EscalateAsync(
            factory.CreateManagerClient(), id, "Compare me.", version));

        var read = await BodyOf(await factory.CreateManagerClient().GetAsync($"/api/tickets/{id}"));

        foreach (var field in new[]
        {
            "isEscalated", "escalatedAtUtc", "escalatedBy", "escalationReason", "canEscalate",
            "priority", "version", "assignee", "tags", "allowedTransitions",
        })
        {
            read.GetProperty(field).GetRawText().Should().Be(
                written.GetProperty(field).GetRawText(),
                $"`{field}` must be identical on the write and the read. The contract says a GET "
                + "returns the same resource, and `TicketDetailReader` is what makes that one "
                + "assembly instead of five");
        }
    }

    // ── AC-2, AC-14 — the ManagerOnly policy ────────────────────────────────────

    /// <summary>AC-2. TEST-016-05.</summary>
    [Fact]
    public async Task Escalate_AsAgent_ReturnsForbidden()
    {
        var (id, version) = await NewTicketAsync();

        var response = await EscalateAsync(
            factory.CreateAgentClient(), id, "I would like this escalated.", version);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var body = await BodyOf(response);

        // `004b` envelopes a policy denial. Before it, this body was EMPTY — no type, no traceId.
        body.GetProperty("type").GetString().Should().EndWith("/errors/forbidden");
        body.GetProperty("traceId").GetString().Should().NotBeNullOrWhiteSpace();

        // The handler must not have run.
        var ticket = await factory.CreateManagerClient().GetAsync($"/api/tickets/{id}");
        (await BodyOf(ticket)).GetProperty("isEscalated").GetBoolean().Should().BeFalse();
        (await HistoryAsync(id)).Should().NotContain(
            entry => entry.EventType == TicketHistoryEventType.Escalated);
    }

    /// <summary>
    /// AC-11's second half — an Agent with an unknown id still gets `403`, not `404`.
    /// </summary>
    /// <remarks>
    /// The policy runs before the lookup, so the endpoint tells an Agent probing ids nothing about
    /// which tickets exist. The contract states it in words, and it is a disclosure decision rather
    /// than an accident of framework ordering — which is exactly why it needs a test: reordering
    /// the check into the handler would turn this into an enumeration oracle with a green build.
    /// </remarks>
    [Fact]
    public async Task An_agent_calling_with_an_unknown_id_still_gets_forbidden()
    {
        var response = await EscalateAsync(
            factory.CreateAgentClient(), Guid.NewGuid(), "Does this exist?", "AAAAAAAAB9M=");

        response.StatusCode.Should().Be(
            HttpStatusCode.Forbidden,
            "a `404` here would confirm to an Agent that every OTHER id they try is a real ticket");
    }

    /// <summary>AC-14, TEST-016-11 — the denial is audited, outside any transaction.</summary>
    /// <remarks>
    /// BR-6's split has a measurable consequence and this is the measurement. A policy denial
    /// throws nothing, so MediatR never sees it and `AuditBehaviour` cannot write the row —
    /// `AuthDenialResultHandler` does, from inside <c>UseAuthorization</c>. `004` AC-18 was open
    /// until `004b` built it; this is the first Manager-only endpoint to exercise it.
    /// </remarks>
    [Fact]
    public async Task The_forbidden_response_writes_an_audit_row()
    {
        var (id, version) = await NewTicketAsync();

        var before = (await AuditFixture.RowsForAsync(factory, "Auth.Forbidden")).Count;

        var response = await EscalateAsync(
            factory.CreateAgentClient(), id, "Please escalate.", version);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var rows = await AuditFixture.RowsForAsync(factory, "Auth.Forbidden");

        rows.Count.Should().BeGreaterThan(
            before,
            "the row is written by AuthDenialResultHandler. A count delta rather than a total, "
            + "because every integration class shares one database");

        // Newest first. Scoped by trace id to THIS request rather than by count, so a concurrent
        // denial in another class cannot satisfy the assertion.
        var traceId = (await BodyOf(response)).GetProperty("traceId").GetString();

        rows.Should().Contain(
            entry => entry.TraceId == traceId && entry.Outcome == AuditOutcome.Denied,
            "AC-19's shape: the row's trace id is compared to the one IN THE RESPONSE, which is "
            + "what forced `004b` to envelope this body at all");

        (await AuditFixture.RowsForAsync(factory, AuditAction)).Should().NotContain(
            entry => entry.EntityId == id,
            "no Ticket.Escalated row — the handler never ran");
    }

    // ── AC-3, AC-4 — the two 409s, and their order ──────────────────────────────

    /// <summary>AC-3. TEST-016-06.</summary>
    [Theory]
    [InlineData(TicketStatus.Resolved)]
    [InlineData(TicketStatus.Closed)]
    public async Task A_resolved_or_closed_ticket_answers_ticket_not_escalatable(TicketStatus status)
    {
        var (id, version) = await TicketAtAsync(status);

        var response = await EscalateAsync(
            factory.CreateManagerClient(), id, "Too late.", version);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var body = await BodyOf(response);

        body.GetProperty("type").GetString().Should().EndWith(
            "/errors/ticket-not-escalatable",
            "NOT ticket-closed. BR-3.3 refuses Resolved too, and a manager told \"this ticket is "
            + "closed\" about a resolved one goes looking for the wrong thing");

        body.TryGetProperty("errors", out _).Should().BeFalse(
            "no field is at fault — the registry says this type carries no errors object");

        // The message, not just the shape. `errors[field]` with one entry is a shape assertion,
        // and all seventeen of `004b`'s unresolved keys went out under assertions like that.
        body.GetProperty("detail").GetString().Should()
            .NotBeNullOrWhiteSpace()
            .And.NotMatchRegex(
                @"^(Error|Validation)\.[A-Za-z.]+$",
                "a raw resource key rendered verbatim is what `004b` shipped to the login screen");
    }

    /// <summary>AC-4. TEST-016-06.</summary>
    [Fact]
    public async Task An_already_escalated_ticket_answers_already_escalated()
    {
        var (id, version) = await NewTicketAsync();

        var first = await EscalateAsync(factory.CreateManagerClient(), id, "First.", version);
        first.StatusCode.Should().Be(HttpStatusCode.OK);

        var newVersion = (await BodyOf(first)).GetProperty("version").GetString()!;

        var second = await EscalateAsync(
            factory.CreateManagerClient(), id, "Second.", newVersion);

        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(second)).GetProperty("type").GetString().Should()
            .EndWith("/errors/already-escalated");

        (await HistoryAsync(id))
            .Count(entry => entry.EventType == TicketHistoryEventType.Escalated)
            .Should().Be(1, "the refused second escalation wrote nothing");
    }

    /// <summary>
    /// AC-3 before AC-4, on a ticket in both states. TEST-016-06's last row.
    /// </summary>
    /// <remarks>
    /// <b>Only a ticket that is closed AND escalated can tell the two orderings apart.</b> Every
    /// other test in this class passes under either order, which is what makes this one worth its
    /// own setup rather than being folded into the two above.
    /// </remarks>
    [Fact]
    public async Task A_closed_and_escalated_ticket_answers_the_status_conflict()
    {
        var (id, version) = await TicketAtAsync(TicketStatus.InProgress);

        var escalated = await EscalateAsync(
            factory.CreateManagerClient(), id, "Escalated while in progress.", version);

        escalated.StatusCode.Should().Be(HttpStatusCode.OK);
        version = (await BodyOf(escalated)).GetProperty("version").GetString()!;

        var client = factory.CreateManagerClient();

        foreach (var target in new[] { "Resolved", "Closed" })
        {
            var moved = await client.PutAsJsonAsync(
                $"/api/tickets/{id}/status", new { status = target, expectedVersion = version });

            moved.StatusCode.Should().Be(HttpStatusCode.OK);
            version = (await BodyOf(moved)).GetProperty("version").GetString()!;
        }

        var response = await EscalateAsync(client, id, "Again.", version);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString().Should().EndWith(
            "/errors/ticket-not-escalatable",
            "the contract fixes BR-3.3 ahead of BR-3.4. A client branching on the first failure it "
            + "was shown would get a different answer on a retry if the order were not fixed");
    }

    // ── AC-5 — validation ───────────────────────────────────────────────────────

    /// <summary>AC-5. TEST-016-07.</summary>
    [Theory]
    [InlineData("", "an empty reason")]
    [InlineData("   ", "whitespace only — measured AFTER trimming, per BR-3.5")]
    public async Task An_empty_reason_is_rejected(string reason, string because)
    {
        var (id, version) = await NewTicketAsync();

        var response = await EscalateAsync(factory.CreateManagerClient(), id, reason, version);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest, because);

        var body = await BodyOf(response);

        body.GetProperty("type").GetString().Should().EndWith("/errors/validation");

        var messages = body.GetProperty("errors").GetProperty("reason").EnumerateArray()
            .Select(entry => entry.GetString()!)
            .ToList();

        // READ THE MESSAGE, not the count. `004b` found seventeen raw keys shipping under
        // assertions that only counted entries under the right field name.
        messages.Should().ContainSingle().Which.Should().NotMatchRegex(
            @"^(Error|Validation)\.[A-Za-z.]+$",
            "a raw resource key under a form field is what the login screen rendered");
    }

    [Fact]
    public async Task A_reason_over_five_hundred_characters_is_rejected()
    {
        var (id, version) = await NewTicketAsync();

        var response = await EscalateAsync(
            factory.CreateManagerClient(), id, new string('x', 501), version);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await BodyOf(response)).GetProperty("errors").TryGetProperty("reason", out _)
            .Should().BeTrue();
    }

    /// <summary>
    /// 500 exactly is accepted, and so is 500 plus trailing whitespace. TEST-016-07.
    /// </summary>
    /// <remarks>
    /// The boundary in both directions. A validator written as <c>&lt; 500</c> refuses a legitimate
    /// reason, and one that measures before trimming refuses 500 characters the manager typed plus
    /// a space their keyboard added — both are the kind of defect a user cannot work around and
    /// cannot explain.
    /// </remarks>
    [Theory]
    [InlineData(500, "")]
    [InlineData(500, "   ")]
    public async Task A_reason_of_exactly_five_hundred_characters_is_accepted(
        int length, string trailing)
    {
        var (id, version) = await NewTicketAsync();
        var reason = new string('x', length);

        var response = await EscalateAsync(
            factory.CreateManagerClient(), id, reason + trailing, version);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await BodyOf(response)).GetProperty("escalationReason").GetString().Should().Be(
            reason, "BR-3.5 measures and stores the TRIMMED reason");
    }

    [Fact]
    public async Task A_missing_expected_version_is_rejected()
    {
        var (id, _) = await NewTicketAsync();

        var response = await factory.CreateManagerClient().PostAsJsonAsync(
            $"/api/tickets/{id}/escalate", new { reason = "No version supplied." });

        response.StatusCode.Should().Be(
            HttpStatusCode.BadRequest,
            "`002c` moved the non-nullable check out of the model binder into FluentValidation, so "
            + "this arrives as a catalogue message naming the field rather than the framework's "
            + "English sentence");

        (await BodyOf(response)).GetProperty("errors")
            .TryGetProperty("expectedVersion", out _).Should().BeTrue();
    }

    // ── AC-8 — the history rows ─────────────────────────────────────────────────

    /// <summary>TEST-016-04. The row count IS the proof the floor is conditional.</summary>
    [Fact]
    public async Task A_normal_ticket_writes_two_history_rows_and_a_critical_one_writes_one()
    {
        var (normalId, normalVersion) = await NewTicketAsync("Normal");
        var (criticalId, criticalVersion) = await NewTicketAsync("Critical");

        var client = factory.CreateManagerClient();

        (await EscalateAsync(client, normalId, "Raise it.", normalVersion))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        (await EscalateAsync(client, criticalId, "Already urgent.", criticalVersion))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var normalRows = await HistoryAsync(normalId);
        var criticalRows = await HistoryAsync(criticalId);

        normalRows.Count(entry => entry.EventType == TicketHistoryEventType.PriorityChanged)
            .Should().Be(1);
        criticalRows.Count(entry => entry.EventType == TicketHistoryEventType.PriorityChanged)
            .Should().Be(
                0,
                "an unconditional PriorityChanged write is the defect TEST-016-04 exists to catch, "
                + "and a false history row is worse than a missing one");

        var moved = normalRows.Single(
            entry => entry.EventType == TicketHistoryEventType.PriorityChanged);

        moved.OldValue.Should().Be("Normal");
        moved.NewValue.Should().Be("High");
        moved.PerformedByUserId.Should().NotBeNull(
            "`011` found this column NULL on every row ever written");

        /* Both ESCALATION rows from one memoized instant, which is what makes `013`'s tie-break
         * provable.
         *
         * Scoped to the two rows this request wrote. The first attempt asserted over every row for
         * the ticket and reported two distinct instants, 66 ms apart — which is correct: the
         * `Created` row came from the CREATE request and one IRequestTimestamp is per request, not
         * per ticket. A test-side imprecision, and the run is what proved the pair itself shares
         * one instant (three rows, two instants). */
        normalRows
            .Where(entry => entry.EventType is TicketHistoryEventType.Escalated
                or TicketHistoryEventType.PriorityChanged)
            .Select(entry => entry.PerformedAtUtc)
            .Distinct()
            .Should().ContainSingle(
                "one IRequestTimestamp per request, so the priority change cannot appear before or "
                + "after the escalation that caused it");
    }

    /// <summary>
    /// The two rows reach the timeline, and the new event type does not break the reader.
    /// </summary>
    /// <remarks>
    /// <b>The reason this test exists rather than trusting the rows.</b>
    /// <c>GetTimelineQueryHandler</c> parses the stored string with
    /// <c>Enum.Parse&lt;TimelineEntryType&gt;</c>, so a history event type present in the domain
    /// enum and absent from the timeline enum throws on <i>every</i> subsequent timeline read of
    /// that ticket — a `500` on a feature `016` never touched. `016` added
    /// <c>TimelineEntryType.PriorityChanged</c> for exactly this reason, and only a read proves it.
    /// </remarks>
    [Fact]
    public async Task Both_rows_appear_on_the_timeline()
    {
        var (id, version) = await NewTicketAsync("Low");
        var client = factory.CreateManagerClient();

        (await EscalateAsync(client, id, "On the timeline.", version))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await client.GetAsync($"/api/tickets/{id}/timeline");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var types = (await BodyOf(response)).GetProperty("items").EnumerateArray()
            .Select(entry => entry.GetProperty("type").GetString()!)
            .ToList();

        types.Should().Contain("Escalated").And.Contain(
            "PriorityChanged",
            "an event type the timeline enum does not know throws on parse — and it would throw "
            + "for every later read of this ticket, not just this one");
    }

    // ── AC-10, AC-11, AC-12 — token, id, version ────────────────────────────────

    [Fact]
    public async Task A_request_with_no_token_is_unauthenticated()
    {
        var (id, version) = await NewTicketAsync();

        var response = await factory.CreateClient().PostAsJsonAsync(
            $"/api/tickets/{id}/escalate",
            new { reason = "No token.", expectedVersion = version });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await BodyOf(response)).GetProperty("type").GetString().Should()
            .EndWith("/errors/unauthenticated");
    }

    [Fact]
    public async Task A_manager_calling_with_an_unknown_id_gets_not_found()
    {
        var response = await EscalateAsync(
            factory.CreateManagerClient(), Guid.NewGuid(), "Unknown.", "AAAAAAAAB9M=");

        response.StatusCode.Should().Be(
            HttpStatusCode.NotFound,
            "a Manager may see every ticket, so there is nothing to conceal — the `403` an Agent "
            + "gets for the same request is the disclosure decision, not this");

        (await BodyOf(response)).GetProperty("type").GetString().Should()
            .EndWith("/errors/not-found");
    }

    /// <summary>AC-12, TEST-016-09 — one version, two escalations.</summary>
    [Fact]
    public async Task A_stale_expected_version_answers_concurrency_conflict()
    {
        var (id, version) = await NewTicketAsync();
        var client = factory.CreateManagerClient();

        // Move the ticket so the version the test holds is genuinely stale.
        var moved = await client.PutAsJsonAsync(
            $"/api/tickets/{id}/status", new { status = "Open", expectedVersion = version });

        moved.StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await EscalateAsync(client, id, "Stale.", version);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString().Should()
            .EndWith("/errors/concurrency-conflict");

        (await HistoryAsync(id)).Should().NotContain(
            entry => entry.EventType == TicketHistoryEventType.Escalated);
    }

    /// <summary>
    /// The version check runs BEFORE the state rules. `012`'s ordering, and `016` inherits it.
    /// </summary>
    /// <remarks>
    /// A stale client escalating a resolved ticket must be told to reload, not that the ticket is
    /// resolved — their copy says otherwise, so the state message is neither true from where they
    /// are standing nor actionable. <b>This is the only test that can tell the two orders apart</b>,
    /// because it is the only one where both refusals apply.
    /// </remarks>
    [Fact]
    public async Task A_stale_version_on_a_resolved_ticket_answers_the_version_conflict()
    {
        var (id, freshVersion) = await NewTicketAsync();

        // The version from the create, before the walk to Resolved moves it four times.
        var staleVersion = freshVersion;

        var (walkedId, _) = (id, freshVersion);
        var client = factory.CreateManagerClient();

        var moved = await client.PutAsJsonAsync(
            $"/api/tickets/{walkedId}/status",
            new { status = "Open", expectedVersion = freshVersion });
        moved.StatusCode.Should().Be(HttpStatusCode.OK);
        var version = (await BodyOf(moved)).GetProperty("version").GetString()!;

        var assign = await client.PutAsJsonAsync(
            $"/api/tickets/{walkedId}/assignee",
            new { assigneeId = await ManagerIdAsync(), expectedVersion = version });
        assign.StatusCode.Should().Be(HttpStatusCode.OK);
        version = (await BodyOf(assign)).GetProperty("version").GetString()!;

        foreach (var target in new[] { "InProgress", "Resolved" })
        {
            var step = await client.PutAsJsonAsync(
                $"/api/tickets/{walkedId}/status",
                new { status = target, expectedVersion = version });
            step.StatusCode.Should().Be(HttpStatusCode.OK);
            version = (await BodyOf(step)).GetProperty("version").GetString()!;
        }

        var response = await EscalateAsync(client, walkedId, "Stale and resolved.", staleVersion);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString().Should().EndWith(
            "/errors/concurrency-conflict",
            "not ticket-not-escalatable. The version check is ahead of the state rules, so a "
            + "stale client is told to reload rather than told about a state it has never seen");
    }

    // ── AC-13 — the audit row ───────────────────────────────────────────────────

    /// <summary>TEST-016-10, TEST-016-14 — one row, and what is in it.</summary>
    [Fact]
    public async Task A_successful_escalation_writes_one_audit_row()
    {
        var (id, version) = await NewTicketAsync();

        (await EscalateAsync(factory.CreateManagerClient(), id, "Audited.", version))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var rows = (await AuditFixture.RowsForAsync(factory, AuditAction))
            .Where(entry => entry.EntityId == id)
            .ToList();

        var row = rows.Should().ContainSingle(
            "one command, one row — scoped to this ticket, because the table is shared").Subject;

        row.Outcome.Should().Be(AuditOutcome.Success);
        row.ActorUserId.Should().Be(
            await ManagerIdAsync(),
            "MapInboundClaims = false is what keeps this column non-null. Reverting it turns `sub` "
            + "into a WS-Federation URI and every actor column goes null with nothing throwing");
        row.ActorRole.Should().Be("Manager");

        // ASSERT CONTENT, NOT PRESENCE. `003` moved its interceptor one hook later and four tests
        // went red while the row still existed and Changes came back null on every command.
        //
        // `Changes` is an ARRAY of {entity, id, field, before, after} — `003`'s
        // AuditFieldChange, not a field→value map. Written against a map on the first attempt and
        // corrected after the run said `target element has type 'Array'`.
        row.Changes.Should().NotBeNullOrWhiteSpace();

        var escalated = FieldsOf(row.Changes!).Single(
            change => change.Field == nameof(Ticket.IsEscalated));

        escalated.Before.Should().Be("False", "the diff is before-and-after, not just after");
        escalated.After.Should().Be("True");

        var priority = FieldsOf(row.Changes!).Single(
            change => change.Field == nameof(Ticket.Priority));

        priority.Before.Should().Be("Normal");
        priority.After.Should().Be(
            "High", "Normal moved to the floor, so the priority is part of this change");

        /* BR-9.7 — TEST-016-14, AND THE ONE ASSERTION IN THIS CLASS THAT FOUND A REAL DEFECT.
         *
         * On its first run the reason came back in full, TWICE: as `Ticket.EscalationReason` and
         * as `TicketHistoryEntry.Note`, both from the same transaction. BR-9.7's list names a
         * password, a hash, a token, a signing key and "a full comment body" — an escalation
         * reason is none of those literally, so nothing had ever redacted it. `016`'s own
         * tasks.md (BE-016-06, TEST-016-14) says it must not be there.
         *
         * Both entity-qualified names are on `AuditRedaction`'s list now, and the assertion
         * checks the PLACEHOLDER rather than only the absence of the text — a diff that dropped
         * the field entirely would satisfy `NotContain` while losing the fact that a reason was
         * recorded at all, and BR-9.7 keeps the field name for exactly that reason. */
        row.Changes!.Should().NotContain(
            "Audited.",
            "the reason is the manager's free text about a customer. It belongs in the history "
            + "row the timeline renders, not in the audit diff (BR-9.7)");

        foreach (var (entity, field) in new[]
        {
            ("Ticket", nameof(Ticket.EscalationReason)),
            ("TicketHistoryEntry", "Note"),
        })
        {
            var redacted = FieldsOf(row.Changes!).SingleOrDefault(
                change => change.Entity == entity && change.Field == field);

            redacted.Should().NotBeNull(
                $"`{entity}.{field}` must still APPEAR in the diff — that a reason was recorded is "
                + "auditable, and dropping the row would lose that while passing every "
                + "\"does not contain the text\" assertion");

            redacted!.After.Should().Be(AuditRedaction.Placeholder);
            redacted.Before.Should().Be(
                AuditRedaction.Placeholder,
                "a redacted null still becomes the placeholder — returning null would leak the "
                + "difference between \"absent\" and \"set\"");
        }
    }

    /// <summary>
    /// A `Critical` ticket's audit diff names <c>IsEscalated</c> and NOT <c>Priority</c>.
    /// </summary>
    /// <remarks>
    /// The audit half of TEST-016-04. The diff is produced by `003`'s interceptor from EF's change
    /// tracker, so it reports what actually moved — which makes it a second, independent witness
    /// that the floor is conditional. An unconditional assignment would put <c>Priority</c> in
    /// this diff with <c>Critical → High</c>, and the row would be a permanent record of a
    /// downgrade.
    /// </remarks>
    [Fact]
    public async Task A_critical_tickets_audit_diff_does_not_name_the_priority()
    {
        var (id, version) = await NewTicketAsync("Critical");

        (await EscalateAsync(factory.CreateManagerClient(), id, "Already urgent.", version))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var row = (await AuditFixture.RowsForAsync(factory, AuditAction))
            .Single(entry => entry.EntityId == id);

        var fields = FieldsOf(row.Changes!).Select(change => change.Field).ToList();

        fields.Should().Contain(nameof(Ticket.IsEscalated));
        fields.Should().NotContain(
            nameof(Ticket.Priority),
            "nothing moved, so EF's change tracker has nothing to report — and a row saying "
            + "Critical → High would be a permanent record of a downgrade that never happened");
    }

    /// <summary>
    /// <c>Changes</c>, parsed. An array of <c>AuditFieldChange</c>, never a field→value map.
    /// </summary>
    /// <remarks>
    /// One reader for both audit assertions, so a change to `003`'s serializer breaks in one place
    /// rather than two. The property names are camel-cased by the serializer's options, and
    /// <c>PropertyNameCaseInsensitive</c> is what keeps this from depending on that.
    /// </remarks>
    private static List<AuditFieldChange> FieldsOf(string changes) =>
        JsonSerializer.Deserialize<List<AuditFieldChange>>(
            changes, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

    /// <summary>
    /// A refused escalation writes no <c>Ticket.Escalated</c> row. AC-13's second half.
    /// </summary>
    /// <remarks>
    /// BR-9.3 puts the row in the same transaction as the change, so a rolled-back write leaves
    /// none. The `409` here rolls back — and it also writes an independent <c>Denied</c>-classified
    /// row for the FAILURE, which is a different thing and outside the transaction. This asserts
    /// the absence of the success row, scoped to the ticket.
    /// </remarks>
    [Fact]
    public async Task A_refused_escalation_writes_no_success_row()
    {
        var (id, version) = await TicketAtAsync(TicketStatus.Closed);

        (await EscalateAsync(factory.CreateManagerClient(), id, "Refused.", version))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);

        (await AuditFixture.RowsForAsync(factory, AuditAction))
            .Where(entry => entry.EntityId == id)
            .Should().NotContain(
                entry => entry.Outcome == AuditOutcome.Success,
                "the row lives in the transaction the refusal rolled back");
    }

    // ── AC-15 — canEscalate across the matrix ───────────────────────────────────

    /// <summary>TEST-016-13, reduced to the rows that change behaviour.</summary>
    /// <remarks>
    /// <c>tasks.md</c> offers the full role × flag × six-status matrix as droppable to "the four
    /// rows that change behaviour". Taken, and the reason is that the six statuses are already
    /// covered exhaustively by <c>TicketEscalationTests</c> against <c>IsEscalatable</c> with no
    /// container — repeating them over HTTP would be thirty-six requests proving the same
    /// property, and `010` AC-12's counter is the tool for cost, not this.
    /// </remarks>
    [Fact]
    public async Task CanEscalate_is_true_only_for_a_manager_on_an_escalatable_ticket()
    {
        var (openId, openVersion) = await NewTicketAsync();

        async Task<bool> CanEscalateAsync(HttpClient client, Guid id) =>
            (await BodyOf(await client.GetAsync($"/api/tickets/{id}")))
            .GetProperty("canEscalate").GetBoolean();

        (await CanEscalateAsync(factory.CreateManagerClient(), openId)).Should().BeTrue(
            "a Manager, an open unescalated ticket");

        (await CanEscalateAsync(factory.CreateAgentClient(), openId)).Should().BeFalse(
            "an Agent — BR-3.2, and the client must not derive this from the role itself");

        (await EscalateAsync(factory.CreateManagerClient(), openId, "Now escalated.", openVersion))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        (await CanEscalateAsync(factory.CreateManagerClient(), openId)).Should().BeFalse(
            "already escalated — BR-3.4");

        var (closedId, _) = await TicketAtAsync(TicketStatus.Closed);

        (await CanEscalateAsync(factory.CreateManagerClient(), closedId)).Should().BeFalse(
            "closed — BR-3.3");
    }

    /// <summary>
    /// <c>canEscalate</c> is reported identically by every endpoint that returns a ticket.
    /// </summary>
    /// <remarks>
    /// <b>This is the assertion that would have caught `016`'s own worst defect.</b> Before
    /// <c>TicketDetailReader</c>, <c>PUT /status</c> and <c>PUT /assignee</c> passed no
    /// <c>callerIsManager</c>, so a Manager who changed a status was told <c>canEscalate: false</c>
    /// about a ticket they could escalate — and the same Manager reloading the page was told
    /// <c>true</c>. Two endpoints, one ticket, one caller, opposite answers.
    /// </remarks>
    [Fact]
    public async Task Every_endpoint_reports_canEscalate_the_same_way()
    {
        var (id, version) = await NewTicketAsync();
        var client = factory.CreateManagerClient();

        var afterStatus = await client.PutAsJsonAsync(
            $"/api/tickets/{id}/status", new { status = "Open", expectedVersion = version });
        afterStatus.StatusCode.Should().Be(HttpStatusCode.OK);
        version = (await BodyOf(afterStatus)).GetProperty("version").GetString()!;

        var afterAssign = await client.PutAsJsonAsync(
            $"/api/tickets/{id}/assignee",
            new { assigneeId = await ManagerIdAsync(), expectedVersion = version });
        afterAssign.StatusCode.Should().Be(HttpStatusCode.OK);

        var afterRead = await client.GetAsync($"/api/tickets/{id}");

        foreach (var (label, response) in new[]
        {
            ("PUT /status", afterStatus),
            ("PUT /assignee", afterAssign),
            ("GET /{id}", afterRead),
        })
        {
            (await BodyOf(response)).GetProperty("canEscalate").GetBoolean().Should().BeTrue(
                $"{label} must answer the same as the read. One assembler, one answer");
        }

        // The other three fields the same call sites used to drop.
        var assignBody = await BodyOf(afterAssign);
        assignBody.GetProperty("tags").ValueKind.Should().Be(
            JsonValueKind.Array, "`034`'s field, absent from this response until `016`");
        assignBody.GetProperty("assignee").ValueKind.Should().Be(JsonValueKind.Object);

        var statusBody = await BodyOf(afterStatus);
        statusBody.GetProperty("tags").ValueKind.Should().Be(JsonValueKind.Array);
    }
}
