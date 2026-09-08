using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Domain.Audit;
using Wasl.Domain.Communications;
using Wasl.Infrastructure.Communications;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Communications;

/// <summary>
/// <c>POST /api/tickets/{ticketId}/messages</c> and its two reads, through the real pipeline. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Several of these assert what the PROVIDER saw, not only what the response said</b>, by
/// reading <see cref="SentMessageBuffer"/>. That is the only way to check the contract's central
/// promise — *"nothing leaves the process for a request that was going to be refused"* — because
/// a `403` and a `403`-after-sending look identical from outside.
/// </para>
/// <para>
/// <b>Every assertion is scoped by ticket id or audit action.</b> One <c>ICollectionFixture</c>
/// means one container and one database shared with every other integration class, so a
/// <c>COUNT(*)</c> over <c>dbo.Interactions</c> would pass or fail depending on which tests ran
/// first.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class SendMessageTests(WaslApiFactory factory)
{
    private const string AuditAction = "Communication.MessageSent";

    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>
    /// A UNIQUE E.164 number per seeded customer.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>A constant here was this file's first defect, and BR-4.8's filtered unique index on
    /// <c>PhoneE164</c> caught it</b> — the second seeded customer threw
    /// <c>DuplicateValueException: Error.Customer.DuplicatePhone</c> and took eleven tests with
    /// it. The index doing its job, on a test that had no business creating two customers with
    /// one phone number.
    /// </para>
    /// <para>
    /// <c>RandomNumberGenerator</c> and not a <c>Guid</c> slice, which is `CLAUDE.md`'s rule and
    /// the reason it is a rule: <c>Guid.CreateVersion7()</c> leads with a timestamp, so two minted
    /// milliseconds apart share their leading digits — `007` collided two customers on this exact
    /// index that way, and `008` matched the wrong row with a seven-character prefix.
    /// </para>
    /// <para>
    /// Nine digits after <c>+9665</c> keeps it inside E.164's fifteen.
    /// </para>
    /// </remarks>
    private static string UniquePhone() =>
        $"+9665{System.Security.Cryptography.RandomNumberGenerator.GetInt32(10_000_000, 99_999_999)}";

    /// <summary>
    /// A ticket whose customer has an email, and optionally a phone.
    /// </summary>
    /// <remarks>
    /// Created through the real <c>POST /api/tickets</c>. `CLAUDE.md` records three defects that
    /// came from writing an entity from outside its real path, and a ticket inserted with SQL
    /// would be this feature's fourth.
    /// </remarks>
    private async Task<(Guid TicketId, string? Phone)> NewTicketAsync(
        bool withPhone = true, bool email = true)
    {
        var phone = withPhone ? UniquePhone() : null;

        var customerId = await AuditFixture.SeedCustomerAsync(
            factory, phone: phone, email: email);

        var response = await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Message test",
            description = "Created so a ticket exists to send a message on.",
            category = "Technical",
            channel = "Email",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        return ((await BodyOf(response)).GetProperty("id").GetGuid(), phone);
    }

    /// <summary>The common case: a ticket whose customer has both an email and a phone.</summary>
    private async Task<Guid> NewTicketIdAsync() => (await NewTicketAsync()).TicketId;

    private static Task<HttpResponseMessage> SendAsync(
        HttpClient client, Guid ticketId, string channel, string body) =>
        client.PostAsJsonAsync($"/api/tickets/{ticketId}/messages", new { channel, body });

    /// <summary>The provider's buffer, emptied first so "the provider was not called" is real.</summary>
    private SentMessageBuffer FreshBuffer()
    {
        var buffer = factory.Services.GetRequiredService<SentMessageBuffer>();
        buffer.Clear();

        return buffer;
    }

    private async Task<List<Interaction>> RowsForAsync(Guid ticketId)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        // Scoped to ONE ticket. The table is shared with every other integration class.
        return await context.Interactions
            .AsNoTracking()
            .Where(interaction => interaction.TicketId == ticketId)
            .OrderBy(interaction => interaction.CreatedAtUtc)
            .ToListAsync(CancellationToken.None);
    }

    private async Task<Guid> ManagerIdAsync()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.SupportUsers
            .Where(user => user.Role == Domain.Users.SupportRole.Manager)
            .Select(user => user.Id)
            .FirstAsync();
    }

    // ── AC-1, AC-2. The happy path, and what the provider received ──────────────

    /// <summary>AC-1. The whole `201` body, against the frozen contract's example shape.</summary>
    [Fact]
    public async Task A_manager_sends_on_a_registered_channel()
    {
        var ticketId = await NewTicketIdAsync();
        FreshBuffer();

        var response = await SendAsync(
            factory.CreateManagerClient(), ticketId, "Email", "Your invoice has been corrected.");

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await BodyOf(response);

        body.GetProperty("ticketId").GetGuid().Should().Be(ticketId);
        body.GetProperty("direction").GetString().Should().Be("Outbound");
        body.GetProperty("channel").GetString().Should().Be("Email");
        body.GetProperty("body").GetString().Should().Be("Your invoice has been corrected.");
        body.GetProperty("providerName").GetString().Should().Be("Mock");
        body.GetProperty("deliveryStatus").GetString().Should().Be("Accepted");
        body.GetProperty("failureCode").ValueKind.Should().Be(JsonValueKind.Null);
        body.GetProperty("sentByUserId").GetGuid().Should().Be(await ManagerIdAsync());

        body.GetProperty("providerMessageId").GetString().Should()
            .NotBeNullOrWhiteSpace()
            .And.StartWith(
                "mock-",
                "a provider message id is quoted in support conversations, and one obviously from "
                + "the mock cannot be mistaken for a real carrier's receipt");

        // The recipient is RESOLVED, never sent — the request body has no recipient field.
        body.GetProperty("recipientAddress").GetString().Should()
            .EndWith("@example.com", "resolved from the ticket's customer (spec A-5)");

        (await RowsForAsync(ticketId)).Should().ContainSingle("AC-1 — exactly one new row");
    }

    /// <summary>
    /// AC-1. No <c>Location</c> header, and that is the recorded deviation.
    /// </summary>
    /// <remarks>
    /// There is no single-interaction resource to point at, and inventing
    /// <c>GET /api/tickets/{id}/interactions/{interactionId}</c> to satisfy a header would be an
    /// endpoint with no caller. Asserted rather than left implicit, because `013`'s comment
    /// endpoint DOES send one (pointing at the timeline) and a reader comparing the two needs the
    /// difference to be deliberate.
    /// </remarks>
    [Fact]
    public async Task The_created_response_carries_no_location_header()
    {
        var ticketId = await NewTicketIdAsync();

        var response = await SendAsync(
            factory.CreateManagerClient(), ticketId, "Email", "No location.");

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location.Should().BeNull();
    }

    /// <summary>AC-2. The mock received exactly what the handler resolved, byte for byte.</summary>
    /// <remarks>
    /// <b>Including Arabic</b>, which is what a `varchar` column or a lossy log would destroy. The
    /// buffer holds the <c>OutboundMessage</c> verbatim rather than a flattened copy, so this
    /// compares the object the provider was handed.
    /// </remarks>
    [Fact]
    public async Task The_provider_receives_the_body_and_recipient_byte_identical()
    {
        const string arabic = "تم تصحيح فاتورتك. نعتذر عن التأخير.";

        var ticketId = await NewTicketIdAsync();
        var buffer = FreshBuffer();

        var response = await SendAsync(factory.CreateManagerClient(), ticketId, "Email", arabic);

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var recorded = buffer.Snapshot().Should().ContainSingle().Subject;

        recorded.Message.Body.Should().Be(arabic);
        recorded.Message.Channel.Should().Be(CommunicationChannel.Email);
        recorded.ProviderName.Should().Be("Mock");

        recorded.Message.RecipientAddress.Should().Be(
            (await BodyOf(response)).GetProperty("recipientAddress").GetString(),
            "the address the provider saw is the address the response reports");
    }

    /// <summary>AC-10. Arabic round-trips through the database, not just through memory.</summary>
    /// <remarks>
    /// <b>This is the test that catches `varchar`</b> — it would return `????`, which presents as
    /// a font problem rather than as a column type (ADR-013). Read back through a fresh scope so
    /// the assertion cannot be satisfied by the change tracker's in-memory copy.
    /// </remarks>
    [Fact]
    public async Task Arabic_round_trips_through_the_database()
    {
        const string arabic = "العميل يطلب تحويل الفاتورة إلى الرقم الضريبي الجديد ٣٠١٢٣٤٥٦٧٨٩٠٠٠٣";

        var ticketId = await NewTicketIdAsync();

        (await SendAsync(factory.CreateManagerClient(), ticketId, "Email", arabic))
            .StatusCode.Should().Be(HttpStatusCode.Created);

        var row = (await RowsForAsync(ticketId)).Should().ContainSingle().Subject;

        row.Body.Should().Be(arabic);
        row.Body.Length.Should().Be(arabic.Length, "no truncation and no re-encoding");
    }

    // ── AC-3, AC-4. The registry decides what is sendable ───────────────────────

    /// <summary>AC-3. A valid channel with no provider is a `400`, naming the field.</summary>
    /// <remarks>
    /// <b>A `400` and not a `409`</b>: sendability is a property of the request VALUE — `LiveChat`
    /// is never sendable for anybody — while a closed ticket and a missing address are properties
    /// of STATE. Getting it wrong would make a client retry a `409` that can never succeed.
    /// </remarks>
    [Theory]
    [InlineData("LiveChat")]
    [InlineData("WebForm")]
    public async Task A_channel_with_no_provider_is_refused_before_the_handler(string channel)
    {
        var ticketId = await NewTicketIdAsync();
        var buffer = FreshBuffer();

        var response = await SendAsync(
            factory.CreateManagerClient(), ticketId, channel, "Is anyone there?");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await BodyOf(response);

        body.GetProperty("type").GetString().Should().EndWith("/errors/validation");

        // READ THE MESSAGE. `004b` found seventeen raw resource keys shipping under assertions
        // that only counted entries under the right field name.
        var messages = body.GetProperty("errors").GetProperty("channel").EnumerateArray()
            .Select(entry => entry.GetString()!)
            .ToList();

        messages.Should().ContainSingle().Which.Should().NotMatchRegex(
            @"^(Error|Validation)\.[A-Za-z.]+$", "a raw resource key would render verbatim");

        // THE MESSAGE DOES NOT ENUMERATE THE SENDABLE SET. The client has that list from
        // GET /api/communications/channels, and duplicating it puts one fact in two catalogues.
        messages[0].Should().NotContain("Email").And.NotContain("WhatsApp");

        buffer.Snapshot().Should().BeEmpty("refused before the handler, so no provider was called");
        (await RowsForAsync(ticketId)).Should().BeEmpty();
    }

    [Fact]
    public async Task A_value_outside_the_channel_enum_is_a_validation_failure()
    {
        var ticketId = await NewTicketIdAsync();

        var response = await factory.CreateManagerClient().PostAsJsonAsync(
            $"/api/tickets/{ticketId}/messages",
            new { channel = "CarrierPigeon", body = "Coo." });

        response.StatusCode.Should().Be(
            HttpStatusCode.BadRequest,
            "and it names the field rather than an exception type — `002b`'s malformed-vs-invalid "
            + "split means an unparseable enum VALUE stays errors/validation");
    }

    /// <summary>AC-4. The channels endpoint is a projection of the registry.</summary>
    [Fact]
    public async Task The_channels_endpoint_reports_the_three_registered_channels()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync("/api/communications/channels");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var channels = (await BodyOf(response)).GetProperty("sendableChannels")
            .EnumerateArray()
            .Select(entry => entry.GetString()!)
            .ToList();

        channels.Should().Equal(
            ["Email", "WhatsApp", "Sms"],
            "in CommunicationChannel's declaration order, so the response is stable between "
            + "restarts rather than dependent on DI registration order");
    }

    /// <summary>An Agent may read the channel list — it is a deployment fact, not a ticket's.</summary>
    [Fact]
    public async Task An_agent_may_read_the_channel_list()
    {
        (await factory.CreateAgentClient().GetAsync("/api/communications/channels"))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── AC-11, AC-12, AC-13. Refused BEFORE the provider ───────────────────────

    /// <summary>AC-11. A closed ticket is a `409`, and nothing is sent.</summary>
    [Fact]
    public async Task A_closed_ticket_is_refused_and_the_provider_is_not_called()
    {
        var ticketId = await NewTicketIdAsync();
        var client = factory.CreateManagerClient();

        // Through the real endpoints. New → Closed is permitted by BR-1 and needs a note (BR-1.2).
        var detail = await BodyOf(await client.GetAsync($"/api/tickets/{ticketId}"));

        var closed = await client.PutAsJsonAsync(
            $"/api/tickets/{ticketId}/status",
            new
            {
                status = "Closed",
                note = "Closing so a message can be refused.",
                expectedVersion = detail.GetProperty("version").GetString(),
            });

        closed.StatusCode.Should().Be(HttpStatusCode.OK);

        var buffer = FreshBuffer();

        var response = await SendAsync(client, ticketId, "Email", "Too late.");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString().Should()
            .EndWith("/errors/ticket-closed");

        buffer.Snapshot().Should().BeEmpty(
            "the guard runs before the send, so nothing leaves the process for a ticket that "
            + "cannot receive a reply");

        (await RowsForAsync(ticketId)).Should().BeEmpty();
    }

    /// <summary>AC-12. No address for the channel is a `409` carrying `errors.channel`.</summary>
    /// <remarks>
    /// <b>The seeded customer has an email and no phone</b>, which BR-4.1 explicitly allows — so
    /// this is normal data rather than a broken fixture, and asking to SMS them is not a `400`.
    /// </remarks>
    [Fact]
    public async Task A_customer_with_no_phone_cannot_be_sent_an_sms()
    {
        var ticketId = (await NewTicketAsync(withPhone: false)).TicketId;
        var buffer = FreshBuffer();

        var response = await SendAsync(
            factory.CreateManagerClient(), ticketId, "Sms", "Your invoice has been corrected.");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var body = await BodyOf(response);

        body.GetProperty("type").GetString().Should().EndWith("/errors/no-contact-for-channel");

        // It carries `errors` even though it is a 409 — the remedy is to change the channel, so
        // the message belongs on that control.
        var messages = body.GetProperty("errors").GetProperty("channel").EnumerateArray()
            .Select(entry => entry.GetString()!)
            .ToList();

        messages.Should().ContainSingle().Which.Should().NotMatchRegex(
            @"^(Error|Validation)\.[A-Za-z.]+$");

        /* AND IT DOES NOT NAME THE ADDRESS THE CUSTOMER DOES HAVE.
         *
         * The remedy is "pick another channel or edit the customer"; enumerating contact details
         * into an error response is a leak with no purpose (NFR-4), and the same restraint BR-4.7
         * keeps. The seeded email is `probe-{guid}@example.com`, so a leak would be visible. */
        var whole = await response.Content.ReadAsStringAsync();
        whole.Should().NotContain("@example.com", "the body must not disclose the email");

        buffer.Snapshot().Should().BeEmpty("an empty recipient never reaches a provider");
        (await RowsForAsync(ticketId)).Should().BeEmpty();
    }

    /// <summary>The mirror case — an SMS-only customer asked to receive an email.</summary>
    [Fact]
    public async Task A_customer_with_no_email_cannot_be_sent_an_email()
    {
        var ticketId = (await NewTicketAsync(email: false)).TicketId;

        var response = await SendAsync(
            factory.CreateManagerClient(), ticketId, "Email", "Hello?");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString().Should()
            .EndWith("/errors/no-contact-for-channel");
    }

    /// <summary>WhatsApp and SMS both resolve to the phone. One map, in one place.</summary>
    [Theory]
    [InlineData("WhatsApp")]
    [InlineData("Sms")]
    public async Task A_phone_channel_resolves_to_the_customers_phone(string channel)
    {
        var (ticketId, phone) = await NewTicketAsync();

        var response = await SendAsync(
            factory.CreateManagerClient(), ticketId, channel, "Your invoice is ready.");

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        (await BodyOf(response)).GetProperty("recipientAddress").GetString().Should().Be(phone);
    }

    /// <summary>AC-13, Q-A. An Agent on someone else's ticket is `403`, and it is audited.</summary>
    [Fact]
    public async Task An_agent_cannot_send_on_a_ticket_assigned_to_someone_else()
    {
        var ticketId = await NewTicketIdAsync();
        var client = factory.CreateManagerClient();

        var detail = await BodyOf(await client.GetAsync($"/api/tickets/{ticketId}"));

        // Assigned to the MANAGER, so the Agent is a third party to it.
        var assigned = await client.PutAsJsonAsync(
            $"/api/tickets/{ticketId}/assignee",
            new
            {
                assigneeId = await ManagerIdAsync(),
                expectedVersion = detail.GetProperty("version").GetString(),
            });

        assigned.StatusCode.Should().Be(HttpStatusCode.OK);

        var buffer = FreshBuffer();
        var before = (await AuditFixture.RowsForAsync(factory, AuditAction)).Count;

        var response = await SendAsync(
            factory.CreateAgentClient(), ticketId, "Email", "Not my ticket.");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var body = await BodyOf(response);
        body.GetProperty("type").GetString().Should().EndWith("/errors/forbidden");

        buffer.Snapshot().Should().BeEmpty();
        (await RowsForAsync(ticketId)).Should().BeEmpty();

        /* AC-13's audit half, and it is BR-6's measured consequence.
         *
         * The check is in the HANDLER, so a ForbiddenException reaches AuditBehaviour, which
         * classifies it Denied and writes an independent row. Had the rule been a policy on the
         * endpoint, MediatR would never have seen it and no row would exist — `011` measured
         * exactly that, and `004` AC-18 records it. */
        var rows = await AuditFixture.RowsForAsync(factory, AuditAction);

        rows.Count.Should().BeGreaterThan(before, "a denial writes its own row");

        rows.Should().Contain(
            entry => entry.EntityId == ticketId && entry.Outcome == AuditOutcome.Denied,
            "targeted at the TICKET, because no interaction exists to target");
    }

    /// <summary>Q-A's other half: an Agent may send on their own ticket, and on an unassigned one.</summary>
    /// <remarks>
    /// <b>Both halves are needed.</b> Asserting only the refusal above would pass on an endpoint
    /// that refused every Agent — which is what a <c>ManagerOnly</c> policy would do, and which
    /// would break the ordinary case of an agent replying to their own customer.
    /// </remarks>
    [Fact]
    public async Task An_agent_may_send_on_an_unassigned_ticket()
    {
        var ticketId = await NewTicketIdAsync();

        var response = await SendAsync(
            factory.CreateAgentClient(), ticketId, "Email", "Picking this up now.");

        response.StatusCode.Should().Be(
            HttpStatusCode.Created,
            "an unassigned ticket is genuinely unowned, and refusing it would stop an agent "
            + "replying on a ticket they are actively triaging");
    }

    // ── AC-14, AC-15. Token and id ─────────────────────────────────────────────

    [Fact]
    public async Task A_request_with_no_token_never_reaches_the_registry()
    {
        var ticketId = await NewTicketIdAsync();
        var buffer = FreshBuffer();

        var response = await factory.CreateClient().PostAsJsonAsync(
            $"/api/tickets/{ticketId}/messages",
            new { channel = "Email", body = "No token." });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await BodyOf(response)).GetProperty("type").GetString().Should()
            .EndWith("/errors/unauthenticated");

        buffer.Snapshot().Should().BeEmpty();
    }

    /// <summary>AC-15. An unknown ticket is `404` — not `400`, not `409`.</summary>
    [Fact]
    public async Task An_unknown_ticket_is_not_found()
    {
        var response = await SendAsync(
            factory.CreateManagerClient(), Guid.NewGuid(), "Email", "Anyone?");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await BodyOf(response)).GetProperty("type").GetString().Should()
            .EndWith("/errors/not-found");
    }

    /// <summary>
    /// An Agent also gets `404` for an unknown id here — unlike `016`'s escalate.
    /// </summary>
    /// <remarks>
    /// <b>The difference is deliberate and worth pinning.</b> `016` puts a <c>ManagerOnly</c>
    /// policy on the endpoint, so an Agent is refused before any lookup and learns nothing about
    /// which ids exist. This endpoint cannot have that policy — Q-A lets an Agent send on their
    /// own tickets — so the ticket must be loaded before the rule can be applied.
    /// <para>
    /// That is not a disclosure regression: <c>GET /api/tickets/{id}</c> already returns any
    /// ticket to any support user, so an id's existence was never a secret from an Agent.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task An_agent_gets_not_found_for_an_unknown_id_here()
    {
        var response = await SendAsync(
            factory.CreateAgentClient(), Guid.NewGuid(), "Email", "Does this exist?");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Validation boundaries ──────────────────────────────────────────────────

    [Theory]
    [InlineData("", "an empty body")]
    [InlineData("   ", "whitespace only — measured after trimming")]
    public async Task An_empty_body_is_rejected(string body, string because)
    {
        var ticketId = await NewTicketIdAsync();

        var response = await SendAsync(factory.CreateManagerClient(), ticketId, "Email", body);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest, because);

        (await BodyOf(response)).GetProperty("errors")
            .TryGetProperty("body", out _).Should().BeTrue();
    }

    /// <summary>4000 exactly is accepted; 4001 is a `400`. The boundary in both directions.</summary>
    /// <remarks>
    /// <c>nvarchar(4000)</c> truncating silently would look like a successful send of a shortened
    /// message — which the customer receives and the agent never sees.
    /// </remarks>
    [Fact]
    public async Task A_body_at_the_maximum_is_accepted_and_one_over_is_rejected()
    {
        var ticketId = await NewTicketIdAsync();
        var client = factory.CreateManagerClient();

        var atLimit = new string('x', Interaction.BodyMaxLength);

        var accepted = await SendAsync(client, ticketId, "Email", atLimit);
        accepted.StatusCode.Should().Be(HttpStatusCode.Created);
        (await BodyOf(accepted)).GetProperty("body").GetString().Should().Be(atLimit);

        var refused = await SendAsync(
            client, ticketId, "Email", new string('x', Interaction.BodyMaxLength + 1));

        refused.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>4000 plus trailing whitespace is accepted, and stored trimmed.</summary>
    [Fact]
    public async Task A_body_at_the_maximum_plus_trailing_space_is_accepted()
    {
        var ticketId = await NewTicketIdAsync();
        var body = new string('x', Interaction.BodyMaxLength);

        var response = await SendAsync(
            factory.CreateManagerClient(), ticketId, "Email", body + "   ");

        response.StatusCode.Should().Be(
            HttpStatusCode.Created,
            "the length is measured AFTER trimming — a textarea appends a newline when somebody "
            + "presses Enter, and refusing that is a failure the user cannot see the cause of");

        (await BodyOf(response)).GetProperty("body").GetString().Should().Be(body);
    }

    // ── AC-16. The audit row ───────────────────────────────────────────────────

    /// <summary>AC-16. One row, in the same transaction, and NOT carrying the message body.</summary>
    /// <remarks>
    /// <b>The body is excluded by the same reasoning that excludes a comment body</b> (BR-9.7):
    /// the trail records that a message was sent, never its text. `016` had just found that rule's
    /// literal list missing a case — an escalation reason — so this asserts the outcome rather
    /// than trusting the list.
    /// </remarks>
    [Fact]
    public async Task A_successful_send_writes_one_audit_row_without_the_body()
    {
        const string distinctive = "Rickshaw-Zephyr-Quokka-41";

        var ticketId = await NewTicketIdAsync();

        (await SendAsync(factory.CreateManagerClient(), ticketId, "Email", distinctive))
            .StatusCode.Should().Be(HttpStatusCode.Created);

        var rows = (await AuditFixture.RowsForAsync(factory, AuditAction))
            .Where(entry => entry.EntityId == ticketId)
            .ToList();

        var row = rows.Should().ContainSingle("one command, one row").Subject;

        row.Outcome.Should().Be(AuditOutcome.Success);
        row.ActorUserId.Should().Be(await ManagerIdAsync());
        row.ActorRole.Should().Be("Manager");

        // The interaction's id, so the row is traceable to the exact message.
        var interaction = (await RowsForAsync(ticketId)).Should().ContainSingle().Subject;
        row.EntityLabel.Should().Be(interaction.Id.ToString());

        // ASSERT CONTENT, NOT PRESENCE.
        row.Changes.Should().NotBeNullOrWhiteSpace();

        /* BR-9.7, AND THIS ASSERTION FOUND A REAL DEFECT ON ITS FIRST RUN.
         *
         * `Interaction.Body` was going into `Changes` in full. BR-9.7's list is five literal
         * things — a password, a hash, a token, a signing key, a full comment body — and an
         * outbound message is none of them, so nothing had ever redacted it. That is the THIRD
         * time this list has been found short, after `016`'s escalation reason.
         *
         * Checks the PLACEHOLDER rather than only the absence of the text: a diff that dropped the
         * field entirely would satisfy `NotContain` while losing the fact that a message had a
         * body at all, and BR-9.7 keeps the field name for exactly that reason. */
        row.Changes!.Should().NotContain(
            distinctive,
            "the message text belongs on the interaction the panel renders, not in the audit "
            + "diff (BR-9.7, by the same reasoning that excludes a comment body)");

        var changes = JsonSerializer.Deserialize<List<AuditFieldChange>>(
            row.Changes, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        changes.Should().Contain(
            change => change.Field == nameof(Interaction.Body)
                && change.After == AuditRedaction.Placeholder,
            "the field NAME survives redaction — that a message had a body is auditable, the "
            + "text is not");

        /* AC-16's positive half: what the row MUST carry. Asserted by field name rather than by
         * a substring over the whole JSON, because "Email" appears in a recipient address too. */
        foreach (var required in new[]
        {
            nameof(Interaction.Channel),
            nameof(Interaction.RecipientAddress),
            nameof(Interaction.DeliveryStatus),
        })
        {
            changes.Should().Contain(
                change => change.Field == required,
                $"AC-16 requires `{required}` in the diff — an auditor asking where a message "
                + "went and whether it arrived must be able to answer from the trail");
        }
    }

    // ── AC-19, AC-20. The read ─────────────────────────────────────────────────

    /// <summary>AC-19. Oldest first, and the item shape equals the `201` shape.</summary>
    [Fact]
    public async Task The_read_returns_the_conversation_oldest_first()
    {
        var ticketId = await NewTicketIdAsync();
        var client = factory.CreateManagerClient();

        var first = await BodyOf(await SendAsync(client, ticketId, "Email", "First message."));
        var second = await BodyOf(await SendAsync(client, ticketId, "Email", "Second message."));

        var page = await BodyOf(await client.GetAsync($"/api/tickets/{ticketId}/interactions"));

        var items = page.GetProperty("items").EnumerateArray().ToList();

        items.Select(item => item.GetProperty("body").GetString())
            .Should().Equal(["First message.", "Second message."],
                "ascending by createdAtUtc — the reading order of a conversation");

        page.GetProperty("totalCount").GetInt32().Should().Be(2);
        page.GetProperty("page").GetInt32().Should().Be(1);
        page.GetProperty("pageSize").GetInt32().Should().Be(20);
        page.GetProperty("totalPages").GetInt32().Should().Be(1);

        /* THE ITEM SHAPE IS BYTE-FOR-BYTE THE `201` SHAPE — the contract promises it so the
         * client has one type and one renderer. A field-by-field comparison would walk past a
         * precision difference in `createdAtUtc`, which is exactly what `007` AC-14 caught
         * between a create and a read. */
        items[0].GetRawText().Should().Be(first.GetRawText());
        items[1].GetRawText().Should().Be(second.GetRawText());
    }

    /// <summary>AC-20. No interactions is an empty `200`, never a `404`.</summary>
    [Fact]
    public async Task A_ticket_with_no_interactions_returns_an_empty_page()
    {
        var ticketId = await NewTicketIdAsync();

        var response = await factory.CreateManagerClient()
            .GetAsync($"/api/tickets/{ticketId}/interactions");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await BodyOf(response);

        body.GetProperty("items").EnumerateArray().Should().BeEmpty();
        body.GetProperty("totalCount").GetInt32().Should().Be(0);
        body.GetProperty("totalPages").GetInt32().Should().Be(
            0, "claiming one page of nothing invites a client to render an empty pager");
    }

    /// <summary>AC-19. `pageSize` is clamped, never rejected (BR-7.2).</summary>
    [Fact]
    public async Task An_oversized_page_size_is_clamped_and_not_rejected()
    {
        var ticketId = await NewTicketIdAsync();

        var response = await factory.CreateManagerClient()
            .GetAsync($"/api/tickets/{ticketId}/interactions?page=0&pageSize=5000");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await BodyOf(response);

        body.GetProperty("pageSize").GetInt32().Should().Be(100, "clamped to the maximum");
        body.GetProperty("page").GetInt32().Should().Be(1, "page 0 clamps up to 1");
    }

    /// <summary>An unknown ticket is `404` on the read too — distinguishable from an empty list.</summary>
    /// <remarks>
    /// Without the existence check, an unknown id and a ticket with no messages would both return
    /// <c>items: []</c> — and a client showing "no messages yet" for a ticket that does not exist
    /// is a bug that survives a demo.
    /// </remarks>
    [Fact]
    public async Task Reading_an_unknown_tickets_interactions_is_not_found()
    {
        var response = await factory.CreateManagerClient()
            .GetAsync($"/api/tickets/{Guid.NewGuid()}/interactions");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>Reading is not assignment-sensitive, unlike sending.</summary>
    [Fact]
    public async Task An_agent_may_read_interactions_on_any_ticket()
    {
        var ticketId = await NewTicketIdAsync();
        var client = factory.CreateManagerClient();

        var detail = await BodyOf(await client.GetAsync($"/api/tickets/{ticketId}"));

        (await client.PutAsJsonAsync(
            $"/api/tickets/{ticketId}/assignee",
            new
            {
                assigneeId = await ManagerIdAsync(),
                expectedVersion = detail.GetProperty("version").GetString(),
            })).StatusCode.Should().Be(HttpStatusCode.OK);

        (await SendAsync(client, ticketId, "Email", "Sent by the manager."))
            .StatusCode.Should().Be(HttpStatusCode.Created);

        var response = await factory.CreateAgentClient()
            .GetAsync($"/api/tickets/{ticketId}/interactions");

        response.StatusCode.Should().Be(
            HttpStatusCode.OK,
            "BR-6 lets every support user see every ticket, and interactions are part of a "
            + "ticket. Sending creates something a customer sees; reading does not");

        (await BodyOf(response)).GetProperty("items").EnumerateArray().Should().ContainSingle();
    }

    // ── Not idempotent, deliberately ───────────────────────────────────────────

    /// <summary>Two identical submissions are two messages and two `201`s.</summary>
    /// <remarks>
    /// <b>Asserted rather than left implicit</b>, because it is the opposite of `036`'s decision
    /// for <c>POST /api/tickets</c>. Deduplicating an outbound message means guessing whether the
    /// user meant to send it twice, and a swallowed second message is worse than a duplicate one:
    /// the customer sees neither, and the agent believes they sent it.
    /// </remarks>
    [Fact]
    public async Task The_same_message_sent_twice_produces_two_rows()
    {
        var ticketId = await NewTicketIdAsync();
        var client = factory.CreateManagerClient();

        (await SendAsync(client, ticketId, "Email", "Identical.")).StatusCode
            .Should().Be(HttpStatusCode.Created);
        (await SendAsync(client, ticketId, "Email", "Identical.")).StatusCode
            .Should().Be(HttpStatusCode.Created);

        (await RowsForAsync(ticketId)).Should().HaveCount(2);
    }
}
