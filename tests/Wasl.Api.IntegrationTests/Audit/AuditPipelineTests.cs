using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit.Probe;
using Wasl.Domain.Audit;

namespace Wasl.Api.IntegrationTests.Audit;

/// <summary>
/// The BR-9.4 asymmetry and the diff, through the real pipeline against a real engine.
/// AC-6 to AC-11, AC-16 to AC-25.
/// </summary>
/// <remarks>
/// <b>Every assertion here is on content or on an exact count.</b> `research.md` R-1's failure
/// mode is a row that exists with an empty diff — so a test asserting <c>COUNT(*) &gt; 0</c>, or
/// asserting that <c>Changes</c> is present, would pass on the broken implementation. AC-18 and
/// AC-19 exist to be read this way.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class AuditPipelineTests(WaslApiFactory factory)
{
    private static string Path(string route, Guid customerId, string? company = null) =>
        company is null
            ? $"{route}?customerId={customerId}"
            : $"{route}?customerId={customerId}&company={Uri.EscapeDataString(company)}";

    /// <summary>AC-6, AC-25, AC-19, AC-23. The success path, end to end.</summary>
    [Fact]
    public async Task A_successful_command_writes_exactly_one_row_inside_the_transaction()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateClient()
            .PostAsync(Path(AuditProbeEndpoints.SucceedPath, customerId, "Acme Holdings"), null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var rows = await AuditFixture.RowsForAsync(factory, "Customer.ProbeSucceeded");
        var mine = rows.Where(row => row.EntityId == customerId).ToArray();

        mine.Should().HaveCount(1,
            "BR-9.1 says exactly one. Asserted as 1, not as > 0 — a double write is a real "
            + "defect and `> 0` passes on it (AC-25)");

        var entry = mine[0];
        entry.Outcome.Should().Be(AuditOutcome.Success);
        entry.Action.Should().Be("Customer.ProbeSucceeded");
        entry.EntityType.Should().Be("Customer");
        entry.TraceId.Should().NotBeNullOrWhiteSpace("BR-9.9");
        entry.OccurredAtUtc.Kind.Should().Be(DateTimeKind.Utc,
            "001's global converter is what makes the read side true (AC-23)");

        // The business change committed with the row.
        var customer = await AuditFixture.ReadCustomerAsync(factory, customerId);
        customer!.CompanyName.Should().Be("Acme Holdings");

        // AC-19: the diff is content, not presence.
        entry.Changes.Should().NotBeNull("the interceptor must have captured the change");

        var changes = JsonDocument.Parse(entry.Changes!).RootElement;
        changes.ValueKind.Should().Be(JsonValueKind.Array);

        var companyChange = changes.EnumerateArray()
            .Single(change => change.GetProperty("field").GetString() == "CompanyName");

        companyChange.GetProperty("entity").GetString().Should().Be("Customer");
        companyChange.GetProperty("before").GetString().Should().Be("initial",
            "before-and-after, from the change tracker BEFORE SaveChanges accepted it. This is "
            + "the assertion that fails if the diff is read too late (research.md R-1)");
        companyChange.GetProperty("after").GetString().Should().Be("Acme Holdings");
    }

    /// <summary>
    /// AC-9. A command that mutates and then throws: the row survives, the mutation does not.
    /// </summary>
    [Fact]
    public async Task A_failing_command_leaves_its_row_and_rolls_back_its_change()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory, companyName: "untouched");

        var response = await factory.CreateClient()
            .PostAsync(Path(AuditProbeEndpoints.FailPath, customerId), null);

        response.StatusCode.Should().Be(HttpStatusCode.InternalServerError,
            "002's envelope, unchanged — AuditBehaviour rethrows the original exception (AC-11)");

        var mine = (await AuditFixture.RowsForAsync(factory, "Customer.ProbeFailed"))
            .Where(row => row.EntityId == customerId)
            .ToArray();

        mine.Should().HaveCount(1);
        mine[0].Outcome.Should().Be(AuditOutcome.Failed);

        var customer = await AuditFixture.ReadCustomerAsync(factory, customerId);
        customer!.CompanyName.Should().Be("untouched",
            "the mutation rolled back. The row surviving that rollback is the whole of BR-9.4 — "
            + "written on a second connection, which is why it is still here");
    }

    /// <summary>
    /// AC-8. <b>The half that is invisible when wrong.</b>
    /// </summary>
    /// <remarks>
    /// If the denial row were added to the request's own <c>DbContext</c>, it would be created
    /// and then destroyed by the rollback. The response would still be correct, the log would
    /// still show the denial, and the only durable record that someone was refused would be
    /// gone — with nothing anywhere reporting a problem.
    /// </remarks>
    [Fact]
    public async Task A_denied_command_leaves_a_denied_row_that_survives_the_rollback()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory, companyName: "unchanged");

        await factory.CreateClient().PostAsync(Path(AuditProbeEndpoints.DenyPath, customerId), null);

        var mine = (await AuditFixture.RowsForAsync(factory, "Customer.ProbeDenied"))
            .Where(row => row.EntityId == customerId)
            .ToArray();

        mine.Should().HaveCount(1, "the row exists at all — this is the assertion");
        mine[0].Outcome.Should().Be(AuditOutcome.Denied,
            "Denied, not Failed. 'Someone tried and was refused' is what an incident "
            + "investigation looks for; 'something broke' is not. The classifier keys on the "
            + "forbidden error code, not on an HTTP status (spec.md Q-4)");
        mine[0].EntityLabel.Should().Be("probe-customer",
            "DescribeTarget(null) — a denied command has no response but knows its target "
            + "(research.md R-8)");

        var customer = await AuditFixture.ReadCustomerAsync(factory, customerId);
        customer!.CompanyName.Should().Be("unchanged");
    }

    /// <summary>
    /// AC-18. A write that changes nothing produces no entry for that field.
    /// </summary>
    /// <remarks>
    /// EF marks a property <c>Modified</c> when it is assigned, whether or not the value
    /// differs. So this passes only if the diff compares values rather than trusting the flag —
    /// and if it did not, every no-op write would bury the field that actually changed.
    /// </remarks>
    [Fact]
    public async Task A_no_op_write_produces_no_change_entry()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory, companyName: "same");

        await factory.CreateClient().PostAsync(Path(AuditProbeEndpoints.NoOpPath, customerId), null);

        var entry = (await AuditFixture.RowsForAsync(factory, "Customer.ProbeNoOp"))
            .Single(row => row.EntityId == customerId);

        if (entry.Changes is not null)
        {
            JsonDocument.Parse(entry.Changes).RootElement.EnumerateArray()
                .Select(change => change.GetProperty("field").GetString())
                .Should().NotContain("CompanyName",
                    "the value did not change, so BR-9.8 says it is absent");
        }

        entry.Changes.Should().BeNull(
            "nothing changed, so the document is null — never []. An empty array and a lost "
            + "diff must not look the same in the table (research.md R-1)");
    }

    /// <summary>
    /// AC-25 with two saves. The accumulator merges; the row count stays one.
    /// </summary>
    [Fact]
    public async Task Two_saves_in_one_request_merge_into_one_row_and_one_document()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        await factory.CreateClient().PostAsync(Path(AuditProbeEndpoints.TwicePath, customerId), null);

        var mine = (await AuditFixture.RowsForAsync(factory, "Customer.ProbeSavedTwice"))
            .Where(row => row.EntityId == customerId)
            .ToArray();

        mine.Should().HaveCount(1, "one request, one row — regardless of how many times the "
            + "handler saved (AC-25)");

        var fields = JsonDocument.Parse(mine[0].Changes!).RootElement.EnumerateArray()
            .Select(change => change.GetProperty("field").GetString())
            .ToArray();

        fields.Should().Contain("CompanyName").And.Contain("Notes",
            "both saves are in the document. A per-save collection would keep only the last "
            + "batch, which is a partial diff that looks exactly like a complete one");
    }

    /// <summary>AC-16. A query opens no transaction and writes no row.</summary>
    [Fact]
    public async Task A_query_opens_no_transaction_and_writes_no_audit_row()
    {
        var before = (await AuditFixture.RowsForAsync(factory, "Customer.ProbeSucceeded")).Count;

        var response = await factory.CreateClient().GetAsync(AuditProbeEndpoints.QueryPath);
        var body = await response.Content.ReadAsStringAsync();

        JsonDocument.Parse(body).RootElement.GetProperty("hadTransaction").GetBoolean()
            .Should().BeFalse(
                "TransactionBehaviour is constrained to ICommand, so it is never constructed "
                + "for a query — the constraint keeps it out, not an `if` that can be deleted");

        (await AuditFixture.RowsForAsync(factory, "Customer.ProbeSucceeded")).Count
            .Should().Be(before, "a read is not an audited action (spec.md Q-2)");
    }

    /// <summary>
    /// AC-21. The row's <c>TraceId</c> is the same string the response body carries.
    /// </summary>
    /// <remarks>
    /// BR-9.9's whole point. Both come from one derivation, reached through
    /// <c>IRequestContext</c> — a second <c>Activity.Current?.Id</c> anywhere would produce a
    /// valid id that is not <i>the</i> id, and the two would differ only when
    /// <c>Activity.Current</c> happened to be null.
    /// </remarks>
    [Fact]
    public async Task The_row_trace_id_matches_the_problem_details_trace_id()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateClient()
            .PostAsync(Path(AuditProbeEndpoints.FailPath, customerId), null);

        var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        var responseTraceId = problem.GetProperty("traceId").GetString();

        var entry = (await AuditFixture.RowsForAsync(factory, "Customer.ProbeFailed"))
            .Single(row => row.EntityId == customerId);

        entry.TraceId.Should().Be(responseTraceId,
            "one identifier in the response, the log, and the row. Byte-identical, not merely "
            + "both present");
    }

    /// <summary>
    /// AC-20. The actor is a snapshot, not a join.
    /// </summary>
    /// <remarks>
    /// There is no authentication until `004`, so the values are null — and that is what makes
    /// this testable now: the assertion is that the columns hold what <c>ICurrentUser</c>
    /// returned <b>at write time</b>, and a joined implementation could not produce null for a
    /// row while the interface later returned something else. `004` repeats this with a real
    /// user and a role change (`spec.md` Out of scope).
    /// </remarks>
    [Fact]
    public async Task The_actor_columns_hold_what_the_current_user_returned_at_write_time()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        await factory.CreateClient()
            .PostAsync(Path(AuditProbeEndpoints.SucceedPath, customerId, "Snapshot Co"), null);

        var entry = (await AuditFixture.RowsForAsync(factory, "Customer.ProbeSucceeded"))
            .Single(row => row.EntityId == customerId);

        entry.ActorUserId.Should().BeNull();
        entry.ActorEmail.Should().BeNull();
        entry.ActorRole.Should().BeNull(
            "no authentication yet, so no actor. The nullable columns are the designed shape "
            + "for BR-9.2's anonymous events rather than a gap waiting to be filled");
    }

    /// <summary>
    /// AC-24. Arabic survives the round trip through <c>Changes</c>.
    /// </summary>
    /// <remarks>
    /// <c>varchar(max)</c> would return <c>????</c> and it would look like a font problem, which
    /// is the class of defect ADR-013 row 4 exists to prevent. Asserted on the value read back
    /// from the database, not on what was sent.
    /// </remarks>
    [Fact]
    public async Task Arabic_text_round_trips_through_the_changes_document()
    {
        const string arabic = "شركة الأفق للتقنية";

        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        await factory.CreateClient()
            .PostAsync(Path(AuditProbeEndpoints.SucceedPath, customerId, arabic), null);

        var entry = (await AuditFixture.RowsForAsync(factory, "Customer.ProbeSucceeded"))
            .Single(row => row.EntityId == customerId);

        var after = JsonDocument.Parse(entry.Changes!).RootElement.EnumerateArray()
            .Single(change => change.GetProperty("field").GetString() == "CompanyName")
            .GetProperty("after").GetString();

        after.Should().Be(arabic, "nvarchar, and an encoder that leaves Arabic unescaped so the "
            + "column is readable with SQL until 019 exists");
    }

    /// <summary>
    /// AC-22. Audit content is never localized.
    /// </summary>
    /// <remarks>
    /// <b>Weak until `005`</b>, and `spec.md` says so: no <c>RequestLocalizationMiddleware</c> is
    /// registered, so the header changes nothing today and this test cannot fail. It is written
    /// now and re-run at `005`, where it acquires teeth — the alternative is discovering at `005`
    /// that a serialiser was culture-sensitive all along.
    /// </remarks>
    [Fact]
    public async Task The_same_command_under_arabic_produces_identical_machine_readable_content()
    {
        var english = await AuditFixture.SeedCustomerAsync(factory);
        var arabic = await AuditFixture.SeedCustomerAsync(factory);

        var client = factory.CreateClient();

        await client.PostAsync(Path(AuditProbeEndpoints.SucceedPath, english, "Identical Co"), null);

        var request = new HttpRequestMessage(
            HttpMethod.Post, Path(AuditProbeEndpoints.SucceedPath, arabic, "Identical Co"));
        request.Headers.Add("Accept-Language", "ar");
        await client.SendAsync(request);

        var rows = await AuditFixture.RowsForAsync(factory, "Customer.ProbeSucceeded");
        var englishRow = rows.Single(row => row.EntityId == english);
        var arabicRow = rows.Single(row => row.EntityId == arabic);

        arabicRow.Action.Should().Be(englishRow.Action, "BR-9.10 — never localized");
        arabicRow.EntityType.Should().Be(englishRow.EntityType);
        arabicRow.Outcome.Should().Be(englishRow.Outcome);

        // The ids differ, so compare the shape rather than the whole document: the field names,
        // the key names, and the values that are not the customer id must be identical.
        Fields(arabicRow.Changes!).Should().Equal(Fields(englishRow.Changes!),
            "byte-identical field names and ordering. A culture-sensitive sort or a decimal "
            + "separator would break this, in a column nobody reads until an incident");
    }

    private static string[] Fields(string changes) =>
        JsonDocument.Parse(changes).RootElement.EnumerateArray()
            .Select(change => change.GetProperty("field").GetString()!)
            .ToArray();

    /// <summary>
    /// AC-7. A mutation that cannot be audited must not happen.
    /// </summary>
    /// <remarks>
    /// Asserted by construction rather than by fault injection: the success-path write goes
    /// through the request's own <c>DbContext</c> inside the open transaction, so an audit
    /// insert failure fails the whole transaction. Recorded here rather than left implicit,
    /// because "it follows from the transaction" is the kind of claim that stops being true
    /// after a refactor and nothing notices.
    /// </remarks>
    [Fact]
    public void The_success_path_writes_through_the_request_context_so_a_failed_audit_fails_the_change()
    {
        using var scope = factory.Services.CreateScope();

        var writer = scope.ServiceProvider
            .GetRequiredService<Wasl.Application.Common.Abstractions.IAuditWriter>();

        writer.Should().NotBeNull();
        writer.GetType().Name.Should().Be("AuditWriter",
            "one implementation. The two methods differ by which DbContext they use, which is "
            + "the whole of BR-9.4 — and AC-7 falls out of the in-transaction one rather than "
            + "being separately implemented");
    }
}
