using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Infrastructure.Persistence;
using Wasl.Infrastructure.Persistence.Seed;

namespace Wasl.Api.IntegrationTests.Tickets;

/// <summary>
/// An assigned ticket reads back with its assignee's NAME, on both endpoints.
/// </summary>
/// <remarks>
/// <para>
/// <b>The test nothing had.</b> `011` built the whole assignment feature and asserts the write —
/// the row, the history entries, the audit entry, the denial. `010` AC-12 counts query round
/// trips on the list. **Neither reads an assigned ticket back and looks at the name**, and the
/// consequence shipped: both endpoints returned the id and `null` for the name, for three days
/// after `004` created the table they were waiting for.
/// </para>
/// <para>
/// `CLAUDE.md` keeps a table for *an entity written only from outside the real path*. This is its
/// reverse — the write path is exercised and correct, and it is the READ projection nothing
/// asserted.
/// </para>
/// <para>
/// <b>Two shapes, and they are not a mistake.</b> `009`'s frozen contract gives the detail an
/// <c>assignee</c> object carrying <c>id</c>, <c>fullName</c> and <c>role</c>; `010`'s gives the
/// list flat <c>assigneeId</c> and <c>assigneeName</c>. Two contracts, two audiences, both
/// frozen. **Do not unify them** — this test asserts both shapes deliberately.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class AssigneeProjectionTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>Creates a ticket and assigns it to the seeded Agent.</summary>
    private async Task<(Guid Id, Guid AgentId, string AgentName)> AssignedTicketAsync()
    {
        var client = factory.CreateEnglishManagerClient();
        var customerId = await AuditFixture.SeedCustomerAsync(factory, "assignee projection");

        var created = await client.PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Assignee projection probe",
            description = "Created so an assigned ticket can be read back.",
            category = "Technical",
            channel = "Email",
        });

        var body = await BodyOf(created);
        var id = body.GetProperty("id").GetGuid();
        var version = body.GetProperty("version").GetString();

        Guid agentId;
        string agentName;

        using (var scope = factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();
            var agent = context.SupportUsers.Single(user => user.Email == SupportUserSeeder.AgentEmail);

            agentId = agent.Id;
            agentName = agent.FullName;
        }

        var assigned = await client.PutAsJsonAsync(
            $"/api/tickets/{id}/assignee",
            new { assigneeId = agentId, expectedVersion = version });

        assigned.StatusCode.Should().Be(HttpStatusCode.OK,
            "the fixture must actually assign, or the assertions below prove nothing");

        return (id, agentId, agentName);
    }

    /// <summary>
    /// The detail endpoint carries the assignee object, not just the id.
    /// </summary>
    /// <remarks>
    /// The cause here was subtle: <c>GetTicketByIdQuery</c> returns <c>CreateTicketResult</c> and
    /// the handler called <c>CreateTicketCommandHandler.Map(ticket, customer)</c>, whose
    /// <c>assignee</c> parameter <b>defaults to null</b> — correct for a create, because `009`
    /// AC-2 says a ticket is never assigned at creation. **A read reusing a create's mapper
    /// inherits an assumption that is only true for creates.**
    /// </remarks>
    [Fact]
    public async Task The_detail_carries_the_assignee_and_not_only_the_id()
    {
        var (id, agentId, agentName) = await AssignedTicketAsync();

        var body = await BodyOf(
            await factory.CreateEnglishManagerClient().GetAsync($"/api/tickets/{id}"));

        body.GetProperty("assignedToUserId").GetGuid().Should().Be(agentId);

        body.TryGetProperty("assignee", out var assignee).Should().BeTrue();
        assignee.ValueKind.Should().NotBe(JsonValueKind.Null,
            "the id is set, so the contract's assignee object must be there too — an id without "
            + "a name is a shape `009`'s contract does not describe");

        assignee.GetProperty("id").GetGuid().Should().Be(agentId);
        assignee.GetProperty("fullName").GetString().Should().Be(agentName);
        assignee.GetProperty("role").GetString().Should().Be("Agent");
    }

    /// <summary>
    /// The list endpoint carries the assignee's name beside the id.
    /// </summary>
    /// <remarks>
    /// <b>This is a contract violation and not merely a gap.</b> `010`'s contract says of the two
    /// fields: *"**Both `null` when unassigned.** The row is still returned — the join is a left
    /// join."* Both, together. One populated and one null is a shape the contract does not
    /// describe, so a client written against it may treat a non-null id as meaning a name is
    /// present.
    /// <br/>
    /// <b>And `002c`'s OpenAPI comparison structurally cannot catch it</b> — that compares paths
    /// and methods, and this shape is legal. Only a value shows it, which is why this test reads
    /// one.
    /// </remarks>
    [Fact]
    public async Task The_list_carries_the_assignee_name_beside_the_id()
    {
        var (id, agentId, agentName) = await AssignedTicketAsync();

        var body = await BodyOf(
            await factory.CreateEnglishManagerClient().GetAsync("/api/tickets?pageSize=100"));

        var row = body.GetProperty("items").EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == id);

        row.GetProperty("assigneeId").GetGuid().Should().Be(agentId);
        row.GetProperty("assigneeName").GetString().Should().Be(agentName,
            "the contract says the two are both null when unassigned — together. One set and "
            + "one null is a shape it does not describe");
    }

    /// <summary>
    /// An UNASSIGNED ticket still reads back with both halves null, on both endpoints.
    /// </summary>
    /// <remarks>
    /// The other side of the contract sentence, and the reason it is asserted: a fix that
    /// populated the name unconditionally — an inner join, or a fabricated empty string — would
    /// satisfy both tests above and break the case the contract actually spells out.
    /// </remarks>
    [Fact]
    public async Task An_unassigned_ticket_reads_back_with_both_halves_null()
    {
        var client = factory.CreateEnglishManagerClient();
        var customerId = await AuditFixture.SeedCustomerAsync(factory, "unassigned probe");

        var created = await client.PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Unassigned probe",
            description = "Never assigned, so both halves must stay null.",
            category = "General",
            channel = "Email",
        });

        var id = (await BodyOf(created)).GetProperty("id").GetGuid();

        var detail = await BodyOf(await client.GetAsync($"/api/tickets/{id}"));
        detail.GetProperty("assignedToUserId").ValueKind.Should().Be(JsonValueKind.Null);
        detail.GetProperty("assignee").ValueKind.Should().Be(JsonValueKind.Null);

        var row = (await BodyOf(await client.GetAsync("/api/tickets?pageSize=100")))
            .GetProperty("items").EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == id);

        row.GetProperty("assigneeId").ValueKind.Should().Be(JsonValueKind.Null);
        row.GetProperty("assigneeName").ValueKind.Should().Be(JsonValueKind.Null);
    }

    /// <summary>
    /// The list still issues a fixed number of queries with the name joined in.
    /// </summary>
    /// <remarks>
    /// `010` AC-12's guard, re-run against the change. Resolving the name per row would be one
    /// query per row — the classic fix that passes every test at five tickets and times out at
    /// ten thousand. Asserted as EQUAL across two page sizes rather than under a threshold,
    /// because a threshold drifts with every unrelated change (`008`).
    /// </remarks>
    [Fact]
    public async Task Joining_the_name_does_not_add_a_query_per_row()
    {
        var client = factory.CreateEnglishManagerClient();

        var smallProbe = factory.CountQueries();
        await client.GetAsync("/api/tickets?pageSize=1");
        var small = smallProbe.Count;

        var largeProbe = factory.CountQueries();
        await client.GetAsync("/api/tickets?pageSize=100");
        var large = largeProbe.Count;

        large.Should().Be(small,
            "one page of a hundred must cost the same number of round trips as a page of one, "
            + "or the name is being resolved per row");
    }
}
