using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Api.Seed;
using Wasl.Domain.Audit;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Tickets;

/// <summary>
/// <c>PUT /api/tickets/{id}/assignee</c> through the real pipeline. `011` AC-1 to AC-17.
/// </summary>
/// <remarks>
/// Three seeded users, and all three are needed. AC-3 needs a target that is not the caller, and
/// AC-4 needs a ticket owned by <b>another Agent</b> — with two users, "someone else" would always
/// be the Manager and the rule that actually fires in production would go unproven.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class AssignTicketTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<(Guid Id, string Version)> NewTicketAsync()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Assignment test",
            description = "Created so a ticket exists to assign.",
            category = "Technical",
            channel = "Email",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await BodyOf(response);

        return (body.GetProperty("id").GetGuid(), body.GetProperty("version").GetString()!);
    }

    private static Task<HttpResponseMessage> PutAsync(
        HttpClient client, Guid id, Guid? assigneeId, string version) =>
        client.PutAsJsonAsync(
            $"/api/tickets/{id}/assignee",
            new { assigneeId, expectedVersion = version });

    private async Task<Guid> IdOfAsync(string email)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.SupportUsers
            .Where(user => user.Email == email)
            .Select(user => user.Id)
            .SingleAsync();
    }

    /// <summary>AC-1, and the nested assignee object the contract froze.</summary>
    [Fact]
    public async Task A_manager_assigns_any_ticket_to_any_active_user()
    {
        var (id, version) = await NewTicketAsync();
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        var response = await PutAsync(factory.CreateManagerClient(), id, agentId, version);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await BodyOf(response);

        // The nested object, not a bare id — the client must not have to look the name up.
        var assignee = body.GetProperty("assignee");
        assignee.GetProperty("id").GetGuid().Should().Be(agentId);
        assignee.GetProperty("fullName").GetString().Should().Be("Omar Khalid");
        assignee.GetProperty("role").GetString().Should().Be("Agent");

        // Kept alongside it, because `009` and `010` froze this field and removing it would break
        // a client that already reads it.
        body.GetProperty("assignedToUserId").GetGuid().Should().Be(agentId);

        body.GetProperty("version").GetString().Should().NotBe(version,
            "the rowversion moved, so the client's old token is now stale");
    }

    /// <summary>AC-2, BR-2.2. The rule that makes a role policy on this endpoint impossible.</summary>
    [Fact]
    public async Task An_agent_may_take_an_unassigned_ticket()
    {
        var (id, version) = await NewTicketAsync();
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        var response = await PutAsync(factory.CreateAgentClient(), id, agentId, version);

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            "an Agent picking up unowned work does not need a Manager — and ManagerOnly on this "
            + "endpoint would have made this impossible");
    }

    /// <summary>AC-3, BR-2.2.</summary>
    [Fact]
    public async Task An_agent_assigning_to_anyone_else_is_forbidden()
    {
        var (id, version) = await NewTicketAsync();
        var managerId = await IdOfAsync(SupportUserSeeder.ManagerEmail);

        var response = await PutAsync(factory.CreateAgentClient(), id, managerId, version);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var problem = await BodyOf(response);
        problem.GetProperty("type").GetString().Should().Be("https://wasl.local/errors/forbidden");

        // No errors dictionary and nothing naming the ticket's state. A denial is not the place to
        // disclose ownership.
        problem.TryGetProperty("errors", out _).Should().BeFalse();
        problem.GetProperty("detail").GetString().Should().NotContain(managerId.ToString());
    }

    /// <summary>
    /// AC-4, BR-2.3 — and the reason `011` seeds a third user.
    /// </summary>
    /// <remarks>
    /// The ticket belongs to <b>another Agent</b>, not to the Manager. With two seeded users this
    /// test could only have been written against a Manager-owned ticket, which proves a different
    /// and rarer thing: the case that actually happens is one agent taking a colleague's work.
    /// </remarks>
    [Fact]
    public async Task An_agent_may_not_reassign_a_ticket_owned_by_another_agent()
    {
        var (id, version) = await NewTicketAsync();
        var agentTwoId = await IdOfAsync(SupportUserSeeder.AgentTwoEmail);

        var owned = await PutAsync(factory.CreateManagerClient(), id, agentTwoId, version);
        owned.StatusCode.Should().Be(HttpStatusCode.OK);

        var live = (await BodyOf(owned)).GetProperty("version").GetString()!;
        var agentOneId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        var stolen = await PutAsync(factory.CreateAgentClient(), id, agentOneId, live);

        stolen.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>AC-5, and Q-1's ruling.</summary>
    [Fact]
    public async Task An_agent_may_hand_back_their_own_ticket()
    {
        var (id, version) = await NewTicketAsync();
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        var taken = await PutAsync(factory.CreateAgentClient(), id, agentId, version);
        var live = (await BodyOf(taken)).GetProperty("version").GetString()!;

        var handedBack = await PutAsync(factory.CreateAgentClient(), id, null, live);

        handedBack.StatusCode.Should().Be(HttpStatusCode.OK,
            "the alternative traps an agent on a ticket they cannot progress");

        var body = await BodyOf(handedBack);
        body.GetProperty("assignee").ValueKind.Should().Be(JsonValueKind.Null);
        body.GetProperty("assignedToUserId").ValueKind.Should().Be(JsonValueKind.Null);
    }

    /// <summary>
    /// BR-2.3's other half: `null` is a target like any other.
    /// </summary>
    /// <remarks>
    /// Taking someone's ownership away is a reassignment, so it is refused for the same reason
    /// giving it to a third party is. The edge-case register puts this under `TEST-011-06` rather
    /// than a new AC.
    /// </remarks>
    [Fact]
    public async Task An_agent_may_not_unassign_another_agents_ticket()
    {
        var (id, version) = await NewTicketAsync();
        var agentTwoId = await IdOfAsync(SupportUserSeeder.AgentTwoEmail);

        var owned = await PutAsync(factory.CreateManagerClient(), id, agentTwoId, version);
        var live = (await BodyOf(owned)).GetProperty("version").GetString()!;

        var response = await PutAsync(factory.CreateAgentClient(), id, null, live);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>AC-6, BR-2.4. `400` with the error on the field, not `404`.</summary>
    [Fact]
    public async Task Assigning_to_an_inactive_user_is_a_validation_error_on_the_field()
    {
        var (id, version) = await NewTicketAsync();
        var inactiveId = await SeedInactiveUserAsync();

        var response = await PutAsync(factory.CreateManagerClient(), id, inactiveId, version);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "the user exists — the request is what is wrong (spec.md Q-2)");

        var problem = await BodyOf(response);
        problem.GetProperty("type").GetString().Should().Be("https://wasl.local/errors/validation");

        // camelCase, and keyed on the request field — that is what tells the client to put the
        // message on the picker rather than in a banner.
        problem.GetProperty("errors").GetProperty("assigneeId")
            .EnumerateArray().Should().HaveCount(1);
    }

    /// <summary>AC-7 — its own type, distinct from the ticket's `404`.</summary>
    [Fact]
    public async Task An_unknown_assignee_has_its_own_not_found_type()
    {
        var (id, version) = await NewTicketAsync();

        var response = await PutAsync(
            factory.CreateManagerClient(), id, Guid.CreateVersion7(), version);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/assignee-not-found",
                "a stale PICKER and a stale PAGE need different reactions, so one 404 type for "
                + "both would force the client to guess which it is holding out of date");
    }

    /// <summary>AC-14 — the ticket's own `404`, for contrast with AC-7.</summary>
    [Fact]
    public async Task An_unknown_ticket_is_a_plain_not_found()
    {
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        var response = await PutAsync(
            factory.CreateManagerClient(), Guid.CreateVersion7(), agentId, "AAAAAAAAB9E=");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/not-found");
    }

    /// <summary>AC-8, BR-2.5, BR-1.5.</summary>
    [Fact]
    public async Task A_closed_ticket_cannot_change_owner()
    {
        var (id, version) = await NewTicketAsync();

        var closed = await factory.CreateManagerClient().PutAsJsonAsync(
            $"/api/tickets/{id}/status",
            new { status = "Closed", expectedVersion = version, note = "closing for the test" });

        closed.StatusCode.Should().Be(HttpStatusCode.OK);

        var live = (await BodyOf(closed)).GetProperty("version").GetString()!;
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        var response = await PutAsync(factory.CreateManagerClient(), id, agentId, live);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/ticket-closed");
    }

    /// <summary>
    /// The edge case where `403` and `409` both apply, and `403` wins.
    /// </summary>
    /// <remarks>
    /// An Agent assigning someone else to a `Closed` ticket could not have done it on an open
    /// ticket either, and answering `409` first would imply that reopening would help — which it
    /// would not, because `Closed` is terminal.
    /// </remarks>
    [Fact]
    public async Task Permission_is_decided_before_state()
    {
        var (id, version) = await NewTicketAsync();

        var closed = await factory.CreateManagerClient().PutAsJsonAsync(
            $"/api/tickets/{id}/status",
            new { status = "Closed", expectedVersion = version, note = "closing for the test" });

        var live = (await BodyOf(closed)).GetProperty("version").GetString()!;
        var managerId = await IdOfAsync(SupportUserSeeder.ManagerEmail);

        var response = await PutAsync(factory.CreateAgentClient(), id, managerId, live);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "403 before 409 — the contract's step 5 before step 8");
    }

    /// <summary>AC-9, BR-2.6 — asserted against the table, with content.</summary>
    [Fact]
    public async Task Assigning_and_unassigning_each_write_their_own_history_row()
    {
        var (id, version) = await NewTicketAsync();
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        var assigned = await PutAsync(factory.CreateManagerClient(), id, agentId, version);
        var live = (await BodyOf(assigned)).GetProperty("version").GetString()!;

        await PutAsync(factory.CreateManagerClient(), id, null, live);

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var rows = await context.Set<TicketHistoryEntry>()
            .Where(entry => entry.TicketId == id)
            .OrderBy(entry => entry.PerformedAtUtc)
            .ToListAsync();

        var assign = rows.Single(entry => entry.EventType == TicketHistoryEventType.Assigned);
        assign.OldValue.Should().BeNull("the ticket was unassigned before this");
        assign.NewValue.Should().Be(agentId.ToString());

        var unassign = rows.Single(entry => entry.EventType == TicketHistoryEventType.Unassigned);
        unassign.OldValue.Should().Be(agentId.ToString());
        unassign.NewValue.Should().BeNull();

        // The actor, from the token — `009`'s stamping, not a parameter this feature passes.
        var managerId = await IdOfAsync(SupportUserSeeder.ManagerEmail);
        assign.PerformedByUserId.Should().Be(managerId);
    }

    /// <summary>AC-10, BR-2.7, ADR-004. A test that asserts nothing happened.</summary>
    [Fact]
    public async Task Assigning_a_new_ticket_leaves_it_new()
    {
        var (id, version) = await NewTicketAsync();
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        var response = await PutAsync(factory.CreateManagerClient(), id, agentId, version);

        (await BodyOf(response)).GetProperty("status").GetString().Should().Be("New",
            "triage and ownership are separate acts; coupling them would hide one of them from "
            + "the history — an Assigned row with a silent status change and no StatusChanged row");

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        (await context.Set<TicketHistoryEntry>()
                .CountAsync(entry => entry.TicketId == id
                    && entry.EventType == TicketHistoryEventType.StatusChanged))
            .Should().Be(0);
    }

    /// <summary>AC-11 — both directions.</summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task A_request_that_changes_nothing_is_a_conflict(bool alreadyAssigned)
    {
        var (id, version) = await NewTicketAsync();
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        Guid? target = null;

        if (alreadyAssigned)
        {
            var assigned = await PutAsync(factory.CreateManagerClient(), id, agentId, version);
            version = (await BodyOf(assigned)).GetProperty("version").GetString()!;
            target = agentId;
        }

        var response = await PutAsync(factory.CreateManagerClient(), id, target, version);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "a 200 would tell the client its request was applied when nothing happened");

        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/assignee-unchanged");
    }

    /// <summary>AC-12, ADR-006.</summary>
    [Fact]
    public async Task A_stale_version_is_a_concurrency_conflict()
    {
        var (id, version) = await NewTicketAsync();
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);
        var agentTwoId = await IdOfAsync(SupportUserSeeder.AgentTwoEmail);

        await PutAsync(factory.CreateManagerClient(), id, agentId, version);

        // The same token again — the second browser tab.
        var response = await PutAsync(factory.CreateManagerClient(), id, agentTwoId, version);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/concurrency-conflict");
    }

    /// <summary>
    /// The ordering that matters most: a stale version beats a forbidden action.
    /// </summary>
    /// <remarks>
    /// The permission decision reads the ticket's current assignee. With a stale version the
    /// client is looking at a different assignee than the server is, so a `403` computed there
    /// could be wrong — and the client would have no way to tell. `409` sends it back for the
    /// truth first. `012` shipped the same ordering for the same reason.
    /// </remarks>
    [Fact]
    public async Task A_stale_version_is_answered_before_a_denial()
    {
        var (id, version) = await NewTicketAsync();
        var agentTwoId = await IdOfAsync(SupportUserSeeder.AgentTwoEmail);
        var managerId = await IdOfAsync(SupportUserSeeder.ManagerEmail);

        await PutAsync(factory.CreateManagerClient(), id, agentTwoId, version);

        // Agent one, holding the pre-assignment version, aiming at the Manager — forbidden twice
        // over. The answer must still be 409.
        var response = await PutAsync(factory.CreateAgentClient(), id, managerId, version);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/concurrency-conflict");
    }

    /// <summary>
    /// AC-16 — assignment changes <c>allowedTransitions</c> without changing <c>status</c>.
    /// </summary>
    /// <remarks>
    /// The clearest demonstration in the codebase that the client must render the array it was
    /// given rather than hold a copy of the BR-1 map: the status is identical before and after,
    /// and the permitted set is not.
    /// </remarks>
    [Fact]
    public async Task Assignment_changes_allowed_transitions_without_changing_status()
    {
        var (id, version) = await NewTicketAsync();

        var opened = await factory.CreateManagerClient().PutAsJsonAsync(
            $"/api/tickets/{id}/status",
            new { status = "Open", expectedVersion = version });

        var beforeBody = await BodyOf(opened);
        var live = beforeBody.GetProperty("version").GetString()!;

        beforeBody.GetProperty("allowedTransitions").EnumerateArray()
            .Select(value => value.GetString())
            .Should().Equal(["Closed"],
                "unassigned, so BR-1.3 excludes InProgress by the condition rather than by the "
                + "matrix");

        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);
        var assigned = await PutAsync(factory.CreateManagerClient(), id, agentId, live);
        var afterBody = await BodyOf(assigned);

        afterBody.GetProperty("status").GetString().Should().Be("Open", "unchanged — BR-2.7");

        afterBody.GetProperty("allowedTransitions").EnumerateArray()
            .Select(value => value.GetString())
            .Should().Equal(["InProgress", "Closed"],
                "the same status, a different permitted set — recomputed from the ticket's own "
                + "state, which is the whole reason the server sends it");
    }

    /// <summary>
    /// AC-17. The criterion that turns "handler, not policy" from an argument into a fact.
    /// </summary>
    /// <remarks>
    /// The row is present although no business transaction committed — BR-9.4's asymmetry.
    /// `AuditBehaviour` writes it through <c>WriteIndependentAsync</c>, on its own connection, so
    /// it survives the rollback of the write it refused. Had BR-2 been enforced by an
    /// authorization policy, there would be no row at all: `004` AC-18 is still open.
    /// </remarks>
    [Fact]
    public async Task A_denial_writes_exactly_one_audit_row_naming_the_actor_and_the_ticket()
    {
        var (id, version) = await NewTicketAsync();
        var managerId = await IdOfAsync(SupportUserSeeder.ManagerEmail);
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        var response = await PutAsync(factory.CreateAgentClient(), id, managerId, version);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var rows = (await AuditFixture.RowsForAsync(factory, "Ticket.Assigned"))
            .Where(entry => entry.EntityId == id)
            .ToList();

        rows.Should().HaveCount(1, "one denial, one row — not zero and not two");

        var row = rows.Single();
        row.Outcome.Should().Be(AuditOutcome.Denied,
            "Denied, not Failed. The distinction is what an incident investigation looks for, and "
            + "it exists because AuditOutcomeClassifier keys on DomainErrorCodes.Forbidden");

        row.ActorUserId.Should().Be(agentId, "the caller, from the token");
        row.ActorRole.Should().Be("Agent");

        var problem = await BodyOf(response);
        row.TraceId.Should().Be(problem.GetProperty("traceId").GetString(),
            "BR-9.9 — the row and the response must be findable from each other");
    }

    /// <summary>The success path writes its row too, inside the transaction.</summary>
    [Fact]
    public async Task An_accepted_assignment_writes_a_success_row()
    {
        var (id, version) = await NewTicketAsync();
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        await PutAsync(factory.CreateManagerClient(), id, agentId, version);

        var row = (await AuditFixture.RowsForAsync(factory, "Ticket.Assigned"))
            .Single(entry => entry.EntityId == id);

        row.Outcome.Should().Be(AuditOutcome.Success);
        row.EntityLabel.Should().StartWith("TCK-");

        // Content, not presence. `003` moved its interceptor one hook later and four tests went
        // red while the row still existed and Changes came back null on every command.
        row.Changes.Should().NotBeNull();
        row.Changes.Should().Contain("AssignedToUserId");
    }

    /// <summary>AC-13.</summary>
    [Fact]
    public async Task The_picker_lists_active_users_and_never_a_hash()
    {
        var inactiveId = await SeedInactiveUserAsync();

        var response = await factory.CreateAgentClient().GetAsync("/api/support-users");

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            "an Agent needs the list to self-assign — ManagerOnly here would break BR-2.2");

        var raw = await response.Content.ReadAsStringAsync();
        var options = JsonDocument.Parse(raw).RootElement;

        var ids = options.EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).ToList();

        ids.Should().Contain(await IdOfAsync(SupportUserSeeder.ManagerEmail));
        ids.Should().Contain(await IdOfAsync(SupportUserSeeder.AgentEmail));
        ids.Should().NotContain(inactiveId, "BR-2.4 — the picker must not offer an inactive user");

        // Asserted over the raw text, not the parsed shape: a property nobody thought to check is
        // exactly the risk, and `004` made the same assertion for the same reason.
        raw.ToLowerInvariant().Should().NotContain("password");
        raw.Should().NotContain("preferredLanguage", "a picker needs a name and a role");
        raw.Should().NotContain("@wasl.local", "and not an address");

        var first = options.EnumerateArray().First();
        first.GetProperty("fullName").GetString().Should().NotBeNullOrWhiteSpace();
        first.GetProperty("role").GetString().Should().BeOneOf("Manager", "Agent");
    }

    /// <summary>A tokenless call is refused — the fallback policy, on a `011` endpoint.</summary>
    [Fact]
    public async Task Both_endpoints_refuse_an_unauthenticated_caller()
    {
        var (id, version) = await NewTicketAsync();

        var assign = await PutAsync(factory.CreateClient(), id, null, version);
        var picker = await factory.CreateClient().GetAsync("/api/support-users");

        assign.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        picker.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>AC-5's shape half: `expectedVersion` is required, and required means `400`.</summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-base64!!")]
    public async Task A_missing_or_undecodable_version_is_a_validation_error(string version)
    {
        var (id, _) = await NewTicketAsync();
        var agentId = await IdOfAsync(SupportUserSeeder.AgentEmail);

        var response = await PutAsync(factory.CreateManagerClient(), id, agentId, version);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "absent is a 400, undecodable is a 400, stale is a 409 — three answers the client can "
            + "each act on. Treating absent as 'no opinion' makes every forgetful client a "
            + "last-write-wins client, silently");

        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/validation");
    }

    /// <summary>
    /// Q-6, recorded rather than asserted as the contract states it.
    /// </summary>
    /// <remarks>
    /// <b>The contract says a malformed route <c>Guid</c> is `400`. The observed behaviour is
    /// `404`</b>, because ASP.NET Core's <c>:guid</c> route constraint fails the match before any
    /// action runs, so nothing `002` built ever sees the request. It is a known defect owned by
    /// `002b` and recorded in `011`'s `plan.md` under *Contract changes* — a difference between
    /// the contract and the implementation is a defect in one of the two, never fixed silently.
    /// <br/>
    /// This test asserts what the code does, so the day `002b` lands it goes red and names the
    /// contract it then satisfies. Asserting the `400` instead would fail today for a reason that
    /// has nothing to do with this feature.
    /// </remarks>
    [Fact]
    public async Task A_malformed_route_id_returns_404_which_the_contract_says_should_be_400()
    {
        var response = await factory.CreateManagerClient().PutAsJsonAsync(
            "/api/tickets/not-a-guid/assignee",
            new { assigneeId = (Guid?)null, expectedVersion = "AAAAAAAAB9E=" });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "the route constraint short-circuits before the action — 002b owns the fix, and this "
            + "assertion is deliberately the observed behaviour rather than the contract's");
    }

    /// <summary>
    /// An inactive support user, created directly. There is no endpoint that can make one.
    /// </summary>
    /// <remarks>
    /// Reflection on <c>IsActive</c>, confined to this helper. User management is out of the
    /// release, so the alternative is leaving AC-6 and half of AC-13 untested — and BR-2.4 is one
    /// of the rules a reviewer will look for.
    /// </remarks>
    private async Task<Guid> SeedInactiveUserAsync()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        const string email = "retired@wasl.local";

        var existing = await context.SupportUsers
            .Where(user => user.Email == email)
            .Select(user => user.Id)
            .FirstOrDefaultAsync();

        if (existing != Guid.Empty)
        {
            return existing;
        }

        var user = Wasl.Domain.Users.SupportUser.Create(
            "Retired Colleague", email, "not-a-real-hash",
            Wasl.Domain.Users.SupportRole.Agent, DateTime.UtcNow, "en");

        typeof(Wasl.Domain.Users.SupportUser)
            .GetProperty(nameof(Wasl.Domain.Users.SupportUser.IsActive))!
            .SetValue(user, false);

        context.SupportUsers.Add(user);
        await context.SaveChangesAsync(CancellationToken.None);

        return user.Id;
    }
}
