using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Infrastructure.Persistence;
using Wasl.Infrastructure.Persistence.Seed;

namespace Wasl.Api.IntegrationTests.Tickets;

/// <summary>
/// <c>GET /api/tickets</c> filters and search. `015` AC-4 to AC-10, AC-24.
/// </summary>
/// <remarks>
/// <para>
/// <b>The suite shares one database, so no assertion here counts rows globally.</b> Every test
/// seeds its own customer and asserts over ITS OWN ids — the constraint `CLAUDE.md` records after
/// seven containers became one. The search tests need a term that cannot collide with another
/// test's data, and they use <see cref="Marker"/> for it.
/// </para>
/// <para>
/// <b><see cref="Marker"/> is random, not a slice of a <c>Guid</c>.</b> This is the fourth place
/// that matters: `008` used a Guid prefix as a search term and matched the wrong row, `007` used
/// one as an email local-part and collided on a unique index, and `008`'s own test file was still
/// doing it on 2026-08-31 — 2000 markers minted in a loop produced 2 distinct values, because the
/// leading hex digits of a v7 GUID are its millisecond timestamp. That one broke CI and never a
/// local run.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class TicketFilterTests(WaslApiFactory factory)
{
    private static string Marker() =>
        $"f{Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant()}";

    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<Guid> CreateAsync(
        Guid customerId,
        string subject,
        string category = "Account",
        string channel = "LiveChat",
        string priority = "Normal")
    {
        var response = await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject,
            description = "description",
            category,
            channel,
            priority,
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await BodyOf(response)).GetProperty("id").GetGuid();
    }

    private async Task<List<Guid>> IdsOfAsync(string query)
    {
        var body = await BodyOf(await factory.CreateManagerClient().GetAsync($"/api/tickets?{query}"));

        return body.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid())
            .ToList();
    }

    private async Task<Guid> UserIdAsync(string email)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.SupportUsers.Where(user => user.Email == email)
            .Select(user => user.Id).SingleAsync();
    }

    /// <summary>
    /// Moves a ticket to a status the BR-1 map permits, one legal step at a time.
    /// </summary>
    /// <remarks>
    /// <b>A note goes on every step, because BR-1.2 requires one on some of them.</b> The first
    /// version sent none and <c>New → Closed</c> came back <c>400</c> with
    /// <c>errors.note</c> — permitted by the BR-1 map and still refused, because closing work that
    /// was never started demands a reason (<c>Resolved → Closed</c> deliberately does not: `012`
    /// Q-1 ruled that asking for a reason for the expected outcome trains people to type nothing
    /// useful). Sending one always is correct for every transition and keeps this helper about the
    /// filters.
    /// <para>
    /// The failure message carries the response body, and that is why this took one run instead of
    /// several: the status alone said <c>400</c> and nothing about which field.
    /// </para>
    /// </remarks>
    private async Task MoveToAsync(Guid id, params string[] path)
    {
        var client = factory.CreateManagerClient();

        foreach (var status in path)
        {
            var current = await BodyOf(await client.GetAsync($"/api/tickets/{id}"));

            var response = await client.PutAsJsonAsync($"/api/tickets/{id}/status", new
            {
                status,
                expectedVersion = current.GetProperty("version").GetString(),
                note = "moved by a filter test",
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                $"moving to {status} must be a permitted transition — otherwise this helper is "
                + "testing the BR-1 map rather than the filter. The server said: "
                + await response.Content.ReadAsStringAsync());
        }
    }

    // ── AC-5 · OR within one key ────────────────────────────────────────────────────

    /// <summary>AC-5, BR-7.4.</summary>
    [Fact]
    public async Task A_repeated_filter_combines_with_OR()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var stayingNew = await CreateAsync(customerId, "new one");
        var opened = await CreateAsync(customerId, "opened one");
        var closed = await CreateAsync(customerId, "closed one");

        await MoveToAsync(opened, "Open");
        await MoveToAsync(closed, "Closed");

        var seen = await IdsOfAsync($"customerId={customerId}&pageSize=100&status=New&status=Open");

        seen.Should().BeEquivalentTo([stayingNew, opened],
            "New OR Open — and Closed is the control that proves the filter is doing something. "
            + "Asserting only that New came back would pass on no filter at all");
    }

    // ── AC-4 · AND across keys ──────────────────────────────────────────────────────

    /// <summary>AC-4, BR-7.3.</summary>
    [Fact]
    public async Task Two_different_filters_combine_with_AND()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var wanted = await CreateAsync(customerId, "wanted", category: "Billing", priority: "High");
        await CreateAsync(customerId, "right category wrong priority", category: "Billing", priority: "Low");
        await CreateAsync(customerId, "right priority wrong category", category: "Technical", priority: "High");

        var seen = await IdsOfAsync(
            $"customerId={customerId}&pageSize=100&category=Billing&priority=High");

        seen.Should().BeEquivalentTo([wanted],
            "AND across keys. The two decoys each satisfy ONE half — without them this would pass "
            + "on an OR, which is the defect BR-7.3 and BR-7.4 exist to keep apart");
    }

    // ── AC-10 · an unaccepted value is a 400 that lists what is accepted ────────────

    /// <summary>AC-10. **The message is read, not counted.**</summary>
    /// <remarks>
    /// `CLAUDE.md`: <c>errors[field]</c> with one entry is a SHAPE assertion, not a content one —
    /// six sites across the suite checked a <c>400</c> that way and all seventeen unresolved
    /// resource keys went out under them. So this reads the string, and asserts it names every
    /// accepted value.
    /// </remarks>
    [Fact]
    public async Task An_unaccepted_status_is_a_400_naming_the_parameter_and_every_accepted_value()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync("/api/tickets?status=Open&status=Bogus");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "one bad value invalidates the parameter. Dropping it would answer a different "
            + "question from the one asked, and the client could not tell");

        var body = await BodyOf(response);
        body.GetProperty("type").GetString().Should().EndWith("errors/validation",
            "the registry serves ABSOLUTE type URIs — measured, not assumed: the first version of "
            + "this assertion expected the bare code and the server answered "
            + "https://wasl.local/errors/validation. Asserted by suffix so the test is about the "
            + "code and not about whichever host the registry is configured with");

        var message = body.GetProperty("errors").GetProperty("status")
            .EnumerateArray().Single().GetString();

        message.Should().NotBeNullOrWhiteSpace();
        message.Should().NotStartWith("Validation.",
            "a raw resource key reaching the wire is the defect `004b` shipped and the guard "
            + "`ResourceKeyLeakTests` was written for");

        foreach (var accepted in new[]
                 { "New", "Open", "InProgress", "PendingCustomer", "Resolved", "Closed" })
        {
            message.Should().Contain(accepted,
                "AC-10 asks for the accepted values, and a message that omits one is a message "
                + "that sends a client guessing");
        }
    }

    /// <summary>AC-10, the numeric hole.</summary>
    /// <remarks>
    /// <c>Enum.TryParse&lt;TicketStatus&gt;("3")</c> returns <c>true</c> and yields
    /// <c>PendingCustomer</c>. Without the digit guard in <c>TicketFilters</c> this request would
    /// succeed and mean something the caller never asked for — the same shape as `009`'s
    /// <c>DEFAULT 'Normal'</c> silently overriding a caller's <c>Low</c>.
    /// </remarks>
    [Theory]
    [InlineData("3")]
    [InlineData("99")]
    public async Task A_numeric_status_is_refused_even_though_Enum_TryParse_would_accept_it(string value)
    {
        var response = await factory.CreateManagerClient().GetAsync($"/api/tickets?status={value}");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "the contract says enums travel as strings, so a number is a client that guessed");
    }

    /// <summary>`spec.md` Q-6-adjacent: a case variant of a correct value is accepted.</summary>
    [Fact]
    public async Task A_lower_case_status_is_accepted_and_filters()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var id = await CreateAsync(customerId, "case test");

        var seen = await IdsOfAsync($"customerId={customerId}&pageSize=100&status=new");

        seen.Should().BeEquivalentTo([id],
            "rejecting a case variant of a correct value is a worse failure than normalising it");
    }

    /// <summary>`spec.md` Q-4: the parameter present and empty is NO filter.</summary>
    [Fact]
    public async Task An_empty_filter_parameter_is_not_a_filter_that_matches_nothing()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var id = await CreateAsync(customerId, "empty filter");

        var seen = await IdsOfAsync($"customerId={customerId}&pageSize=100&status=");

        seen.Should().BeEquivalentTo([id],
            "not WHERE Status IN (), which returns nothing to a user who filtered nothing");
    }

    // ── AC-6, AC-24 · search ────────────────────────────────────────────────────────

    /// <summary>
    /// AC-6, BR-7.5 — three columns, and each one proven by a term that appears in ONLY that column.
    /// </summary>
    /// <remarks>
    /// <b>Three distinct markers, deliberately.</b> The first version of this test put one marker
    /// in both the subject and the customer name and then asserted twice with the same term — two
    /// assertions, one of which proved nothing, and neither could tell which column matched. A
    /// term unique to one column is the only way a per-column claim is real.
    /// <para>
    /// The customer is created through <c>POST /api/customers</c> rather than the fixture's
    /// seeder, because the seeder's second parameter is the COMPANY name and the name is what this
    /// test needs. Driving the real path is also what `007` and `011` learned to prefer: an entity
    /// written only from outside it is an entity nothing has verified.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Search_matches_the_number_the_subject_and_the_customer_name()
    {
        var client = factory.CreateManagerClient();
        var nameMarker = Marker();
        var subjectMarker = Marker();

        var created = await client.PostAsJsonAsync("/api/customers", new
        {
            fullName = $"عميل {nameMarker}",
            email = $"{Marker()}@example.com",
        });

        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var customerId = (await BodyOf(created)).GetProperty("id").GetGuid();

        var id = await CreateAsync(customerId, $"subject {subjectMarker}");

        var number = (await BodyOf(await client.GetAsync($"/api/tickets/{id}")))
            .GetProperty("ticketNumber").GetString()!;

        (await IdsOfAsync($"pageSize=100&search={subjectMarker}"))
            .Should().BeEquivalentTo([id], "the subject, and nothing else, carries this term");

        (await IdsOfAsync($"pageSize=100&search={number}"))
            .Should().BeEquivalentTo([id],
                "the ticket number is what people quote to each other on a phone call");

        (await IdsOfAsync($"pageSize=100&search={nameMarker}"))
            .Should().BeEquivalentTo([id],
                "the CUSTOMER's name carries this term and the ticket does not — so this is the "
                + "assertion that proves the correlated subquery over Customers is wired");
    }

    /// <summary>
    /// AC-24 — and the criterion's own premise was wrong.
    /// </summary>
    /// <remarks>
    /// AC-24 was written on the assumption that <c>%</c> and <c>_</c> need escaping by hand on SQL
    /// Server. `008` measured otherwise: EF Core 10 builds the pattern and escapes the term,
    /// emitting <c>LIKE @p ESCAPE N'\'</c>. So this pins the PROVIDER's behaviour — the thing an
    /// upgrade could change — rather than asserting a hand-rolled escaper that would double-escape
    /// and make any subject containing a backslash unfindable.
    /// </remarks>
    [Theory]
    [InlineData("%")]
    [InlineData("_")]
    [InlineData("[")]
    public async Task A_LIKE_wildcard_in_a_search_term_is_literal(string wildcard)
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var id = await CreateAsync(customerId, $"plain subject {Marker()}");

        var seen = await IdsOfAsync($"customerId={customerId}&pageSize=100&search={Uri.EscapeDataString(wildcard)}");

        seen.Should().NotContain(id,
            $"'{wildcard}' must match the character, not every row. A term of one wildcard "
            + "returning the whole table is how this defect presents");
    }

    // ── AC-8, AC-9 · assignee ───────────────────────────────────────────────────────

    /// <summary>AC-8 — resolved from the token, not from the URL.</summary>
    [Fact]
    public async Task Assignee_me_resolves_from_the_token()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var mine = await CreateAsync(customerId, "mine");
        var theirs = await CreateAsync(customerId, "theirs");
        var unassigned = await CreateAsync(customerId, "nobody's");

        var managerId = await UserIdAsync(SupportUserSeeder.ManagerEmail);
        var agentId = await UserIdAsync(SupportUserSeeder.AgentEmail);

        await AssignAsync(mine, managerId);
        await AssignAsync(theirs, agentId);

        var seen = await IdsOfAsync($"customerId={customerId}&pageSize=100&assignee=me");

        seen.Should().BeEquivalentTo([mine],
            "the Manager's own token resolved it. The Agent's ticket and the unassigned one are "
            + $"the controls — {theirs} and {unassigned} must both be absent");
    }

    /// <summary>AC-9.</summary>
    [Fact]
    public async Task Assignee_unassigned_is_a_null_test_and_not_an_id()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var assigned = await CreateAsync(customerId, "assigned");
        var unassigned = await CreateAsync(customerId, "unassigned");

        await AssignAsync(assigned, await UserIdAsync(SupportUserSeeder.AgentEmail));

        var seen = await IdsOfAsync($"customerId={customerId}&pageSize=100&assignee=unassigned");

        seen.Should().BeEquivalentTo([unassigned],
            "and 'unassigned' must not be confused with 'not filtering' — the assigned ticket is "
            + "the control that separates them");
    }

    /// <summary>AC-10, on <c>?assignee=</c>.</summary>
    [Fact]
    public async Task An_unrecognised_assignee_is_a_400_and_not_a_dropped_filter()
    {
        var response = await factory.CreateManagerClient().GetAsync("/api/tickets?assignee=nobody");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var message = (await BodyOf(response)).GetProperty("errors").GetProperty("assignee")
            .EnumerateArray().Single().GetString();

        message.Should().NotStartWith("Validation.");
        message.Should().Contain("me").And.Contain("unassigned");
    }

    private async Task AssignAsync(Guid ticketId, Guid assigneeId)
    {
        var client = factory.CreateManagerClient();
        var current = await BodyOf(await client.GetAsync($"/api/tickets/{ticketId}"));

        var response = await client.PutAsJsonAsync($"/api/tickets/{ticketId}/assignee", new
        {
            assigneeId,
            expectedVersion = current.GetProperty("version").GetString(),
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── escalated, and the clamp ─────────────────────────────────────────────────────

    /// <summary>
    /// <c>escalated=false</c> returns NON-escalated tickets, not all of them.
    /// </summary>
    /// <remarks>
    /// The parameter is <c>bool?</c> so absent and <c>false</c> are distinguishable. A
    /// non-nullable bool would make every unfiltered request look like a request for
    /// non-escalated tickets — which is `spec.md`'s stated reason and is invisible until
    /// `016-escalate-ticket` gives something a <c>true</c>.
    /// </remarks>
    [Fact]
    public async Task Escalated_false_filters_rather_than_meaning_any()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var id = await CreateAsync(customerId, "not escalated");

        (await IdsOfAsync($"customerId={customerId}&pageSize=100&escalated=false"))
            .Should().Contain(id);

        (await IdsOfAsync($"customerId={customerId}&pageSize=100&escalated=true"))
            .Should().NotContain(id,
                "nothing can be escalated until `016`, so true must return none of these — and "
                + "this is the half that fails if the parameter is being ignored");
    }

    /// <summary>
    /// BR-7.2's clamp-never-reject, applied to a repeated filter.
    /// </summary>
    /// <remarks>
    /// Twenty-one values: the request succeeds and the twenty-first is dropped rather than
    /// refused, which is the same ruling `033` took for <c>?company=</c> on the same day. The
    /// assertion is that a clamped request still filters — a clamp that silently became "no
    /// filter" would return everything, which is the failure worth catching.
    /// </remarks>
    [Fact]
    public async Task More_filter_values_than_the_clamp_are_dropped_and_not_refused()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var id = await CreateAsync(customerId, "clamped");

        var repeated = string.Join("&", Enumerable.Repeat("status=New", 21));

        var seen = await IdsOfAsync($"customerId={customerId}&pageSize=100&{repeated}");

        seen.Should().BeEquivalentTo([id],
            "duplicates collapse to one value before the clamp, so twenty-one repeats of New is "
            + "one filter — and the row still comes back, which proves the clamp did not turn "
            + "into no filter at all");
    }

    /* ---- The created-date range, added 2026-08-31 -----------------------------
     * The panel's date fields were drawn and inert until the endpoint grew
     * createdFrom/createdTo; these are the tests that let them be wired.
     *
     * THE BACKDATE IS PARAMETERIZED SQL ON A ROW THE REAL PATH CREATED. Every
     * ticket here is born through POST /api/tickets — the entity is exercised end
     * to end — and only its timestamp is then moved, because a date-range test
     * needs tickets on THREE different days and the real path can only mint
     * "now". Interpolated, never concatenated: EF1002, and the habit formed in a
     * test is the habit 015 warned about.
     * -------------------------------------------------------------------------- */

    private async Task BackdateAsync(Guid id, DateTime createdAtUtc)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        (await context.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE dbo.Tickets SET CreatedAtUtc = {createdAtUtc} WHERE Id = {id}"))
            .Should().Be(1, "the backdate must have touched exactly the ticket it named");
    }

    /// <summary>Both bounds are inclusive DAYS, and the end bound covers its whole day.</summary>
    [Fact]
    public async Task The_created_range_is_inclusive_on_both_ends()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var early = await CreateAsync(customerId, "early");
        var middle = await CreateAsync(customerId, "middle");
        var late = await CreateAsync(customerId, "late");

        await BackdateAsync(early, new DateTime(2026, 8, 10, 9, 0, 0, DateTimeKind.Utc));
        /* 23:30 ON THE LAST DAY OF THE RANGE is the case that catches a lazy
         * bound: comparing <= 2026-08-20T00:00 would drop it, and the filter
         * would read as "to 20/08, exclusive, sometimes" — the worst kind of
         * sometimes, because it depends on the time of day the ticket arrived. */
        await BackdateAsync(middle, new DateTime(2026, 8, 20, 23, 30, 0, DateTimeKind.Utc));

        var scope = $"customerId={customerId}&pageSize=100";

        (await IdsOfAsync($"{scope}&createdFrom=2026-08-15"))
            .Should().BeEquivalentTo([middle, late], "the 10th is before the range");

        (await IdsOfAsync($"{scope}&createdTo=2026-08-15"))
            .Should().BeEquivalentTo([early], "only the 10th is on or before the 15th");

        (await IdsOfAsync($"{scope}&createdFrom=2026-08-10&createdTo=2026-08-20"))
            .Should().BeEquivalentTo([early, middle],
                "the 10th at 09:00 and the 20th at 23:30 are both inside an inclusive day range");
    }

    /// <summary>The bounds AND with every other filter, like every other key (BR-7.3).</summary>
    [Fact]
    public async Task The_created_range_composes_with_other_filters()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var oldHigh = await CreateAsync(customerId, "old high", priority: "High");
        var oldLow = await CreateAsync(customerId, "old low", priority: "Low");
        await CreateAsync(customerId, "new high", priority: "High");

        var oldDay = new DateTime(2026, 7, 1, 12, 0, 0, DateTimeKind.Utc);
        await BackdateAsync(oldHigh, oldDay);
        await BackdateAsync(oldLow, oldDay);

        (await IdsOfAsync($"customerId={customerId}&pageSize=100&priority=High&createdTo=2026-07-01"))
            .Should().BeEquivalentTo([oldHigh],
                "the range must intersect the priority filter, not replace it");
    }

    /// <summary>An unparseable date is a <c>400</c>, and the MESSAGE comes from the catalogue.</summary>
    /// <remarks>
    /// <b>This test asserted only the status until 2026-08-31, and the status was never the
    /// question.</b> The bounds bound as <c>DateOnly?</c> then, so the refusal came from the model
    /// binder — before <c>ValidationBehaviour</c> runs — and the measured reply was
    /// <c>"The value '2026-13-45' is not valid."</c>: the framework's English sentence, in an
    /// Arabic client's face, with no catalogue key behind it and nothing in
    /// <c>ResourceKeyLeakTests</c> or <c>MessageKeyCoverageTests</c> able to see it. Reading the
    /// string is what makes the difference visible.
    /// </remarks>
    [Fact]
    public async Task A_malformed_created_bound_is_a_400_with_a_localized_message()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync("/api/tickets?createdFrom=2026-13-45");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "clamping a broken date would hide a client bug");

        var message = (await BodyOf(response)).GetProperty("errors").GetProperty("createdFrom")
            .EnumerateArray().Single().GetString();

        message.Should().NotStartWith("Validation.");
        message.Should().Contain("yyyy-MM-dd",
            "the message has to say what a readable date looks like — the framework's sentence "
            + "repeated the bad value back and said nothing about the format");
    }

    /* ---- Hijri, added 2026-08-31 ----------------------------------------------
     * The Gregorian half shipped working. The Hijri half shipped SILENTLY WRONG,
     * and that is what these tests are about: ?createdFrom=1448-03-05 answered
     * 200 with totalCount 186 against a 186-row table, because 1448-03-05 is a
     * perfectly good Gregorian date in the year 1448 and every ticket is after
     * it. Nothing errored and the filter looked like it had run.
     *
     * The expected conversions below are NOT computed with UmAlQuraCalendar —
     * that would assert the implementation against itself. They come from ICU
     * (Intl.DateTimeFormat, calendar islamic-umalqura), a second source, so a
     * disagreement between .NET's table and ICU's shows up here as a red test
     * rather than as an off-by-one day at a month boundary in production.
     * -------------------------------------------------------------------------- */

    /// <summary>A Hijri bound selects exactly what its Gregorian equal selects.</summary>
    [Fact]
    public async Task A_hijri_bound_means_the_same_day_as_its_gregorian_equal()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var early = await CreateAsync(customerId, "early");
        var middle = await CreateAsync(customerId, "middle");
        var late = await CreateAsync(customerId, "late");

        await BackdateAsync(early, new DateTime(2026, 8, 10, 9, 0, 0, DateTimeKind.Utc));
        await BackdateAsync(middle, new DateTime(2026, 8, 20, 23, 30, 0, DateTimeKind.Utc));

        var scope = $"customerId={customerId}&pageSize=100";

        // 1448-03-02 AH is 2026-08-15 (ICU). Same request, two calendars, one answer.
        (await IdsOfAsync($"{scope}&createdFrom=1448-03-02&calendar=hijri"))
            .Should().BeEquivalentTo([middle, late],
                "1448-03-02 AH is 2026-08-15, so the 10th is before the range in either calendar");

        // 1448-02-27 AH is 2026-08-10 and 1448-03-07 AH is 2026-08-20 — the inclusive-day rule
        // has to survive the conversion, including the ticket at 23:30 on the last day.
        (await IdsOfAsync($"{scope}&createdFrom=1448-02-27&createdTo=1448-03-07&calendar=hijri"))
            .Should().BeEquivalentTo([early, middle],
                "both ends stay inclusive after conversion — the upper bound is still resolved to "
                + "the exclusive start of the NEXT day, not to midnight of its own");

        (await IdsOfAsync($"{scope}&createdFrom=2026-08-15&calendar=gregorian"))
            .Should().BeEquivalentTo([middle, late],
                "gregorian is accepted explicitly, so a client can be unambiguous rather than "
                + "relying on the default");
    }

    /// <summary>
    /// **The defect.** An undeclared Hijri date is refused, not read as the year 1448.
    /// </summary>
    /// <remarks>
    /// The negative control for this one is the whole reason it exists: delete the
    /// <c>LooksHijriButUndeclared</c> rule and the request answers <c>200</c> with every ticket
    /// the caller can see. A test that asserted a status could not tell those apart.
    /// </remarks>
    [Fact]
    public async Task An_undeclared_hijri_date_is_refused_rather_than_read_as_the_year_1448()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync("/api/tickets?createdFrom=1448-03-05");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "before this rule the request answered 200 with the whole table, because 1448-03-05 "
            + "is a valid Gregorian date and every ticket was created after it");

        var message = (await BodyOf(response)).GetProperty("errors").GetProperty("createdFrom")
            .EnumerateArray().Single().GetString();

        message.Should().NotStartWith("Validation.");
        message.Should().Contain("calendar=hijri",
            "the message has to name the parameter that makes the request mean what the caller "
            + "intended — refusing without it is a dead end");
    }

    /// <summary>A Hijri date outside Um al-Qura's table is unreadable, not a crash.</summary>
    [Fact]
    public async Task A_hijri_date_outside_the_table_is_a_400()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync("/api/tickets?createdFrom=1200-01-01&calendar=hijri");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "UmAlQuraCalendar throws below about 1318 AH, and an ArgumentException reaching the "
            + "pipeline would be a 500 for a bad query string");

        (await BodyOf(response)).GetProperty("errors").TryGetProperty("createdFrom", out _)
            .Should().BeTrue("the refusal names the bound that could not be read");
    }

    /// <summary>An unknown <c>?calendar=</c> is a <c>400</c> naming what it accepts.</summary>
    [Fact]
    public async Task An_unknown_calendar_is_a_400()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync("/api/tickets?createdFrom=2026-08-15&calendar=julian");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var message = (await BodyOf(response)).GetProperty("errors").GetProperty("calendar")
            .EnumerateArray().Single().GetString();

        message.Should().NotStartWith("Validation.");
        message.Should().Contain("hijri").And.Contain("gregorian");
    }

    /// <summary>An inverted range is refused, not answered with an empty page.</summary>
    /// <remarks>
    /// Measured before the rule existed: <c>200</c>, <c>totalCount 0</c>, against 186 tickets.
    /// **A correct query over an impossible range returns nothing, and a <c>200</c> then makes a
    /// claim about the DATA — "no work in that period" — in answer to a broken claim about the
    /// REQUEST.** The two are indistinguishable to the caller, and only one of them is true.
    /// </remarks>
    [Fact]
    public async Task An_inverted_created_range_is_a_400_and_not_an_empty_page()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync("/api/tickets?createdFrom=2026-09-01&createdTo=2026-08-01");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "zero rows from a correct query reads as an answer about the data");

        var message = (await BodyOf(response)).GetProperty("errors").GetProperty("createdTo")
            .EnumerateArray().Single().GetString();

        message.Should().NotStartWith("Validation.");
    }

    /// <summary>An empty bound is no filter, exactly as an empty <c>?status=</c> is.</summary>
    /// <remarks>
    /// The case a filter panel produces every time someone CLEARS a date field. <c>015</c> already
    /// found it on <c>?status=</c> — the browser sends the key with an empty value — and a bound
    /// that answered <c>400</c> there would break the same interaction on the same panel.
    /// </remarks>
    [Fact]
    public async Task An_empty_created_bound_is_no_filter()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var id = await CreateAsync(customerId, "cleared");

        (await IdsOfAsync($"customerId={customerId}&pageSize=100&createdFrom=&createdTo=&calendar="))
            .Should().BeEquivalentTo([id],
                "clearing the date fields must not turn into a range that matches nothing");
    }
}
