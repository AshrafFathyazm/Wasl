using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;

namespace Wasl.Api.IntegrationTests.Tickets;

/// <summary>
/// <c>GET /api/tickets</c>. `010` AC-1, AC-2, AC-3, AC-11, AC-12, AC-13, AC-21, AC-22.
/// </summary>
/// <remarks>
/// The suite shares one database, so no assertion here counts every ticket in the table. Each
/// test seeds its own customer and identifies its own rows — which is the constraint
/// `CLAUDE.md` records after seven containers became one.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class GetTicketsTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>Creates <paramref name="count"/> tickets for one fresh customer.</summary>
    private async Task<(Guid CustomerId, List<Guid> TicketIds)> SeedAsync(int count)
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var client = factory.CreateClient();
        var ids = new List<Guid>();

        for (var i = 0; i < count; i++)
        {
            var response = await client.PostAsJsonAsync("/api/tickets", new
            {
                customerId,
                subject = $"Subject {i}",
                description = "description",
                category = "Account",
                channel = "LiveChat",
                priority = "Critical",
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created);
            ids.Add((await BodyOf(response)).GetProperty("id").GetGuid());
        }

        return (customerId, ids);
    }

    /// <summary>AC-1, AC-13. The envelope and the row.</summary>
    [Fact]
    public async Task The_list_returns_the_paged_envelope_and_the_documented_row()
    {
        var (customerId, ids) = await SeedAsync(1);

        var body = await BodyOf(await factory.CreateClient().GetAsync("/api/tickets?pageSize=100"));

        body.EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo(["items", "page", "pageSize", "totalCount", "totalPages"],
                "AC-1 — the standard envelope, and only it");

        var row = body.GetProperty("items").EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == ids[0]);

        row.EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo(
                [
                    "id", "ticketNumber", "subject", "customerId", "customerName", "status",
                    "priority", "category", "channel", "assigneeId", "assigneeName",
                    "isEscalated", "createdAtUtc",
                ],
                "AC-13 — a row, not a ticket. No description, no allowedTransitions, no version");

        row.GetProperty("customerId").GetGuid().Should().Be(customerId);
        row.GetProperty("customerName").GetString().Should().Be("Probe Customer",
            "AC-12 — projected in the same query, not resolved per row");
        row.GetProperty("status").GetString().Should().Be("New");
        row.GetProperty("priority").GetString().Should().Be("Critical",
            "the blueprint's fourth priority is Critical, not Urgent");
        row.GetProperty("category").GetString().Should().Be("Account",
            "and its fourth category is Account, not Complaint");
        row.GetProperty("channel").GetString().Should().Be("LiveChat");
        row.GetProperty("assigneeId").ValueKind.Should().Be(JsonValueKind.Null);
        row.GetProperty("assigneeName").ValueKind.Should().Be(JsonValueKind.Null,
            "both null until 004 creates dbo.SupportUsers — the row is still returned, because "
            + "the join is a left join");
        row.GetProperty("isEscalated").GetBoolean().Should().BeFalse();
    }

    /// <summary>AC-3. Clamped, never rejected, and the response echoes what was used.</summary>
    [Theory]
    [InlineData(null, null, 20)]
    [InlineData(null, 5, 5)]
    [InlineData(null, 500, 100)]
    [InlineData(null, 0, 20)]
    [InlineData(null, -3, 20)]
    public async Task Page_size_is_clamped_and_the_effective_value_is_echoed(
        int? page, int? pageSize, int expected)
    {
        var query = pageSize is null ? "/api/tickets" : $"/api/tickets?pageSize={pageSize}";

        if (page is not null)
        {
            query += $"&page={page}";
        }

        var body = await BodyOf(await factory.CreateClient().GetAsync(query));

        body.GetProperty("pageSize").GetInt32().Should().Be(expected,
            "BR-7.2 clamps rather than rejecting — a 400 would make the boundary every client's "
            + "business. And the echo is the effective value: echoing the request would leave a "
            + "client computing totalPages from a number the server ignored");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task A_page_below_one_is_clamped_to_the_first_page(int page)
    {
        var body = await BodyOf(await factory.CreateClient().GetAsync($"/api/tickets?page={page}"));

        body.GetProperty("page").GetInt32().Should().Be(1, "BR-7.2 — 1-based, clamped up");
    }

    /// <summary>AC-2. Newest first.</summary>
    [Fact]
    public async Task The_default_sort_is_newest_first()
    {
        var (_, ids) = await SeedAsync(3);

        var body = await BodyOf(await factory.CreateClient().GetAsync("/api/tickets?pageSize=100"));

        var mine = body.GetProperty("items").EnumerateArray()
            .Where(item => ids.Contains(item.GetProperty("id").GetGuid()))
            .Select(item => item.GetProperty("id").GetGuid())
            .ToArray();

        mine.Should().Equal(ids.AsEnumerable().Reverse(),
            "BR-7.1 — CreatedAtUtc descending, so the last created is first");
    }

    /// <summary>
    /// AC-22. **The sort is stable**, so no row is duplicated or lost across pages.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <c>CreatedAtUtc</c> is <c>datetime2(3)</c>. SQL Server gives no stable order for a tie, so
    /// without a tie-break the engine may place one row on both pages or on neither — a
    /// non-deterministic failure that presents as a row silently missing from a list.
    /// </para>
    /// <para>
    /// <b>The tie is forced, and it had to be.</b> The first version of this test created six
    /// tickets through six HTTP requests and passed with the tie-break removed — six requests are
    /// six scopes, so six distinct instants, and the tie never arose. The test proved nothing it
    /// was written to prove. <see cref="ForceIdenticalCreationInstantAsync"/> now sets all six to
    /// one timestamp, and removing <c>ThenByDescending(Id)</c> turns this red.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Two_consecutive_pages_contain_each_row_exactly_once()
    {
        var (_, ids) = await SeedAsync(6);
        await ForceIdenticalCreationInstantAsync(ids);

        var client = factory.CreateClient();

        var first = await BodyOf(await client.GetAsync("/api/tickets?page=1&pageSize=3"));
        var second = await BodyOf(await client.GetAsync("/api/tickets?page=2&pageSize=3"));

        var seen = first.GetProperty("items").EnumerateArray()
            .Concat(second.GetProperty("items").EnumerateArray())
            .Select(item => item.GetProperty("id").GetGuid())
            .ToArray();

        seen.Should().OnlyHaveUniqueItems(
            "a row appearing on two pages is the visible half of the defect; the invisible half "
            + "is the row that appears on neither");

        seen.Should().HaveCount(6, "three plus three, with no overlap and no gap");

        // The two pages together must be the six newest, which for a fresh customer's tickets
        // created last are exactly these six.
        seen.Should().BeEquivalentTo(ids,
            "and they are the newest six, because the sort is descending");
    }

    /// <summary>
    /// Collapses several tickets onto one <c>CreatedAtUtc</c>, so the sort has a real tie.
    /// </summary>
    /// <remarks>
    /// <para>
    /// SQL, deliberately: <c>CreatedAtUtc</c> is stamped by <c>SaveChangesAsync</c> and there is no
    /// legitimate way to set it — which is the point of the stamping. `001` learned that raw SQL
    /// bypasses the UTC value converter, and that is irrelevant here: the test needs the rows to
    /// share whatever value they get, not a particular one.
    /// </para>
    /// <para>
    /// <c>ExecuteSqlAsync</c> with a parameter per id rather than <c>ExecuteSqlRawAsync</c> with an
    /// interpolated list — the analyser flagged the first version as EF1002, and it was right even
    /// in a test: a habit formed here is a habit carried into `015`, which builds a search term
    /// from user input.
    /// </para>
    /// </remarks>
    private async Task ForceIdenticalCreationInstantAsync(IEnumerable<Guid> ids)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider
            .GetRequiredService<Wasl.Infrastructure.Persistence.WaslDbContext>();

        var instant = new DateTime(2026, 8, 26, 10, 0, 0, DateTimeKind.Utc);

        foreach (var id in ids)
        {
            await context.Database.ExecuteSqlAsync(
                $"UPDATE dbo.Tickets SET CreatedAtUtc = {instant} WHERE Id = {id}",
                CancellationToken.None);
        }
    }

    /// <summary>AC-11, AC-21. An empty page is a 200, and the totals stay honest.</summary>
    [Fact]
    public async Task A_page_beyond_the_last_returns_an_empty_array_with_the_real_totals()
    {
        await SeedAsync(2);

        var body = await BodyOf(await factory.CreateClient()
            .GetAsync("/api/tickets?page=99999&pageSize=20"));

        body.GetProperty("items").GetArrayLength().Should().Be(0,
            "BR-7.6 — a 200 with an empty array, never a 404. 'No results on this page' is a "
            + "valid answer to a valid question");

        body.GetProperty("page").GetInt32().Should().Be(99999, "the effective page, echoed");
        body.GetProperty("totalCount").GetInt32().Should().BeGreaterThan(0,
            "the total is of the whole list, counted before Skip/Take — counting after would "
            + "return at most the page size and make totalPages permanently 1");
        body.GetProperty("totalPages").GetInt32().Should().BeGreaterThan(0);
    }

    /// <summary>totalPages is derived, and zero rather than one when there is nothing.</summary>
    [Fact]
    public async Task Total_pages_is_consistent_with_the_count_and_the_page_size()
    {
        await SeedAsync(1);

        var body = await BodyOf(await factory.CreateClient().GetAsync("/api/tickets?pageSize=7"));

        var totalCount = body.GetProperty("totalCount").GetInt32();
        var expected = (int)Math.Ceiling(totalCount / 7.0);

        body.GetProperty("totalPages").GetInt32().Should().Be(expected,
            "derived, never stored — two fields that must agree are two fields that eventually "
            + "do not");
    }

    /// <summary>Arabic subjects survive the list projection.</summary>
    [Fact]
    public async Task Arabic_subjects_round_trip_through_the_list()
    {
        const string arabic = "لا يمكنني تسجيل الدخول";

        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var client = factory.CreateClient();

        var created = await client.PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = arabic,
            description = "وصف",
            category = "Billing",
            channel = "Sms",
        });

        var id = (await BodyOf(created)).GetProperty("id").GetGuid();

        var body = await BodyOf(await client.GetAsync("/api/tickets?pageSize=100"));

        body.GetProperty("items").EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == id)
            .GetProperty("subject").GetString()
            .Should().Be(arabic, "nvarchar through the projection as well as the write");
    }
}
