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
/// <c>POST /api/tickets</c> and <c>GET /api/tickets/{id}</c> through the real pipeline against a
/// real engine. AC-1 to AC-11.
/// </summary>
[Collection(WaslApiCollection.Name)]
public sealed class CreateTicketTests(WaslApiFactory factory)
{
    private static object ValidBody(Guid customerId, string? priority = "High") => priority is null
        ? new
        {
            customerId,
            subject = "Cannot sign in",
            description = "The password reset email never arrives.",
            category = "Technical",
            channel = "WhatsApp",
        }
        : new
        {
            customerId,
            subject = "Cannot sign in",
            description = "The password reset email never arrives.",
            category = "Technical",
            channel = "WhatsApp",
            priority,
        };

    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>AC-1, AC-2, AC-3, AC-10. The happy path, and the Location that must resolve.</summary>
    [Fact]
    public async Task A_valid_create_returns_201_with_a_location_that_resolves()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/tickets", ValidBody(customerId));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location.Should().NotBeNull("AC-1 — 201 carries Location");

        var created = await BodyOf(response);

        created.GetProperty("status").GetString().Should().Be("New", "AC-2, BR-1.1");
        created.GetProperty("assignedToUserId").ValueKind.Should().Be(JsonValueKind.Null, "AC-2");
        created.GetProperty("ticketNumber").GetString().Should().MatchRegex(
            @"^TCK-\d{4}-\d{6}$", "AC-3");

        created.GetProperty("allowedTransitions").EnumerateArray()
            .Select(value => value.GetString())
            .Should().Equal(["Open", "Closed"],
                "AC-10, computed from the BR-1 map plus its conditions — a New ticket has no "
                + "assignee, so InProgress is excluded by the rule rather than by the matrix");

        // Decision 1. Present and null, not absent — removing the field and adding it back at
        // 004 would be a breaking change for a client.
        created.TryGetProperty("createdByUserId", out var createdBy).Should().BeTrue();
        createdBy.ValueKind.Should().Be(JsonValueKind.Null);

        // Decision 3. The whole reason GET moved into this feature: a 201 whose Location
        // returns 404 is a broken API, and 010 lands after 012.
        var read = await client.GetAsync(response.Headers.Location);

        read.StatusCode.Should().Be(HttpStatusCode.OK);

        var fetched = await BodyOf(read);
        fetched.GetProperty("id").GetGuid().Should().Be(created.GetProperty("id").GetGuid());
        fetched.GetProperty("ticketNumber").GetString()
            .Should().Be(created.GetProperty("ticketNumber").GetString(),
                "the contract says a GET on it returns the same resource, from the same mapping");
    }

    /// <summary>AC-8. An omitted priority becomes Normal, never Low.</summary>
    /// <remarks>
    /// The column carries no DEFAULT, deliberately. EF warned that a database default is applied
    /// whenever the property holds the CLR default — which for <c>TicketPriority</c> is
    /// <c>Low</c> — so an explicit <c>Low</c> would have been stored as <c>Normal</c>. This test
    /// and the next one are the two halves of that.
    /// </remarks>
    [Fact]
    public async Task An_omitted_priority_defaults_to_normal()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/tickets", ValidBody(customerId, priority: null));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        (await BodyOf(response)).GetProperty("priority").GetString().Should().Be("Normal", "AC-8");
    }

    /// <summary>An explicit Low stays Low. The other half of the column-default defect.</summary>
    [Fact]
    public async Task An_explicit_low_priority_is_not_overwritten()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/tickets", ValidBody(customerId, priority: "Low"));

        (await BodyOf(response)).GetProperty("priority").GetString().Should().Be("Low",
            "a column DEFAULT would have silently replaced this with Normal, because Low is the "
            + "CLR default for the enum. No error, the value simply changes");
    }

    /// <summary>AC-4. Unknown customer is a 404, in the 002 envelope.</summary>
    [Fact]
    public async Task An_unknown_customer_returns_404_as_problem_details()
    {
        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/tickets", ValidBody(Guid.NewGuid()));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");

        var problem = await BodyOf(response);
        problem.GetProperty("type").GetString().Should().Be("https://wasl.local/errors/not-found");
        problem.GetProperty("traceId").GetString().Should().NotBeNullOrWhiteSpace();

        // No id, no name, nothing about the customer. A 404 that distinguishes "no such
        // customer" from "one you may not see" is an enumeration oracle — BR-4.4's reasoning.
        (await response.Content.ReadAsStringAsync()).Should().NotContain("customerId");
    }

    /// <summary>AC-4, AC-6, AC-7. Validation, keyed by field.</summary>
    [Theory]
    [InlineData("", "d", "subject required")]
    [InlineData("   ", "d", "whitespace is not a subject (AC-7)")]
    [InlineData("s", "", "description required")]
    [InlineData("s", "   ", "whitespace is not a description (AC-7)")]
    public async Task A_blank_subject_or_description_returns_400(
        string subject, string description, string because)
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject,
            description,
            category = "Technical",
            channel = "WhatsApp",
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest, because);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        (await BodyOf(response)).TryGetProperty("errors", out _).Should().BeTrue(
            "AC-6 — a 400 carries field-keyed errors");
    }

    /// <summary>AC-6. Boundary lengths, both sides.</summary>
    [Fact]
    public async Task A_subject_at_the_limit_is_accepted_and_one_over_is_not()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var client = factory.CreateClient();

        var atLimit = await client.PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = new string('x', Ticket.SubjectMaxLength),
            description = "d",
            category = "Technical",
            channel = "WhatsApp",
        });

        atLimit.StatusCode.Should().Be(HttpStatusCode.Created, "200 characters is legal");

        var overLimit = await client.PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = new string('x', Ticket.SubjectMaxLength + 1),
            description = "d",
            category = "Technical",
            channel = "WhatsApp",
        });

        overLimit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "201 is not. An off-by-one here would truncate at the database instead");
    }

    /// <summary>AC-5. An unknown enum value is rejected, not coerced.</summary>
    /// <remarks>
    /// The status is what matters; the body's shape is `002b`'s, because model binding rejects
    /// this before any validator or handler runs and `UseStatusCodePages` is not registered yet.
    /// `tests.md` records that rather than a test pretending the envelope is verified.
    /// </remarks>
    [Fact]
    public async Task An_unknown_channel_is_rejected()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "s",
            description = "d",
            category = "Technical",
            channel = "Telegram",
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "Telegram is not one of the five channels in the product scope. Coercing it to the "
            + "first member would store a channel the customer never used");
    }

    /// <summary>AC-11. Concurrency, against a real sequence.</summary>
    /// <remarks>
    /// <b>Never against a fake.</b> The only reason a sequence exists is that a real one is
    /// atomic without a lock — a substituted generator would prove nothing about the thing under
    /// test. `research.md` made that argument and it survived the interface being reinstated.
    /// </remarks>
    [Fact]
    public async Task Concurrent_creates_receive_different_ticket_numbers()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var client = factory.CreateClient();

        var responses = await Task.WhenAll(
            Enumerable.Range(0, 8).Select(_ =>
                client.PostAsJsonAsync("/api/tickets", ValidBody(customerId))));

        responses.Should().AllSatisfy(response =>
            response.StatusCode.Should().Be(HttpStatusCode.Created));

        var numbers = new List<string>();

        foreach (var response in responses)
        {
            numbers.Add((await BodyOf(response)).GetProperty("ticketNumber").GetString()!);
        }

        numbers.Should().OnlyHaveUniqueItems(
            "AC-11. MAX(TicketNumber) + 1 would race here and one of the eight would collide "
            + "with the unique index");
    }

    /// <summary>AC-9, BR-1.8. The history row, in the same transaction.</summary>
    [Fact]
    public async Task A_created_history_row_is_written_with_the_same_instant_as_the_ticket()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/tickets", ValidBody(customerId));

        var ticketId = (await BodyOf(response)).GetProperty("id").GetGuid();

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var ticket = await context.Tickets.AsNoTracking()
            .SingleAsync(candidate => candidate.Id == ticketId);

        var history = await context.TicketHistory.AsNoTracking()
            .Where(entry => entry.TicketId == ticketId)
            .ToListAsync();

        history.Should().HaveCount(1, "one create, one Created row");
        history[0].EventType.Should().Be(TicketHistoryEventType.Created);
        history[0].NewValue.Should().Be("New");
        history[0].OldValue.Should().BeNull();

        // The point of IRequestTimestamp. Two callers of GetUtcNow() would differ by
        // microseconds — close enough to pass a loose assertion and wrong in a timeline whose
        // first entry appears to precede the thing it records.
        history[0].PerformedAtUtc.Should().Be(ticket.CreatedAtUtc,
            "AC-9 requires the same instant, and one scoped value is what makes them equal by "
            + "construction rather than by two components agreeing");
    }

    /// <summary>
    /// The stamps are applied by the DbContext, and excluded from the audit diff.
    /// </summary>
    /// <remarks>
    /// Both halves in one test because they are one decision. The stamps must be <b>set</b> —
    /// no handler writes them — and they must be <b>absent from <c>Changes</c></b>, because they
    /// are infrastructure rather than a change the actor made. Including them would put two
    /// timestamp entries in every audit row and bury the field that actually changed.
    /// </remarks>
    [Fact]
    public async Task The_stamps_are_applied_by_the_context_and_kept_out_of_the_audit_diff()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/tickets", ValidBody(customerId));

        var ticketId = (await BodyOf(response)).GetProperty("id").GetGuid();

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var ticket = await context.Tickets.AsNoTracking()
            .SingleAsync(candidate => candidate.Id == ticketId);

        // Set, and nothing in the handler or the factory set them.
        ticket.CreatedAtUtc.Should().NotBe(default);
        ticket.UpdatedAtUtc.Should().Be(ticket.CreatedAtUtc,
            "UpdatedAtUtc equals CreatedAtUtc on insert");
        ticket.CreatedAtUtc.Kind.Should().Be(DateTimeKind.Utc, "001's global converter");
        ticket.UpdatedByUserId.Should().BeNull(
            "nobody has updated it. Stamping the creator here would make 'who last touched "
            + "this' unanswerable");

        var audit = await context.AuditLog.AsNoTracking()
            .Where(entry => entry.Action == "Ticket.Created" && entry.EntityId == ticketId)
            .SingleAsync();

        audit.Outcome.Should().Be(AuditOutcome.Success);
        audit.Changes.Should().NotBeNull("the interceptor captured the insert");

        var fields = JsonDocument.Parse(audit.Changes!).RootElement.EnumerateArray()
            .Select(change => change.GetProperty("field").GetString())
            .ToArray();

        fields.Should().Contain("Subject", "the business fields are in the diff");
        fields.Should().NotContain("CreatedAtUtc")
            .And.NotContain("UpdatedAtUtc")
            .And.NotContain("CreatedByUserId")
            .And.NotContain("UpdatedByUserId",
                "the stamps are infrastructure. They are already columns on the audit row and on "
                + "the ticket; repeating them in every diff buries what changed");
    }

    /// <summary>The GET's own 404. Same envelope, no leak.</summary>
    [Fact]
    public async Task Reading_an_unknown_ticket_returns_404_as_problem_details()
    {
        var response = await factory.CreateClient().GetAsync($"/api/tickets/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/not-found");
    }

    /// <summary>AC-12's verifiable half, and Arabic through the whole stack.</summary>
    /// <remarks>
    /// <c>createdByUserId</c> is not a field on the command, so a value in the body has nowhere
    /// to arrive. That property holds whether or not authentication exists — which is why `009`
    /// can prove this half while the token half waits for `004`.
    /// </remarks>
    [Fact]
    public async Task A_created_by_in_the_body_is_ignored_and_arabic_round_trips()
    {
        const string arabic = "لا يمكنني تسجيل الدخول";

        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = arabic,
            description = "وصف المشكلة بالعربية",
            category = "Billing",
            channel = "Sms",
            createdByUserId = Guid.NewGuid(),
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await BodyOf(response);

        created.GetProperty("createdByUserId").ValueKind.Should().Be(JsonValueKind.Null,
            "AC-12 — the body is never the source. There is no field to bind it to");
        created.GetProperty("subject").GetString().Should().Be(arabic,
            "nvarchar end to end. varchar would return ???? and look like a font bug");
        created.GetProperty("channel").GetString().Should().Be("Sms",
            "one of the five channels in the product scope, as a string on the wire");
    }
}
