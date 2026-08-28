using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Application.Common;
using Wasl.Application.Features.Customers.GetCustomers;
using Wasl.Domain.Customers;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Customers;

/// <summary>
/// <c>GET /api/customers</c> and <c>GET /api/customers/{id}</c>. `008`.
/// </summary>
/// <remarks>
/// Every assertion is scoped by a per-test marker in the customer's name, because the integration
/// suite shares one database — `CLAUDE.md`'s rule after seven classes each passed alone and the
/// suite died. Nothing here counts rows in a whole table.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class CustomerReadTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>
    /// Inserts a customer directly. There is no create endpoint until `007`.
    /// </summary>
    /// <remarks>
    /// <c>Customer</c> has no factory yet, so the properties are set by reflection — confined to
    /// this helper, the same shortcut `011` used for an inactive support user, and for the same
    /// reason: the alternative is leaving this feature's whole read surface untested until `007`.
    /// </remarks>
    private async Task<Guid> SeedAsync(
        string fullName,
        string? email = null,
        string? phone = "+966500000000",
        string? company = null,
        string? notes = null,
        bool isActive = true)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var customer = (Customer)Activator.CreateInstance(typeof(Customer), nonPublic: true)!;
        var now = DateTime.UtcNow;

        void Set(string property, object? value) =>
            typeof(Customer).GetProperty(property)!.SetValue(customer, value);

        Set(nameof(Customer.Id), Guid.CreateVersion7());
        Set(nameof(Customer.FullName), fullName);
        Set(nameof(Customer.Email), email);
        Set(nameof(Customer.PhoneE164), phone);
        Set(nameof(Customer.CompanyName), company);
        Set(nameof(Customer.Notes), notes);
        Set(nameof(Customer.IsActive), isActive);
        Set(nameof(Customer.CreatedAtUtc), now);
        Set(nameof(Customer.UpdatedAtUtc), now);

        context.Customers.Add(customer);
        await context.SaveChangesAsync(CancellationToken.None);

        return customer.Id;
    }

    private async Task<JsonElement> ListAsync(string query = "")
    {
        var response = await factory.CreateManagerClient().GetAsync($"/api/customers{query}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        return await BodyOf(response);
    }

    private static string Marker() => $"m{Guid.CreateVersion7():N}"[..12];

    // ── AC-1, AC-2 · the profile ────────────────────────────────────────────────────

    /// <summary>AC-1.</summary>
    [Fact]
    public async Task The_profile_returns_the_whole_record_including_a_version()
    {
        var marker = Marker();
        var id = await SeedAsync(
            $"علي الأحمد {marker}",
            email: $"{marker}@example.com",
            company: "شركة الرياض",
            notes: "Prefers to be called in the morning.");

        var response = await factory.CreateManagerClient().GetAsync($"/api/customers/{id}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await BodyOf(response);

        body.GetProperty("fullName").GetString().Should().Be($"علي الأحمد {marker}",
            "nvarchar end to end — varchar would return ???? and read as a font bug");
        body.GetProperty("email").GetString().Should().Be($"{marker}@example.com");
        body.GetProperty("companyName").GetString().Should().Be("شركة الرياض");
        body.GetProperty("notes").GetString().Should().Be("Prefers to be called in the morning.");
        body.GetProperty("isActive").GetBoolean().Should().BeTrue();
        body.GetProperty("version").GetString().Should().NotBeNullOrWhiteSpace(
            "the base64 rowversion `017` will send back as expectedVersion");
    }

    /// <summary>AC-2.</summary>
    [Fact]
    public async Task An_unknown_id_is_not_found_and_names_nothing()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync($"/api/customers/{Guid.CreateVersion7()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var problem = await BodyOf(response);
        problem.GetProperty("type").GetString().Should().Be("https://wasl.local/errors/not-found");
        problem.GetProperty("detail").GetString().Should().Be("No customer was found with that id.",
            "a message, not a resource key — and it names no id");
    }

    /// <summary>
    /// AC-3 — **knowingly unmet**, and the test asserts what the code does.
    /// </summary>
    /// <remarks>
    /// The contract and AC-3 both say a malformed id is `400` `errors/validation`. The observed
    /// behaviour is `404`, because the `{id:guid}` route constraint fails the match before any
    /// action runs and nothing `002` built sees the request.
    /// <br/>
    /// Q-A ruled: keep the constraint. Dropping it here would buy AC-3 and cost something worse —
    /// two resources in one API answering the same malformed input differently, so a client cannot
    /// write one handler. `002b` owns enveloping the statuses the framework short-circuits and
    /// fixes every route at once. `011` met the identical conflict and made the identical choice.
    /// <br/>
    /// This test goes red the day `002b` lands, at the line that says why.
    /// </remarks>
    [Fact]
    public async Task A_malformed_id_returns_404_which_the_contract_says_should_be_400()
    {
        var response = await factory.CreateManagerClient().GetAsync("/api/customers/not-a-guid");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "002b owns the fix. Asserting the contract's 400 here would fail today for a reason "
            + "unconnected to this feature");
    }

    /// <summary>Q-3 — the profile shows an inactive customer; the list does not.</summary>
    [Fact]
    public async Task The_profile_shows_an_inactive_customer_and_the_list_hides_it()
    {
        var marker = Marker();
        var id = await SeedAsync($"Retired Customer {marker}", isActive: false);

        var profile = await factory.CreateManagerClient().GetAsync($"/api/customers/{id}");

        profile.StatusCode.Should().Be(HttpStatusCode.OK,
            "a ticket may reference a deactivated customer, and a 404 would break that link");
        (await BodyOf(profile)).GetProperty("isActive").GetBoolean().Should().BeFalse();

        var list = await ListAsync($"?search={marker}");

        list.GetProperty("totalCount").GetInt32().Should().Be(0, "Q-1 — the list filters IsActive");
    }

    // ── AC-4 … AC-10 · the envelope, paging and search ──────────────────────────────

    /// <summary>AC-4, AC-5.</summary>
    [Fact]
    public async Task The_list_returns_the_frozen_envelope_with_the_default_page_size()
    {
        await SeedAsync($"Envelope {Marker()}");

        var body = await ListAsync();

        body.GetProperty("page").GetInt32().Should().Be(1);
        body.GetProperty("pageSize").GetInt32().Should().Be(20, "010's frozen default");
        body.TryGetProperty("totalCount", out _).Should().BeTrue();
        body.TryGetProperty("totalPages", out _).Should().BeTrue();
        body.GetProperty("items").ValueKind.Should().Be(JsonValueKind.Array);
    }

    /// <summary>AC-5, AC-6 — BR-7.2's clamping, on every path.</summary>
    [Theory]
    [InlineData("?pageSize=500", 100)]
    [InlineData("?pageSize=0", 20)]
    [InlineData("?pageSize=-3", 20)]
    public async Task The_page_size_is_clamped(string query, int expected)
    {
        (await ListAsync(query)).GetProperty("pageSize").GetInt32().Should().Be(expected);
    }

    [Theory]
    [InlineData("?page=0")]
    [InlineData("?page=-9")]
    public async Task The_page_is_clamped_up_to_one(string query)
    {
        (await ListAsync(query)).GetProperty("page").GetInt32().Should().Be(1);
    }

    /// <summary>
    /// AC-7 — all three columns, case-insensitively.
    /// </summary>
    /// <remarks>
    /// <b>The searchable value is a fresh <c>Guid</c> per case, not a slice of one.</b> The first
    /// version took <c>marker[..7]</c> for the phone number, and the test failed with
    /// <c>found 2</c>: <c>Guid.CreateVersion7()</c> leads with a timestamp, so two markers minted
    /// milliseconds apart share their leading hex digits, and the seven-character prefix matched
    /// the other row seeded by the same test. A test-data collision rather than a product defect —
    /// and a reminder that a time-ordered id is a poor source of a unique <i>prefix</i>.
    /// </remarks>
    [Theory]
    [InlineData("name")]
    [InlineData("email")]
    [InlineData("phone")]
    public async Task Search_matches_name_email_and_phone(string field)
    {
        // Digits only, and long enough to be unique on its own — a phone number cannot hold hex.
        var digits = Random.Shared.NextInt64(100_000_000, 999_999_999).ToString();
        var marker = Marker();

        await SeedAsync(
            field == "name" ? $"Searchable {marker.ToUpperInvariant()}" : "Searchable other",
            email: field == "email" ? $"{marker.ToUpperInvariant()}@example.com" : null,
            phone: field == "phone" ? $"+96650{digits}" : "+966500000001");

        var term = field == "phone" ? digits : marker;

        var body = await ListAsync($"?search={term}");

        body.GetProperty("totalCount").GetInt32().Should().Be(1,
            $"the {field} column must match a lower-case term against an upper-case value — "
            + "case-insensitivity comes from the column's collation (AC-16)");
    }

    /// <summary>
    /// AC-8 — and it pins the provider's behaviour rather than our own escaping.
    /// </summary>
    /// <remarks>
    /// EF Core translates <c>Contains</c> to <c>LIKE @p ESCAPE N'\'</c> and escapes the term
    /// itself — read from the command log of a running instance. So there is no hand-rolled
    /// escaper, and this test exists to catch the day that changes: a provider that stopped
    /// escaping would make every one of these terms match everything.
    /// </remarks>
    [Theory]
    [InlineData("100%")]
    [InlineData("%")]
    [InlineData("_")]
    [InlineData("[a-z]")]
    [InlineData("O'Brien")]
    public async Task A_pattern_character_is_matched_literally(string term)
    {
        var marker = Marker();
        await SeedAsync($"Literal {marker}");

        var body = await ListAsync($"?search={Uri.EscapeDataString(term)}");

        body.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("fullName").GetString())
            .Should().NotContain($"Literal {marker}",
                $"'{term}' must be literal text. If it matched, the term reached LIKE unescaped "
                + "and every search is now a wildcard");
    }

    /// <summary>AC-7's edge case — a whitespace-only term is no search at all.</summary>
    [Fact]
    public async Task A_whitespace_only_search_is_treated_as_absent()
    {
        await SeedAsync($"Whitespace {Marker()}");

        var blank = await ListAsync("?search=%20%20");
        var absent = await ListAsync();

        blank.GetProperty("totalCount").GetInt32()
            .Should().Be(absent.GetProperty("totalCount").GetInt32(),
                "trimmed to empty means no filter — not a match-nothing filter");
    }

    /// <summary>AC-9.</summary>
    [Fact]
    public async Task No_results_is_an_empty_array_and_a_zero_total()
    {
        var body = await ListAsync($"?search=nothing-matches-{Marker()}");

        body.GetProperty("items").EnumerateArray().Should().BeEmpty("never null — BR-7.6");
        body.GetProperty("totalCount").GetInt32().Should().Be(0);
        body.GetProperty("totalPages").GetInt32().Should().Be(0);
    }

    /// <summary>AC-10 — a page past the end still reports the real total.</summary>
    [Fact]
    public async Task A_page_beyond_the_last_is_empty_with_the_correct_total()
    {
        var marker = Marker();
        await SeedAsync($"Beyond A {marker}");
        await SeedAsync($"Beyond B {marker}");

        var body = await ListAsync($"?search={marker}&page=9&pageSize=1");

        body.GetProperty("items").EnumerateArray().Should().BeEmpty();
        body.GetProperty("totalCount").GetInt32().Should().Be(2,
            "the total is counted before paging, so the client can correct itself rather than "
            + "concluding the search found nothing");
        body.GetProperty("totalPages").GetInt32().Should().Be(2);
    }

    // ── AC-11 · the criterion nothing in this codebase could assert until now ────────

    /// <summary>
    /// AC-11 — measured, with the counter built in this feature.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Twenty rows on a page must cost the same number of round trips as one. The count is
    /// asserted as a small constant rather than an exact number, because the request also
    /// authenticates — what matters is that it does not <b>grow with the row count</b>, which is
    /// why the same probe runs over one row and over twelve.
    /// </para>
    /// <para>
    /// <c>probe.Count</c> throws if it observed nothing, so an unattached interceptor fails loudly
    /// instead of satisfying every "no more than N" assertion with zero.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task The_list_costs_the_same_number_of_queries_whatever_the_row_count()
    {
        var one = Marker();
        await SeedAsync($"Counted {one}");

        var client = factory.CreateManagerClient();

        var probeOne = factory.CountQueries();
        await client.GetAsync($"/api/customers?search={one}");
        var withOneRow = probeOne.Count;

        var many = Marker();
        for (var index = 0; index < 12; index++)
        {
            await SeedAsync($"Counted {many} {index}");
        }

        var probeMany = factory.CountQueries();
        var response = await client.GetAsync($"/api/customers?search={many}&pageSize=20");
        var withTwelveRows = probeMany.Count;

        (await BodyOf(response)).GetProperty("items").EnumerateArray().Should().HaveCount(12,
            "the page really did return twelve rows — otherwise the count below is measuring "
            + "an empty result and proving nothing");

        withTwelveRows.Should().Be(withOneRow,
            "the query count must not grow with the number of rows. One SELECT for the count and "
            + "one for the page, with the name projected in the same statement — twelve rows "
            + $"cost {withTwelveRows} and one row cost {withOneRow}");

        withOneRow.Should().BeLessThanOrEqualTo(3,
            "a count, a page, and at most one more. A larger constant means something else is "
            + "querying per request and should be named");
    }

    // ── AC-15 · a total order ───────────────────────────────────────────────────────

    /// <summary>
    /// AC-15 — two customers sharing a name, traversed a page at a time.
    /// </summary>
    /// <remarks>
    /// <c>013` proved this class of guard is worth having by deleting a tie-break and watching a
    /// test go red; `010` could not and recorded its own as unproven. Here the tie is created
    /// deliberately: identical <c>FullName</c>, page size 1, so the <c>Id</c> tiebreaker is the
    /// only thing separating them.
    /// </remarks>
    [Fact]
    public async Task Two_customers_sharing_a_name_are_each_reachable_exactly_once()
    {
        var marker = Marker();
        var name = $"أحمد محمد {marker}";

        var first = await SeedAsync(name, phone: "+966500000101");
        var second = await SeedAsync(name, phone: "+966500000102");

        var seen = new List<Guid>();

        for (var page = 1; page <= 2; page++)
        {
            var body = await ListAsync($"?search={marker}&page={page}&pageSize=1");

            seen.AddRange(body.GetProperty("items").EnumerateArray()
                .Select(item => item.GetProperty("id").GetGuid()));
        }

        seen.Should().BeEquivalentTo([first, second],
            "each exactly once across a full traversal. Without the Id tiebreaker SQL Server "
            + "promises nothing for the tie, so one row can appear twice and another not at all");
    }

    // ── AC-16 · the collation, read back from the database ──────────────────────────

    /// <summary>
    /// AC-16 — asserted from <c>INFORMATION_SCHEMA</c>, not from the configuration that set it.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This criterion exists because two thirds of the search surface was case-insensitive by
    /// luck.</b> `001` gave <c>Email</c> an explicit CI collation and left <c>FullName</c>,
    /// <c>PhoneE164</c> and <c>CompanyName</c> inheriting the database default. On a `_CS_AS`
    /// server — the default in several installers — searching <c>ahmed</c> would silently miss
    /// <c>Ahmed</c>: identical LINQ, no exception, a smaller result set.
    /// </para>
    /// <para>
    /// Read back from the database rather than asserted against the configuration, because the
    /// configuration is the thing under test. `004` AC-22 made the same choice for
    /// <c>filter_definition</c>.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Every_searched_column_carries_an_explicit_case_insensitive_collation()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await using var connection = new SqlConnection(context.Database.GetConnectionString());
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT COLUMN_NAME, COLLATION_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Customers'
              AND COLUMN_NAME IN ('FullName', 'Email', 'PhoneE164', 'CompanyName')
            """;

        var collations = new Dictionary<string, string?>(StringComparer.Ordinal);

        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                collations[reader.GetString(0)] = reader.IsDBNull(1) ? null : reader.GetString(1);
            }
        }

        collations.Should().HaveCount(4);

        foreach (var (column, collation) in collations)
        {
            collation.Should().Be("SQL_Latin1_General_CP1_CI_AS",
                $"{column} is searched by AC-7, so its case-insensitivity must be a property of "
                + "the schema and not of whichever collation the server happened to be installed "
                + "with");
        }
    }

    // ── AC-17 · the field set, over the raw text ────────────────────────────────────

    /// <summary>
    /// AC-17 — the contract's fields and no more, asserted over the raw response.
    /// </summary>
    /// <remarks>
    /// <b>Over the text, not over the deserialised type</b>, because a type describes what should
    /// be returned and this has to be about what was. The frontend's hand-written
    /// <c>CustomerListItem</c> already carries exactly these six fields, so widening the list
    /// silently gives a client something to start depending on.
    /// </remarks>
    [Fact]
    public async Task A_list_row_carries_the_contract_fields_and_nothing_else()
    {
        var marker = Marker();
        await SeedAsync(
            $"Narrow {marker}",
            email: $"{marker}@example.com",
            notes: "SENSITIVE-NOTE-THAT-MUST-NOT-APPEAR-ON-A-LIST");

        var response = await factory.CreateManagerClient()
            .GetAsync($"/api/customers?search={marker}");

        var raw = await response.Content.ReadAsStringAsync();
        var row = JsonDocument.Parse(raw).RootElement
            .GetProperty("items").EnumerateArray().Single();

        row.EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo(
                ["id", "fullName", "email", "phone", "companyName", "createdAtUtc"],
                "the frozen contract's field set, which the frontend has already built against");

        raw.Should().NotContain("SENSITIVE-NOTE",
            "2000 characters of free text on every row of every page, and it is not in the "
            + "contract — the projection never selects it, so no serializer can leak it");
        raw.Should().NotContain("rowVersion");
        raw.Should().NotContain("isActive", "every row is active; the list filters on it");
    }

    // ── AC-14 · authentication, and no audit row ───────────────────────────────────

    /// <summary>AC-14.</summary>
    [Fact]
    public async Task Both_endpoints_refuse_an_unauthenticated_caller()
    {
        (await factory.CreateClient().GetAsync("/api/customers"))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        (await factory.CreateClient().GetAsync($"/api/customers/{Guid.CreateVersion7()}"))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>A read writes no audit row. BR-9.1, BR-9.11.</summary>
    /// <remarks>
    /// Structural since `003` — the audit behaviour is constrained to
    /// <c>IAuditableCommand&lt;TResponse&gt;</c>, so a query cannot reach it. Asserted anyway,
    /// because it is one line and it is the kind of guarantee that quietly stops being true.
    /// Scoped by action name, never by counting the whole table.
    /// </remarks>
    [Fact]
    public async Task A_read_writes_no_audit_row()
    {
        var marker = Marker();
        var id = await SeedAsync($"Unaudited {marker}");

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var before = await context.AuditLog.CountAsync(entry => entry.Action.StartsWith("Customer"));

        await factory.CreateManagerClient().GetAsync($"/api/customers/{id}");
        await factory.CreateManagerClient().GetAsync($"/api/customers?search={marker}");

        (await context.AuditLog.CountAsync(entry => entry.Action.StartsWith("Customer")))
            .Should().Be(before, "a customer read is not Audit.Read — BR-9.11");
    }

    /// <summary>The defaults on the query agree with the shared `Paging` helper.</summary>
    /// <remarks>
    /// A record's parameter default must be a compile-time constant, so `Paging.DefaultPageSize`
    /// appears twice — in the record's signature and in the helper. One assertion keeps them from
    /// drifting, which is cheaper than a comment asking someone to remember.
    /// </remarks>
    [Fact]
    public void The_query_defaults_match_the_shared_paging_helper()
    {
        new GetCustomersQuery().PageSize.Should().Be(Paging.DefaultPageSize);
        new GetCustomersQuery(PageSize: 5000).EffectivePageSize.Should().Be(Paging.MaxPageSize);
        new GetCustomersQuery(Page: 0).EffectivePage.Should().Be(1);
    }
}
