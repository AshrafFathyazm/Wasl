using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Resilience;

/// <summary>
/// `036` §3.1 — the tag race answers `409`, not `500`. AC-1, AC-2, AC-3.
/// </summary>
/// <remarks>
/// <b>Every assertion is scoped to a ticket and a tag this class made.</b> The suite shares one
/// container and one database, so nothing here counts rows over a whole table.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class TagRaceTranslationTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<Guid> NewTicketAsync()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateEnglishManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Tag race",
            description = "A ticket for the tag race.",
            category = "Billing",
            channel = "Email",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        return (await BodyOf(response)).GetProperty("id").GetGuid();
    }

    /// <summary>
    /// A tag nothing else in the suite will touch.
    /// </summary>
    /// <remarks>
    /// <c>RandomNumberGenerator</c>, never a slice of a UUIDv7 — `CLAUDE.md`: a time-ordered id
    /// leads with a timestamp, so two minted milliseconds apart share their leading hex digits.
    /// `008` matched the wrong row that way and `007` collided two customers on a unique index in
    /// the very next feature.
    /// </remarks>
    private async Task<Guid> NewTagAsync()
    {
        var name = $"race-{System.Security.Cryptography.RandomNumberGenerator.GetInt32(1_000_000):D6}";

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var tag = Tag.Create(name, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        context.Tags.Add(tag);
        await context.SaveChangesAsync();

        return tag.Id;
    }

    private Task<HttpResponseMessage> AttachAsync(Guid ticketId, Guid tagId) =>
        factory.CreateEnglishManagerClient()
            .PutAsync($"/api/tickets/{ticketId}/tags/{tagId}", content: null);

    // ---- AC-1 ------------------------------------------------------------------------------

    /// <summary>
    /// Two simultaneous attaches of one tag: one `200`, one `409`, and never a `500`.
    /// </summary>
    /// <remarks>
    /// <b>This is the test that was impossible to pass before `036`.</b> The pre-check in
    /// <c>AttachTicketTagCommandHandler</c> cannot see a request running beside it, so both pass
    /// it and the unique index refuses the second insert — which `034` knew and wrote down. What
    /// `034` did not do is translate that violation, so the loser got an unmapped
    /// <c>DbUpdateException</c> and therefore a `500`.
    /// </remarks>
    [Fact]
    public async Task Two_simultaneous_attaches_of_one_tag_answer_200_and_409_and_never_500()
    {
        var ticketId = await NewTicketAsync();
        var tagId = await NewTagAsync();

        var responses = await Task.WhenAll(
            AttachAsync(ticketId, tagId),
            AttachAsync(ticketId, tagId));

        var statuses = responses.Select(response => response.StatusCode).ToArray();

        // Named individually rather than asserted as a set, so a failure says which side was
        // wrong. A `500` on either is the defect this feature closed.
        statuses.Should().NotContain(HttpStatusCode.InternalServerError);
        statuses.Should().Contain(HttpStatusCode.OK);
        statuses.Should().Contain(HttpStatusCode.Conflict);

        var conflict = responses.Single(response => response.StatusCode == HttpStatusCode.Conflict);

        (await BodyOf(conflict)).GetProperty("type").GetString()
            .Should().EndWith("/tag-unchanged");
    }

    // ---- AC-2 · the reason AC-1 alone is not enough ------------------------------------------

    /// <summary>
    /// The raced `409` and the sequential `409` are the same body, `traceId` excepted.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>`007` Q-D's rule, and AC-1 cannot see it.</b> Two responses can both be `409` and still
    /// differ in <c>title</c>, <c>detail</c> or the presence of <c>errors</c> — which would let a
    /// client tell which half of the rule caught it, and would mean the two paths are two
    /// implementations rather than one.
    /// </para>
    /// <para>
    /// <c>traceId</c> and <c>instance</c> are excluded because they are per-request by
    /// definition. Everything else is compared property by property.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task The_raced_409_and_the_sequential_409_are_the_same_body()
    {
        // ── The raced one ──
        var racedTicket = await NewTicketAsync();
        var racedTag = await NewTagAsync();

        var raced = await Task.WhenAll(
            AttachAsync(racedTicket, racedTag),
            AttachAsync(racedTicket, racedTag));

        var racedConflict = raced.SingleOrDefault(r => r.StatusCode == HttpStatusCode.Conflict);

        // If the two did not actually overlap, this test proves nothing — say so rather than
        // passing. A green run on a race that never happened is the worst outcome available here.
        racedConflict.Should().NotBeNull(
            "the two attaches must overlap for this test to compare the raced path");

        // ── The sequential one ──
        var plainTicket = await NewTicketAsync();
        var plainTag = await NewTagAsync();

        (await AttachAsync(plainTicket, plainTag)).StatusCode.Should().Be(HttpStatusCode.OK);

        var sequentialConflict = await AttachAsync(plainTicket, plainTag);
        sequentialConflict.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var fromRace = Comparable(await BodyOf(racedConflict!));
        var fromSequence = Comparable(await BodyOf(sequentialConflict));

        fromRace.Should().BeEquivalentTo(fromSequence);
    }

    /// <summary>Every field except the two that are per-request by definition.</summary>
    private static Dictionary<string, string> Comparable(JsonElement body) =>
        body.EnumerateObject()
            .Where(property => property.Name is not ("traceId" or "instance"))
            .ToDictionary(
                property => property.Name,
                property => property.Value.ToString(),
                StringComparer.Ordinal);

    // ---- AC-3 · THE NEGATIVE CONTROL ---------------------------------------------------------

    /// <summary>
    /// A unique violation on an index `036` does NOT name is still untranslated.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This is the guard on <c>TranslateDuplicate</c>'s rule, and it is meant to be seen to
    /// fail.</b> SQL Server reports 2601 and 2627 for any unique violation, so a translator that
    /// keyed on the number instead of the index NAME would turn every collision in the schema
    /// into a confident, wrong `409` — <c>tag-unchanged</c> for a duplicate tag NAME, which is a
    /// different fact entirely.
    /// </para>
    /// <para>
    /// <c>UX_Tags_Name</c> is used because no endpoint creates a tag, so this is the honest level
    /// to assert at: the translation is a persistence concern and this proves it declined.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_unique_violation_on_an_unnamed_index_is_not_translated()
    {
        var name = $"control-{System.Security.Cryptography.RandomNumberGenerator.GetInt32(1_000_000):D6}";
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        context.Tags.Add(Tag.Create(name, createdAt));
        await context.SaveChangesAsync();

        using var second = factory.Services.CreateScope();
        var other = second.ServiceProvider.GetRequiredService<WaslDbContext>();

        other.Tags.Add(Tag.Create(name, createdAt));

        var act = async () => await other.SaveChangesAsync();

        // NOT a domain exception. An unrecognised constraint stays a DbUpdateException and
        // therefore a `500`, which is the honest answer for a rule nobody has written a message
        // for — and the assertion that stops the translator being widened.
        await act.Should().ThrowAsync<DbUpdateException>();
    }
}
