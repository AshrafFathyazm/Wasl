using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Wasl.Api.IntegrationTests.Audit;

namespace Wasl.Api.IntegrationTests.Tickets;

/// <summary>
/// `034`'s READ half, added 2026-08-31: <c>GET /api/tags</c> and <c>tags</c> on the ticket.
/// </summary>
/// <remarks>
/// <para>
/// <b>`034` shipped the writes without them.</b> <c>PUT</c> and
/// <c>DELETE /api/tickets/{id}/tags/{tagId}</c> existed; nothing returned the set a client
/// attaches FROM, and the ticket response carried no <c>tags</c>. So a UI could write tags it
/// could neither list nor display — the same shape as the defect that left <c>assigneeName</c>
/// null on every list row for three days, and the family `CLAUDE.md` records as *an entity
/// written only from outside the real path is an entity nothing has verified.*
/// </para>
/// <para>
/// Found by building the screen and measuring the response, not by reading the code.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class TagReadTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<Guid> NewTicketAsync()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "tag read",
            description = "description",
            category = "Account",
            channel = "LiveChat",
            priority = "Normal",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await BodyOf(response)).GetProperty("id").GetGuid();
    }

    // ── GET /api/tags ───────────────────────────────────────────────────────────────

    /// <summary>The vocabulary a client attaches from.</summary>
    [Fact]
    public async Task The_tag_vocabulary_is_a_bare_array_of_id_and_name()
    {
        var response = await factory.CreateAgentClient().GetAsync("/api/tags");

        response.StatusCode.Should().Be(HttpStatusCode.OK,
            "any authenticated role reads it — `034` Q-4 already lets an Agent ATTACH, so a role "
            + "gate on merely listing the vocabulary would refuse the legitimate case");

        var raw = await response.Content.ReadAsStringAsync();
        var body = JsonDocument.Parse(raw).RootElement;

        /* EnumerateArray throws on an object, which is the assertion: a bare array, not the
         * BR-7 envelope. Same shape ruling as `GET /api/support-users`. */
        var tags = body.EnumerateArray().ToList();

        tags.Should().NotBeEmpty("`--seed` writes the starting set — `034` Q-3");

        /* Content, not presence. Every field, and nothing else: a tag is an id and a name, and
         * a field nobody asked for is a field that ends up on a screen. */
        foreach (var tag in tags)
        {
            tag.EnumerateObject().Select(property => property.Name)
                .Should().BeEquivalentTo(["id", "name"]);

            tag.GetProperty("id").GetGuid().Should().NotBeEmpty();
            tag.GetProperty("name").GetString().Should().NotBeNullOrWhiteSpace();
        }
    }

    /// <summary>Ordered by name, and asserted as an ORDER rather than as a set.</summary>
    /// <remarks>
    /// `013` deleted a tie-break and its repeatability test still passed, because SQL Server
    /// agreed with itself twice. What catches a missing `ORDER BY` is an assertion about a
    /// specific order.
    /// </remarks>
    [Fact]
    public async Task The_vocabulary_is_ordered_by_name()
    {
        var body = await BodyOf(await factory.CreateManagerClient().GetAsync("/api/tags"));

        var names = body.EnumerateArray()
            .Select(tag => tag.GetProperty("name").GetString()!)
            .ToList();

        // ── CASE-INSENSITIVE, because that is what the COLUMN is ────────────────────
        //
        // This read `StringComparer.Ordinal` until `036`, which contradicted the sentence below
        // it: `dbo.Tags.Name` carries an explicit CI collation (TagConfiguration), so SQL sorts
        // «race» before «Refund» while .NET ordinal puts every capital letter first. The two
        // agreed only while every tag in the database happened to share a case.
        //
        // It went red the moment `036` added lowercase tag names beside the seeded «Refund…» —
        // which is the assertion working, not `036` breaking it. The ORDER BY was never wrong;
        // the comparer was.
        names.Should().BeInAscendingOrder(
            StringComparer.Create(System.Globalization.CultureInfo.InvariantCulture, ignoreCase: true),
            "ordered in SQL under the database collation. This asserts the ORDER, not that two "
            + "requests agree — `013` proved the second proves nothing");
    }

    /// <summary>The fallback policy, on a new endpoint.</summary>
    [Fact]
    public async Task The_vocabulary_refuses_an_unauthenticated_caller()
    {
        var response = await factory.CreateClient().GetAsync("/api/tags");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── tags on the ticket ──────────────────────────────────────────────────────────

    /// <summary>
    /// The field that was missing. **`[]`, never absent and never null.**
    /// </summary>
    /// <remarks>
    /// Absent and <c>null</c> both read as <c>undefined</c> to a client that renders
    /// <c>tags.map(…)</c>, and the difference between the two is a crash and an empty list. The
    /// key's PRESENCE is asserted over the raw text, because a shape assertion on the parsed
    /// object cannot tell an absent key from a null one.
    /// </remarks>
    [Fact]
    public async Task A_new_ticket_carries_an_empty_tag_array_rather_than_nothing()
    {
        var id = await NewTicketAsync();

        var raw = await factory.CreateManagerClient()
            .GetStringAsync($"/api/tickets/{id}");

        raw.Should().Contain("\"tags\"",
            "the key is present even when the list is empty. Absent and null both arrive as "
            + "undefined, and a client rendering tags.map() then crashes on the one and not the "
            + "other");

        var body = JsonDocument.Parse(raw).RootElement;

        body.GetProperty("tags").ValueKind.Should().Be(JsonValueKind.Array);
        body.GetProperty("tags").EnumerateArray().Should().BeEmpty(
            "a ticket is never tagged at creation — `009` AC-2's sibling");
    }

    /// <summary>Attach, then READ. The write was already proven; the read never was.</summary>
    [Fact]
    public async Task An_attached_tag_comes_back_on_the_ticket()
    {
        var id = await NewTicketAsync();
        var client = factory.CreateManagerClient();

        var vocabulary = await BodyOf(await client.GetAsync("/api/tags"));
        var tag = vocabulary.EnumerateArray().First();
        var tagId = tag.GetProperty("id").GetGuid();
        var tagName = tag.GetProperty("name").GetString();

        var attach = await client.PutAsync($"/api/tickets/{id}/tags/{tagId}", null);
        attach.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await BodyOf(await client.GetAsync($"/api/tickets/{id}"));

        var names = body.GetProperty("tags").EnumerateArray()
            .Select(entry => entry.GetProperty("name").GetString())
            .ToList();

        names.Should().Equal([tagName],
            "the READ is what a screen renders. Asserting the attach response alone is what "
            + "left this field missing in the first place");
    }

    /// <summary>Detach, then read. Both directions, because one proves nothing.</summary>
    /// <remarks>
    /// An attach that returned the tag would also pass if the read were hard-coded to echo the
    /// last write. The detach is the half that fails if the read is not really reading.
    /// </remarks>
    [Fact]
    public async Task A_detached_tag_stops_coming_back()
    {
        var id = await NewTicketAsync();
        var client = factory.CreateManagerClient();

        var tagId = (await BodyOf(await client.GetAsync("/api/tags")))
            .EnumerateArray().First().GetProperty("id").GetGuid();

        await client.PutAsync($"/api/tickets/{id}/tags/{tagId}", null);

        var detach = await client.DeleteAsync($"/api/tickets/{id}/tags/{tagId}");
        detach.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await BodyOf(await client.GetAsync($"/api/tickets/{id}"));

        body.GetProperty("tags").EnumerateArray().Should().BeEmpty();
    }

    /// <summary>
    /// The read costs the same whatever the tag count — `010` AC-12's counter, pointed here.
    /// </summary>
    /// <remarks>
    /// `TicketTagReader` joins in the projection, and the risk of adding a second read to a
    /// handler is a query per tag. Asserted as an EQUALITY between one tag and several, never as
    /// a threshold: a threshold drifts with every unrelated change to the request.
    /// </remarks>
    [Fact]
    public async Task Reading_a_ticket_costs_the_same_whatever_the_tag_count()
    {
        var client = factory.CreateManagerClient();
        var oneTag = await NewTicketAsync();
        var manyTags = await NewTicketAsync();

        var vocabulary = (await BodyOf(await client.GetAsync("/api/tags")))
            .EnumerateArray()
            .Select(tag => tag.GetProperty("id").GetGuid())
            .ToList();

        vocabulary.Count.Should().BeGreaterThan(2,
            "the seeded set has to be big enough for this comparison to mean anything");

        await client.PutAsync($"/api/tickets/{oneTag}/tags/{vocabulary[0]}", null);

        foreach (var tagId in vocabulary.Take(4))
        {
            await client.PutAsync($"/api/tickets/{manyTags}/tags/{tagId}", null);
        }

        var probeOne = factory.CountQueries();
        await client.GetAsync($"/api/tickets/{oneTag}");
        var withOne = probeOne.Count;

        var probeMany = factory.CountQueries();
        await client.GetAsync($"/api/tickets/{manyTags}");
        var withMany = probeMany.Count;

        withMany.Should().Be(withOne,
            $"one tag cost {withOne} and four cost {withMany}. The tags are joined in the "
            + "projection, so the count must not grow with them");
    }
}
