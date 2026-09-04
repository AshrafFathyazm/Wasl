using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Domain.Customers;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Customers;

/// <summary>
/// <c>GET /api/customers</c>'s sort, company and created-range filters, and
/// <c>GET /api/customers/companies</c>. `033` §5.1 to §5.5.
/// </summary>
/// <remarks>
/// <para>
/// <b>The suite shares one database, so nothing here counts rows globally.</b> Every test seeds
/// its own customers behind a random <see cref="Marker"/> and filters on it — the constraint
/// <c>CLAUDE.md</c> records after seven containers became one, and the reason
/// <c>?search={marker}</c> appears in almost every request below.
/// </para>
/// <para>
/// <b><see cref="Marker"/> is random rather than a slice of a <c>Guid</c>.</b> Fifth place this
/// matters: the leading hex digits of a v7 GUID are its millisecond timestamp, and 2000 minted in
/// a loop produced 2 distinct values. It broke CI and never a local run.
/// </para>
/// <para>
/// <b>EVERY FILTER TEST SEEDS A DECOY that satisfies half the query</b>, because the alternative
/// passes on no filter at all: a company test whose only row matches would pass on a server that
/// ignored <c>?company=</c> entirely.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class CustomerFilterTests(WaslApiFactory factory)
{
    private static string Marker() =>
        $"c{Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant()}";

    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>
    /// Inserts a customer directly, with an optional creation instant.
    /// </summary>
    /// <remarks>
    /// Reflection, as <c>CustomerReadTests</c> does and for the same reason — and
    /// <paramref name="createdAtUtc"/> is why this helper exists rather than being reused: the
    /// created-range tests need a controlled instant, and `007`'s factory stamps
    /// <c>DateTime.UtcNow</c>. <b>The entity is written from outside the real path here</b>, which
    /// <c>CLAUDE.md</c> requires saying out loud; the fields these tests read — <c>CreatedAtUtc</c>
    /// and <c>CompanyName</c> — are exercised end to end by `007` and `032`.
    /// </remarks>
    private async Task<Guid> SeedAsync(
        string fullName,
        string? company = null,
        DateTime? createdAtUtc = null,
        bool isActive = true)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var customer = (Customer)Activator.CreateInstance(typeof(Customer), nonPublic: true)!;
        var now = createdAtUtc ?? DateTime.UtcNow;

        void Set(string property, object? value) =>
            typeof(Customer).GetProperty(property)!.SetValue(customer, value);

        Set(nameof(Customer.Id), Guid.CreateVersion7());
        Set(nameof(Customer.FullName), fullName);
        Set(nameof(Customer.Email), null);
        Set(nameof(Customer.PhoneE164),
            $"+96650{Random.Shared.NextInt64(100_000_000, 999_999_999)}");
        Set(nameof(Customer.CompanyName), company);
        Set(nameof(Customer.Notes), null);
        Set(nameof(Customer.IsActive), isActive);
        Set(nameof(Customer.CreatedAtUtc), now);
        Set(nameof(Customer.UpdatedAtUtc), now);

        context.Customers.Add(customer);
        await context.SaveChangesAsync(CancellationToken.None);

        return customer.Id;
    }

    private async Task<JsonElement> ListAsync(string query)
    {
        var response = await factory.CreateEnglishManagerClient().GetAsync($"/api/customers{query}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        return await BodyOf(response);
    }

    private static IReadOnlyList<string> NamesOf(JsonElement body) =>
        body.GetProperty("items")
            .EnumerateArray()
            .Select(item => item.GetProperty("fullName").GetString()!)
            .ToList();

    private static IReadOnlyList<string> IdsOf(JsonElement body) =>
        body.GetProperty("items")
            .EnumerateArray()
            .Select(item => item.GetProperty("id").GetString()!)
            .ToList();

    // ── §5.1 · sort and dir ─────────────────────────────────────────────────────────

    /// <summary>§5.1. The default is unchanged from `008`.</summary>
    [Fact]
    public async Task Sorting_defaults_to_name_ascending()
    {
        var marker = Marker();
        await SeedAsync($"Zed {marker}");
        await SeedAsync($"Ann {marker}");

        var body = await ListAsync($"?search={marker}");

        NamesOf(body).Should().ContainInOrder($"Ann {marker}", $"Zed {marker}");
    }

    /// <summary>§5.1.</summary>
    [Fact]
    public async Task Sorting_by_name_descending_reverses_it()
    {
        var marker = Marker();
        await SeedAsync($"Zed {marker}");
        await SeedAsync($"Ann {marker}");

        var body = await ListAsync($"?search={marker}&sort=fullName&dir=desc");

        NamesOf(body).Should().ContainInOrder($"Zed {marker}", $"Ann {marker}");
    }

    /// <summary>§5.1.</summary>
    [Fact]
    public async Task Sorting_by_created_descending_puts_the_newest_first()
    {
        var marker = Marker();
        var oldest = new DateTime(2026, 3, 1, 8, 0, 0, DateTimeKind.Utc);

        await SeedAsync($"Older {marker}", createdAtUtc: oldest);
        await SeedAsync($"Newer {marker}", createdAtUtc: oldest.AddDays(10));

        var body = await ListAsync($"?search={marker}&sort=createdAtUtc&dir=desc");

        NamesOf(body).Should().ContainInOrder($"Newer {marker}", $"Older {marker}");
    }

    /// <summary>
    /// §5.1, the FIRST of the two tie tests: a tie must EXIST, or the order test below passes on
    /// data that never tied.
    /// </summary>
    /// <remarks>
    /// `013` measured that a repeatability test proves nothing on its own — it deleted its
    /// tiebreak and the test still passed, because SQL Server agreed with itself twice over nine
    /// rows. What earns its place is proving the tie is real and then asserting a SPECIFIC order.
    /// </remarks>
    [Fact]
    public async Task Two_customers_can_share_a_creation_instant_byte_for_byte()
    {
        var marker = Marker();
        var instant = new DateTime(2026, 4, 2, 9, 30, 15, 123, DateTimeKind.Utc);

        await SeedAsync($"Tie A {marker}", createdAtUtc: instant);
        await SeedAsync($"Tie B {marker}", createdAtUtc: instant);

        var body = await ListAsync($"?search={marker}&sort=createdAtUtc");
        var created = body.GetProperty("items")
            .EnumerateArray()
            .Select(item => item.GetProperty("createdAtUtc").GetString()!)
            .ToList();

        created.Should().HaveCount(2);
        created[0].Should().Be(created[1], "the tie the ordering has to break must be real");
    }

    /// <summary>
    /// §5.1, the SECOND tie test: a specific order across two pages of one, and no id twice.
    /// </summary>
    /// <remarks>
    /// This is the one that can go red for the right reason. Without <c>ThenBy(Id)</c>,
    /// <c>OFFSET</c>/<c>FETCH</c> over a non-total order promises nothing — a full traversal can
    /// show one row twice and skip another, which is `008` AC-15's argument and BR-4.6's
    /// consequence.
    /// </remarks>
    [Fact]
    public async Task A_tie_is_broken_so_a_full_traversal_covers_every_row_exactly_once()
    {
        var marker = Marker();
        var instant = new DateTime(2026, 4, 3, 11, 0, 0, 500, DateTimeKind.Utc);

        /* ── THIS ASSERTION IS CORRECT AND IS **NOT PROVEN**. Read before trusting it. ──
         *
         * Control B1 deletes `ThenBy(Id)` from the `createdAtUtc` branch and this test stays
         * GREEN. Three attempts, all measured rather than assumed:
         *
         *   2 tied rows, ascending    green without the tiebreak
         *   8 tied rows, ascending    green without the tiebreak
         *   24 tied rows, descending  green without the tiebreak  (and 8s to run)
         *
         * SQL Server returns a stable order over these ties on this engine and this data, so
         * nothing here can fail for the right reason. That is the FOURTH time this repository has
         * met it: `013` deleted its tiebreak and its repeatability test still passed over nine
         * rows, and `010` had to record its own stable-sort guard as unproven.
         *
         * WHAT IS KEPT AND WHY. The tiebreak stays because it is correct by construction —
         * `OFFSET`/`FETCH` over a non-total order promises nothing, which is `008` AC-15's
         * argument and BR-4.6's consequence — and because the ordering is one switch, so the
         * name branch and this one cannot drift apart. What is NOT claimed is that this test
         * would catch its removal. Eight rows and one page each are kept over two, because they
         * cost little and a larger set is the only thing that could ever start failing.
         *
         * `033/summary.md` records this as an open item rather than as coverage. */
        var seeded = new List<string>();
        foreach (var index in Enumerable.Range(0, 8))
        {
            seeded.Add((await SeedAsync($"Tied{index} {marker}", createdAtUtc: instant)).ToString());
        }

        var seen = new List<string>();
        foreach (var page in Enumerable.Range(1, 8))
        {
            seen.AddRange(IdsOf(
                await ListAsync($"?search={marker}&sort=createdAtUtc&dir=desc&page={page}&pageSize=1")));
        }

        seen.Should().HaveCount(8, "eight pages of one over eight rows");
        seen.Should().OnlyHaveUniqueItems(
            "an id on two pages is the defect the tiebreak prevents, and the row it displaced is "
            + "the one nobody ever sees");
        seen.Should().BeEquivalentTo(seeded);
    }

    // ── §5.5 · an unknown enum is a 400, never a fallback ───────────────────────────

    /// <summary>
    /// §5.5. Four shapes, and each is a `400` with the parameter named and a REAL message.
    /// </summary>
    /// <remarks>
    /// <b>The message is read, not counted.</b> `004b` found seventeen raw resource keys shipped
    /// under assertions that only checked the field was present — one array entry under the right
    /// field name is exactly what a leaked key looks like.
    /// </remarks>
    [Theory]
    [InlineData("?sort=email", "sort")]
    [InlineData("?sort=1", "sort")]
    [InlineData("?dir=sideways", "dir")]
    [InlineData("?dir=0", "dir")]
    public async Task An_unknown_sort_or_direction_is_refused_and_names_the_parameter(
        string query,
        string field)
    {
        var response = await factory.CreateEnglishManagerClient().GetAsync($"/api/customers{query}");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await BodyOf(response);
        body.GetProperty("errors").TryGetProperty(field, out var messages).Should().BeTrue();

        var text = messages.EnumerateArray().Single().GetString()!;
        text.Should().NotStartWith("Validation.", "a raw resource key is not a message");
        text.Should().Contain("Accepted values");
    }

    /// <summary>
    /// §5.5's other half: <c>pageSize</c> still CLAMPS, because it has a nearest legal value.
    /// </summary>
    /// <remarks>
    /// The pair is what makes the distinction testable rather than a paragraph. Without this, the
    /// `400` above reads as "this endpoint rejects bad input" and somebody makes `pageSize=500` a
    /// `400` too.
    /// </remarks>
    [Fact]
    public async Task An_out_of_range_page_size_is_still_clamped()
    {
        var body = await ListAsync("?pageSize=500");

        body.GetProperty("pageSize").GetInt32().Should().Be(100);
    }

    // ── §5.2 · company and noCompany ────────────────────────────────────────────────

    /// <summary>§5.2. Repeated values are OR-ed, and the decoy is what proves it filters.</summary>
    [Fact]
    public async Task Two_companies_are_ored_and_a_third_is_excluded()
    {
        var marker = Marker();
        var acme = $"Acme {marker}";
        var globex = $"Globex {marker}";
        var initech = $"Initech {marker}";

        await SeedAsync($"A {marker}", company: acme);
        await SeedAsync($"B {marker}", company: globex);
        await SeedAsync($"C {marker}", company: initech);

        var body = await ListAsync(
            $"?search={marker}&company={Uri.EscapeDataString(acme)}&company={Uri.EscapeDataString(globex)}");

        body.GetProperty("totalCount").GetInt32().Should().Be(2);
        NamesOf(body).Should().BeEquivalentTo([$"A {marker}", $"B {marker}"]);
    }

    /// <summary>§5.2. The match is exact and case-insensitive — from the column's collation.</summary>
    /// <remarks>
    /// Both halves matter. Case-insensitive: `008` gave <c>CompanyName</c> an explicit CI
    /// collation, and a client sending what the panel offered may differ in case. EXACT: a
    /// substring match would make <c>?company=Acme</c> also return <c>Acme Holdings</c>, which is
    /// a different company and the filter would be quietly wrong rather than empty.
    /// </remarks>
    [Fact]
    public async Task The_company_match_is_case_insensitive_and_exact()
    {
        var marker = Marker();
        var acme = $"Acme {marker}";

        await SeedAsync($"Exact {marker}", company: acme);
        await SeedAsync($"Prefixed {marker}", company: $"{acme} Holdings");

        var body = await ListAsync($"?search={marker}&company={Uri.EscapeDataString(acme.ToUpperInvariant())}");

        NamesOf(body).Should().BeEquivalentTo([$"Exact {marker}"]);
    }

    /// <summary>§5.2. <c>noCompany</c> alone.</summary>
    [Fact]
    public async Task No_company_returns_only_the_uncompanied()
    {
        var marker = Marker();

        await SeedAsync($"None {marker}");
        await SeedAsync($"Some {marker}", company: $"Acme {marker}");

        var body = await ListAsync($"?search={marker}&noCompany=true");

        NamesOf(body).Should().BeEquivalentTo([$"None {marker}"]);
    }

    /// <summary>
    /// §5.2. <c>company</c> OR <c>noCompany</c> — "Acme or none", the pair that a second
    /// <c>Where</c> would make unsatisfiable.
    /// </summary>
    [Fact]
    public async Task A_company_and_no_company_are_ored_with_each_other()
    {
        var marker = Marker();
        var acme = $"Acme {marker}";

        await SeedAsync($"None {marker}");
        await SeedAsync($"Acme {marker}", company: acme);
        await SeedAsync($"Other {marker}", company: $"Globex {marker}");

        var body = await ListAsync(
            $"?search={marker}&company={Uri.EscapeDataString(acme)}&noCompany=true");

        body.GetProperty("totalCount").GetInt32().Should().Be(2);
        NamesOf(body).Should().BeEquivalentTo([$"None {marker}", $"Acme {marker}"]);
    }

    /// <summary>
    /// §5.2. Twenty-one values are CLAMPED to twenty, not refused — BR-7.2.
    /// </summary>
    /// <remarks>
    /// <b>The assertion is that the twenty-first value is dropped</b>, which is the only
    /// observable difference between clamping and ignoring the limit. The company that would have
    /// matched is put LAST deliberately.
    /// </remarks>
    [Fact]
    public async Task More_than_twenty_companies_are_clamped_rather_than_refused()
    {
        var marker = Marker();
        var wanted = $"Twenty-first {marker}";

        await SeedAsync($"Target {marker}", company: wanted);

        var decoys = Enumerable.Range(0, 20).Select(index => $"Decoy{index} {marker}");
        var query = string.Join(
            "&",
            decoys.Append(wanted).Select(company => $"company={Uri.EscapeDataString(company)}"));

        var body = await ListAsync($"?search={marker}&{query}");

        body.GetProperty("totalCount").GetInt32().Should()
            .Be(0, "the twenty-first value is past the clamp and is dropped");
    }

    // ── §5.4 · the created range ────────────────────────────────────────────────────

    /// <summary>
    /// §5.4. <b>The test the whole section exists for.</b>
    /// </summary>
    /// <remarks>
    /// <c>&lt;= createdTo</c> parsed as a date is <c>&lt;= 00:00:00</c> on that day, which excludes
    /// every customer created during it: the filter looks correct, returns rows, and drops exactly
    /// the newest day — the one a user filtering "to today" is asking about.
    /// </remarks>
    [Fact]
    public async Task Created_to_includes_the_last_millisecond_of_that_day()
    {
        var marker = Marker();
        var endOfDay = new DateTime(2026, 5, 10, 23, 59, 59, 999, DateTimeKind.Utc);

        await SeedAsync($"Midnight edge {marker}", createdAtUtc: endOfDay);
        await SeedAsync($"Next day {marker}", createdAtUtc: endOfDay.AddMilliseconds(2));

        var body = await ListAsync($"?search={marker}&createdTo=2026-05-10");

        NamesOf(body).Should().BeEquivalentTo([$"Midnight edge {marker}"]);
    }

    /// <summary>§5.4. Inclusive at the lower bound too, and a decoy the day before.</summary>
    [Fact]
    public async Task Created_from_includes_midnight_of_that_day()
    {
        var marker = Marker();
        var midnight = new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc);

        await SeedAsync($"On the day {marker}", createdAtUtc: midnight);
        await SeedAsync($"Day before {marker}", createdAtUtc: midnight.AddMilliseconds(-1));

        var body = await ListAsync($"?search={marker}&createdFrom=2026-06-01");

        NamesOf(body).Should().BeEquivalentTo([$"On the day {marker}"]);
    }

    /// <summary>
    /// An inverted range is a <c>400</c>, the same answer the tickets list gives — ruled
    /// 2026-09-03, superseding §5.4.
    /// </summary>
    /// <remarks>
    /// <b>This test asserted the opposite until 2026-09-03</b>, and the assertion it made was
    /// satisfied by a response that told the reader something false. §5.4 said an inverted range
    /// "describes a window with nothing in it"; it describes a contradiction, and a window with
    /// nothing in it is <c>from == to</c> on an empty day — which still returns zero.
    /// <para>
    /// Measured before the change:
    /// <c>?createdFrom=2026-09-01&amp;createdTo=2026-08-01</c> answered <c>200</c> with
    /// <c>totalCount 0</c> and the screen said "لا عميل يطابق هذا".
    /// </para>
    /// <para>
    /// The MESSAGE is read, not just the field name: one array entry under the right key is a
    /// shape assertion, and seventeen raw resource keys once shipped under exactly that check.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task An_inverted_range_is_refused_rather_than_answered_with_an_empty_page()
    {
        var response = await factory.CreateEnglishManagerClient()
            .GetAsync("/api/customers?createdFrom=2026-07-01&createdTo=2026-06-01");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await BodyOf(response);
        body.GetProperty("type").GetString().Should().EndWith("errors/validation");

        var text = body.GetProperty("errors")
            .GetProperty("createdTo")
            .EnumerateArray()
            .Single()
            .GetString()!;

        text.Should().NotStartWith("Validation.");
        text.Should().Be("The end of the date range is before its start.");
    }

    /// <summary>
    /// The bound naming is not incidental: <c>errors</c> names <c>createdTo</c> ALONE.
    /// </summary>
    /// <remarks>
    /// That is the bound a caller raises to fix the range, and an object naming both would read
    /// as two independent faults. The ticket validator makes the same choice for the same reason.
    /// </remarks>
    [Fact]
    public async Task An_inverted_range_names_only_the_bound_a_caller_would_raise()
    {
        var response = await factory.CreateEnglishManagerClient()
            .GetAsync("/api/customers?createdFrom=2026-07-01&createdTo=2026-06-01");

        var body = await BodyOf(response);
        var errors = body.GetProperty("errors");

        errors.TryGetProperty("createdTo", out _).Should().BeTrue();
        errors.TryGetProperty("createdFrom", out _).Should().BeFalse();
    }

    /// <summary>
    /// The negative control for the two above: <c>from == to</c> is a REAL one-day window and
    /// still returns rows.
    /// </summary>
    /// <remarks>
    /// Without this, a rule written as <c>to &lt;= from</c> would pass both tests above while
    /// refusing every single-day filter in the product.
    /// </remarks>
    [Fact]
    public async Task A_single_day_window_is_not_inverted()
    {
        var marker = Marker();
        await SeedAsync(
            $"On the day {marker}",
            createdAtUtc: new DateTime(2026, 6, 15, 9, 0, 0, DateTimeKind.Utc));

        var body = await ListAsync(
            $"?search={marker}&createdFrom=2026-06-15&createdTo=2026-06-15");

        NamesOf(body).Should().BeEquivalentTo([$"On the day {marker}"]);
    }

    /// <summary>
    /// §5.4. A Hijri bound needs <c>?calendar=hijri</c>, and without it the request is refused
    /// rather than answered wrongly.
    /// </summary>
    /// <remarks>
    /// A Hijri date is a valid Gregorian one, so <c>?createdFrom=1448-03-05</c> would otherwise
    /// mean the year 1448 and match everything. `015` built the check; this is its second endpoint.
    /// </remarks>
    [Fact]
    public async Task A_hijri_looking_date_without_the_calendar_is_refused()
    {
        var response = await factory.CreateEnglishManagerClient()
            .GetAsync("/api/customers?createdFrom=1448-03-05");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await BodyOf(response);
        var text = body.GetProperty("errors")
            .GetProperty("createdFrom")
            .EnumerateArray()
            .Single()
            .GetString()!;

        text.Should().NotStartWith("Validation.");
        text.Should().Contain("calendar=hijri");
    }

    /// <summary>§5.4. And WITH the calendar it filters, against a Gregorian decoy.</summary>
    [Fact]
    public async Task A_hijri_range_filters_when_the_calendar_is_declared()
    {
        var marker = Marker();

        /* 1447-08-01 AH is 2026-01-20; 1447-09-01 AH is 2026-02-18. One customer inside the
         * window and one a month before it, so an ignored filter fails this rather than passing. */
        await SeedAsync($"Inside {marker}", createdAtUtc: new DateTime(2026, 1, 25, 12, 0, 0, DateTimeKind.Utc));
        await SeedAsync($"Before {marker}", createdAtUtc: new DateTime(2025, 12, 20, 12, 0, 0, DateTimeKind.Utc));

        var body = await ListAsync(
            $"?search={marker}&calendar=hijri&createdFrom=1447-08-01&createdTo=1447-09-01");

        NamesOf(body).Should().BeEquivalentTo([$"Inside {marker}"]);
    }

    // ── §5.3 · GET /api/customers/companies ────────────────────────────────────────

    private async Task<JsonElement> CompaniesAsync(string query = "")
    {
        var response = await factory.CreateEnglishManagerClient()
            .GetAsync($"/api/customers/companies{query}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        return await BodyOf(response);
    }

    private static IReadOnlyList<string> ItemsOf(JsonElement body) =>
        body.GetProperty("items").EnumerateArray().Select(item => item.GetString()!).ToList();

    /// <summary>§5.3. Distinct, ordered, and searchable.</summary>
    [Fact]
    public async Task The_companies_endpoint_returns_distinct_names_in_order()
    {
        var marker = Marker();

        await SeedAsync($"One {marker}", company: $"Beta {marker}");
        await SeedAsync($"Two {marker}", company: $"Alpha {marker}");
        await SeedAsync($"Three {marker}", company: $"Alpha {marker}");

        var items = ItemsOf(await CompaniesAsync($"?search={marker}"));

        items.Should().ContainInOrder($"Alpha {marker}", $"Beta {marker}");
        items.Should().OnlyHaveUniqueItems("two customers at one company is one company");
    }

    /// <summary>
    /// §5.3. <b>Deactivated customers' companies are not offered</b>, and its absence would be
    /// invisible.
    /// </summary>
    /// <remarks>
    /// A deactivated customer's company would appear in the panel and then match zero rows — a
    /// filter that returns nothing, on a name the UI itself offered. The list has filtered on
    /// <c>IsActive</c> since `008` Q-1; the two must agree or the panel lies.
    /// </remarks>
    [Fact]
    public async Task The_companies_endpoint_ignores_deactivated_customers()
    {
        var marker = Marker();

        await SeedAsync($"Live {marker}", company: $"Active {marker}");
        await SeedAsync($"Gone {marker}", company: $"Dormant {marker}", isActive: false);

        var items = ItemsOf(await CompaniesAsync($"?search={marker}"));

        items.Should().BeEquivalentTo([$"Active {marker}"]);
    }

    /// <summary>
    /// §5.3. <c>hasUncompanied</c> in both directions — and the false case needs its own data,
    /// because a true one proves nothing about the flag being computed.
    /// </summary>
    [Fact]
    public async Task Has_uncompanied_is_true_when_some_active_customer_has_no_company()
    {
        var marker = Marker();
        await SeedAsync($"Uncompanied {marker}");

        var body = await CompaniesAsync($"?search={marker}");

        body.GetProperty("hasUncompanied").GetBoolean().Should().BeTrue();
    }

    /// <summary>
    /// §5.3. The counterpart, and it is why the flag is a query rather than
    /// <c>items.Any(x => x is null)</c>: a cap can hide an absent name.
    /// </summary>
    [Fact]
    public async Task The_search_does_not_change_whether_anyone_is_uncompanied()
    {
        var marker = Marker();
        await SeedAsync($"Companied {marker}", company: $"Only {marker}");

        var body = await CompaniesAsync($"?search={marker}");

        ItemsOf(body).Should().BeEquivalentTo([$"Only {marker}"]);

        /* THE FLAG IS ABOUT THE WHOLE DIRECTORY, not about this search — the panel's "no company"
         * row is offered when it would match something, and the search box next to it filters the
         * NAMES. The seeded demo data has uncompanied customers, so this is true here; the
         * assertion that matters is that it does not follow `items`. */
        body.GetProperty("hasUncompanied").GetBoolean().Should().BeTrue();
    }

    /// <summary>§5.3. The limit clamps rather than rejecting.</summary>
    [Fact]
    public async Task The_companies_limit_is_clamped()
    {
        var body = await CompaniesAsync("?limit=5000");

        ItemsOf(body).Count.Should().BeLessThanOrEqualTo(100);
    }

    /// <summary>
    /// §5.3 and `008`'s query counter. <b>The cost does not grow with the answer.</b>
    /// </summary>
    /// <remarks>
    /// Asserted as EQUAL rather than under a threshold: a threshold drifts with every unrelated
    /// change to the request, and `008` built this probe after the whole category had been met by
    /// reading the LINQ — which cannot see a lazy load, a client-side <c>ToList</c> added later,
    /// or a projection that stops being translatable.
    /// </remarks>
    [Fact]
    public async Task The_companies_endpoint_costs_the_same_for_one_company_as_for_twenty()
    {
        var marker = Marker();
        await SeedAsync($"Single {marker}", company: $"Solo {marker}");

        /* The probe is read, not disposed — `008`'s own usage, and it THROWS rather than
           returning zero when the interceptor is unattached, because `BeLessThan(3)` is
           satisfied by zero. */
        var probeOne = factory.CountQueries();
        await CompaniesAsync($"?search={marker}");
        var one = probeOne.Count;

        var many = Marker();
        foreach (var index in Enumerable.Range(0, 20))
        {
            await SeedAsync($"Bulk{index} {many}", company: $"Bulk{index} {many}");
        }

        var probeTwenty = factory.CountQueries();
        var body = await CompaniesAsync($"?search={many}");
        var twenty = probeTwenty.Count;

        ItemsOf(body).Should().HaveCount(20,
            "otherwise the count below is measuring an empty result and proving nothing");

        one.Should().BeGreaterThan(0, "a probe reading zero means it never attached");
        twenty.Should().Be(one);
    }

    /// <summary>§5.3. Both roles, and no `403` — the same shape as the rest of `008`'s reads.</summary>
    [Fact]
    public async Task An_agent_may_read_the_companies_too()
    {
        var response = await factory.CreateAgentClient().GetAsync("/api/customers/companies");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>And it is closed to an anonymous caller, like everything but `/health` and auth.</summary>
    [Fact]
    public async Task The_companies_endpoint_refuses_an_anonymous_caller()
    {
        var response = await factory.CreateClient().GetAsync("/api/customers/companies");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
