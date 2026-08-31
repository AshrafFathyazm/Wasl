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
/// Tags and reply templates. `034` AC-13, AC-14, AC-15.
/// </summary>
/// <remarks>
/// <b>Every assertion is scoped to a ticket or a tag this test made.</b> The suite shares one
/// container and one database, so a count over <c>dbo.Tags</c> would be right today and wrong
/// depending on which tests ran first.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class TicketTagTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<Guid> NewTicketAsync()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateEnglishManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Tagging",
            description = "A ticket to tag.",
            category = "Billing",
            channel = "Email",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        return (await BodyOf(response)).GetProperty("id").GetGuid();
    }

    /// <summary>
    /// A tag with a name unique to this test, so nothing it asserts depends on the seed or on
    /// another test's tags.
    /// </summary>
    private async Task<(Guid Id, string Name)> NewTagAsync(string? name = null)
    {
        // Random, not a slice of a UUIDv7. CLAUDE.md: a time-ordered id is a poor source of a
        // unique PREFIX — two minted milliseconds apart share their leading hex digits, and `007`
        // collided two customers on a unique index doing exactly that.
        var unique = name ?? $"tag-{System.Security.Cryptography.RandomNumberGenerator.GetInt32(1_000_000):D6}";

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var tag = Tag.Create(unique, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        context.Tags.Add(tag);
        await context.SaveChangesAsync();

        return (tag.Id, tag.Name);
    }

    private Task<HttpResponseMessage> AttachAsync(Guid ticketId, Guid tagId) =>
        factory.CreateEnglishManagerClient()
            .PutAsync($"/api/tickets/{ticketId}/tags/{tagId}", content: null);

    private Task<HttpResponseMessage> DetachAsync(Guid ticketId, Guid tagId) =>
        factory.CreateEnglishManagerClient()
            .DeleteAsync($"/api/tickets/{ticketId}/tags/{tagId}");

    // ---- AC-13 · attaching and detaching, and the audit row each writes -----------------------

    [Fact]
    public async Task Attaching_returns_the_whole_set_and_writes_an_audit_row()
    {
        var ticketId = await NewTicketAsync();
        var (tagId, tagName) = await NewTagAsync();

        var response = await AttachAsync(ticketId, tagId);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await BodyOf(response);

        body.GetProperty("tags").EnumerateArray()
            .Select(tag => tag.GetProperty("name").GetString())
            .Should().Contain(tagName,
                "the response is the set the client should now render, not the one tag that moved");

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        /* READ THE ACTOR, DO NOT COUNT THE ROWS. `011`'s defect was NULL on every history row
         * while the count was right; `003` moved its interceptor and COUNT(*) still returned 1
         * with every `Changes` null. A test that checks a row EXISTS survives both. */
        var entry = await context.Set<AuditEntry>()
            .Where(row => row.Action == "Ticket.TagAttached" && row.EntityId == ticketId)
            .OrderByDescending(row => row.OccurredAtUtc)
            .FirstAsync();

        entry.ActorUserId.Should().NotBeNull();
        entry.Outcome.Should().Be(AuditOutcome.Success);
    }

    [Fact]
    public async Task Detaching_removes_it_and_writes_its_own_audit_row()
    {
        var ticketId = await NewTicketAsync();
        var (tagId, tagName) = await NewTagAsync();

        (await AttachAsync(ticketId, tagId)).StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await DetachAsync(ticketId, tagId);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await BodyOf(response)).GetProperty("tags").EnumerateArray()
            .Select(tag => tag.GetProperty("name").GetString())
            .Should().NotContain(tagName);

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        // A DISTINCT action, not one "Ticket.TagChanged" for both. The audit log has to be able
        // to answer "who took this label off", which one action name cannot.
        (await context.Set<AuditEntry>().AnyAsync(row =>
            row.Action == "Ticket.TagDetached" && row.EntityId == ticketId))
            .Should().BeTrue();
    }

    [Fact]
    public async Task Attaching_the_same_tag_twice_is_a_409_and_not_a_silent_200()
    {
        // A double-click on the picker. A 200 would tell the client its request was applied when
        // nothing happened — the rule `AssigneeUnchangedException` already states.
        var ticketId = await NewTicketAsync();
        var (tagId, _) = await NewTagAsync();

        (await AttachAsync(ticketId, tagId)).StatusCode.Should().Be(HttpStatusCode.OK);

        var second = await AttachAsync(ticketId, tagId);

        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(second)).GetProperty("type").GetString()
            .Should().EndWith("errors/tag-unchanged");
    }

    [Fact]
    public async Task Detaching_a_tag_the_ticket_does_not_carry_is_a_409()
    {
        var ticketId = await NewTicketAsync();
        var (tagId, _) = await NewTagAsync();

        var response = await DetachAsync(ticketId, tagId);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task An_unknown_tag_is_a_400_on_tagId_and_not_a_404()
    {
        /* A 404 addresses the TICKET, and the ticket was found. Sending one here would tell the
         * client its ticket id was wrong and send it hunting a typo that is not there — the same
         * choice `011` made for an inactive assignee. */
        var ticketId = await NewTicketAsync();

        var response = await AttachAsync(ticketId, Guid.CreateVersion7());

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await BodyOf(response)).GetProperty("errors").GetProperty("tagId").EnumerateArray()
            .Should().ContainSingle().Which.GetString()
            .Should().Be("That tag is not available. Refresh the list and try again.",
                "READ THE MESSAGE. `errors[field]` with one entry is a shape assertion, and all "
                + "seventeen unresolved resource keys shipped under exactly that shape");
    }

    [Fact]
    public async Task A_retired_tag_cannot_be_attached_but_can_still_be_detached()
    {
        /* Otherwise a ticket keeps a label nobody can take off it. The two halves are asserted
         * together because each alone is satisfied by a wrong implementation: refusing both
         * passes the first, allowing both passes the second. */
        var ticketId = await NewTicketAsync();
        var (tagId, _) = await NewTagAsync();

        (await AttachAsync(ticketId, tagId)).StatusCode.Should().Be(HttpStatusCode.OK);

        using (var scope = factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();
            await context.Tags.Where(tag => tag.Id == tagId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(tag => tag.IsActive, false));
        }

        (await DetachAsync(ticketId, tagId)).StatusCode.Should().Be(HttpStatusCode.OK,
            "a retired tag must still come off");

        (await AttachAsync(ticketId, tagId)).StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "but it must not go back on");
    }

    // ---- AC-14 · the collation is the mechanism, so it is asserted against a real server -------

    [Fact]
    public async Task Two_tags_differing_only_in_case_are_the_same_tag()
    {
        /* THE UNIQUE INDEX IS ONLY AS GOOD AS THE COLLATION UNDER IT. `008` found three searched
         * customer columns with no explicit collation — case-insensitive by luck of the server,
         * which is correct on one machine and undefined on the next. Asserted against real SQL
         * Server because that is the only place the collation exists. */
        var name = $"Refund-{System.Security.Cryptography.RandomNumberGenerator.GetInt32(1_000_000):D6}";

        await NewTagAsync(name);

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        context.Tags.Add(Tag.Create(
            name.ToUpperInvariant(), new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)));

        var act = async () => await context.SaveChangesAsync();

        await act.Should().ThrowAsync<DbUpdateException>(
            "UX_Tags_Name is unique under a case-insensitive collation, so these are one tag");
    }

    // ---- AC-15 · canned replies are scoped ----------------------------------------------------

    [Fact]
    public async Task Canned_replies_are_scoped_to_the_category_and_include_the_general_ones()
    {
        var client = factory.CreateEnglishManagerClient();

        var billing = await BodyOf(await client.GetAsync("/api/canned-replies?category=Billing"));
        var technical = await BodyOf(await client.GetAsync("/api/canned-replies?category=Technical"));

        var billingCategories = billing.EnumerateArray()
            .Select(reply => reply.GetProperty("category").GetString()).ToList();

        billingCategories.Should().NotBeEmpty("--seed writes the templates this reads");
        billingCategories.Should().OnlyContain(category => category == "Billing" || category == null,
            "a null category means OFFERED ON EVERY TICKET — filtering on equality alone would "
            + "drop exactly the templates meant to appear everywhere");

        billing.EnumerateArray().Select(reply => reply.GetProperty("id").GetGuid())
            .Should().NotBeEquivalentTo(
                technical.EnumerateArray().Select(reply => reply.GetProperty("id").GetGuid()),
                "the two categories do not offer the same set, or the scoping does nothing");
    }
}
