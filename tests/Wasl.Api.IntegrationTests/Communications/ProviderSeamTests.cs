using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Communications;
using Wasl.Infrastructure.Communications;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Communications;

/// <summary>
/// The claims that need a differently-configured host: AC-6, AC-7, AC-9, AC-17, AC-24. `021`.
/// </summary>
/// <remarks>
/// <b>Each of these builds a SECOND host with <c>WithWebHostBuilder</c></b> — the pattern `036`
/// established to lower a rate limit for the limiter's own tests, and `020b` reused for a throwing
/// capture. The shared fixture keeps the real configuration, so no other test sees a failing
/// channel or a stub provider.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class ProviderSeamTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static string UniquePhone() =>
        $"+9665{System.Security.Cryptography.RandomNumberGenerator.GetInt32(10_000_000, 99_999_999)}";

    private async Task<Guid> NewTicketAsync()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory, phone: UniquePhone());

        var response = await factory.CreateManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Seam test",
            description = "Created so a ticket exists to send a message on.",
            category = "Technical",
            channel = "Email",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        return (await BodyOf(response)).GetProperty("id").GetGuid();
    }

    private async Task<List<Interaction>> RowsForAsync(Guid ticketId)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.Interactions
            .AsNoTracking()
            .Where(interaction => interaction.TicketId == ticketId)
            .ToListAsync(CancellationToken.None);
    }

    // ── AC-6, AC-7. The failure path, reachable by configuration only ───────────

    /// <summary>
    /// AC-7. A refused send is a `201` with <c>Failed</c>, and <b>the row persists</b>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The feature's central decision, and the one most likely to be "corrected" by somebody
    /// who reads it as `200`-with-an-error-in-the-body.</b> It is not: the request succeeded in
    /// recording an attempt, and the attempt is the resource. A `5xx` would unwind the transaction
    /// and take the record with it, leaving a support agent nothing to show for a message they
    /// tried to send.
    /// </para>
    /// <para>
    /// <b>Configured through <c>UseSetting</c>, which is AC-6.</b> There is no request field, no
    /// header, no query parameter and no body token that can reach this path — a
    /// request-controlled failure switch would ship, be reachable by any authenticated caller,
    /// and be indistinguishable from a bug when it fired.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_configured_failure_is_a_201_that_keeps_the_row()
    {
        var ticketId = await NewTicketAsync();

        using var host = factory.WithWebHostBuilder(builder =>
            builder.UseSetting("Communications:Mock:FailChannels:0", nameof(CommunicationChannel.Email)));

        var client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.ManagerToken);

        var response = await client.PostAsJsonAsync(
            $"/api/tickets/{ticketId}/messages",
            new { channel = "Email", body = "This one will be refused." });

        response.StatusCode.Should().Be(
            HttpStatusCode.Created,
            "the attempt is the resource — a 5xx would roll back the record of it");

        var body = await BodyOf(response);

        body.GetProperty("deliveryStatus").GetString().Should().Be("Failed");
        body.GetProperty("failureCode").GetString().Should().Be("MockConfiguredFailure");
        body.GetProperty("providerMessageId").ValueKind.Should().Be(JsonValueKind.Null);

        // THE ROW PERSISTS. Read through the shared fixture's own scope, so this is the committed
        // state and not the second host's change tracker.
        var row = (await RowsForAsync(ticketId)).Should().ContainSingle().Subject;

        row.DeliveryStatus.Should().Be(DeliveryStatus.Failed);
        row.FailureCode.Should().Be("MockConfiguredFailure");
        row.ProviderMessageId.Should().BeNull();
        row.Body.Should().Be("This one will be refused.", "the message is kept, not discarded");
    }

    /// <summary>
    /// AC-6. With the default configuration, nothing fails.
    /// </summary>
    /// <remarks>
    /// The other half of the same criterion, and it is the half that would catch a default of
    /// "fail everything" left behind by a demo. The shared fixture sets no <c>FailChannels</c>.
    /// </remarks>
    [Fact]
    public async Task With_the_default_configuration_no_channel_fails()
    {
        var ticketId = await NewTicketAsync();

        var response = await factory.CreateManagerClient().PostAsJsonAsync(
            $"/api/tickets/{ticketId}/messages",
            new { channel = "Email", body = "Default configuration." });

        (await BodyOf(response)).GetProperty("deliveryStatus").GetString().Should().Be("Accepted");
    }

    /// <summary>
    /// AC-6. Only the configured channel fails; its neighbour on the same ticket still works.
    /// </summary>
    /// <remarks>
    /// This is why <c>FailChannels</c> is a list rather than a boolean: the interesting demo is a
    /// customer for whom email works and SMS does not, which is a state a real deployment can
    /// actually have. A global switch would make every channel fail together.
    /// </remarks>
    [Fact]
    public async Task Only_the_configured_channel_fails()
    {
        var ticketId = await NewTicketAsync();

        using var host = factory.WithWebHostBuilder(builder =>
            builder.UseSetting("Communications:Mock:FailChannels:0", nameof(CommunicationChannel.Sms)));

        var client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.ManagerToken);

        var sms = await client.PostAsJsonAsync(
            $"/api/tickets/{ticketId}/messages", new { channel = "Sms", body = "Refused." });

        var email = await client.PostAsJsonAsync(
            $"/api/tickets/{ticketId}/messages", new { channel = "Email", body = "Accepted." });

        (await BodyOf(sms)).GetProperty("deliveryStatus").GetString().Should().Be("Failed");
        (await BodyOf(email)).GetProperty("deliveryStatus").GetString().Should().Be("Accepted");
    }

    // ── AC-24. The seam's claim, proven ────────────────────────────────────────

    /// <summary>
    /// A provider serving a channel the mock does not, routed to instead. <b>AC-24.</b>
    /// </summary>
    /// <remarks>
    /// <b>`LiveChat` is chosen precisely because production registers nothing for it</b> — spec
    /// A-3 says it has no outbound address — so this test cannot pass by accident, and it proves
    /// three things at once that AC-4 and AC-24 ask for separately:
    /// <list type="number">
    /// <item>the channel becomes sendable (the validator accepts it, with no edit to the validator)</item>
    /// <item>it appears in <c>GET /api/communications/channels</c>, with no edit to that handler</item>
    /// <item>the stub is what handles it, evidenced by <c>providerName</c> on the row</item>
    /// </list>
    /// <para>
    /// <b>The diff needed to make this pass was one class and one registration line.</b> No edit
    /// to the controller, the command, the handler, the validator, the response, the contract or
    /// the client — which is the sentence the whole feature exists to make true.
    /// </para>
    /// </remarks>
    private sealed class StubProvider(CommunicationChannel channel) : ICommunicationProvider
    {
        public const string StubName = "TestStub";

        public CommunicationChannel Channel { get; } = channel;

        public string Name => StubName;

        public Task<SendOutcome> SendAsync(
            OutboundMessage message, CancellationToken cancellationToken) =>
            Task.FromResult(SendOutcome.Accepted($"stub-{Guid.NewGuid():N}"));
    }

    /// <summary>
    /// AC-24. A stub replaces the mock on <c>Email</c> and is routed to instead.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b><c>Email</c> and not <c>LiveChat</c>, and the first version of this test got that
    /// wrong.</b> Registering a stub for <c>LiveChat</c> makes the channel sendable — the
    /// validator accepts it, the endpoint lists it — and then the handler answers `409`
    /// <c>no-contact-for-channel</c>, because there is no rule for resolving a live-chat
    /// recipient. That is **correct behaviour**, and spec A-3 says so in advance: *"the fix is one
    /// registration line per channel PLUS a recipient-resolution rule for it."* The test expected
    /// `201` and the product was right.
    /// </para>
    /// <para>
    /// So this proves routing on a channel that has a recipient rule, which needs the mock's own
    /// registration removed first — two providers for one channel is AC-5's startup failure. The
    /// removal is a test artifact; the claim AC-24 makes is about the diff a REAL provider needs,
    /// and a real Email provider would replace the mock exactly this way.
    /// </para>
    /// <para>
    /// The <c>LiveChat</c> half is kept as its own test below, asserting what it actually proves.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_stub_provider_is_routed_to_instead_of_the_mock()
    {
        var ticketId = await NewTicketAsync();

        // The control: the shared host routes Email to the mock.
        var beforeSubstitution = await factory.CreateManagerClient().PostAsJsonAsync(
            $"/api/tickets/{ticketId}/messages",
            new { channel = "Email", body = "Handled by the mock." });

        (await BodyOf(beforeSubstitution)).GetProperty("providerName").GetString()
            .Should().Be("Mock", "without a substitution the mock is what answers");

        using var host = factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                // Remove the mock's three registrations, then add one stub. A real Email provider
                // would do exactly this — the interface has room for one provider per channel.
                services.RemoveAll<ICommunicationProvider>();
                services.AddSingleton<ICommunicationProvider>(
                    new StubProvider(CommunicationChannel.Email));
            }));

        var client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.ManagerToken);

        // The channels endpoint follows the registry with no edit to its handler.
        (await BodyOf(await client.GetAsync("/api/communications/channels")))
            .GetProperty("sendableChannels")
            .EnumerateArray()
            .Select(entry => entry.GetString()!)
            .Should().Equal(["Email"], "one provider registered, one channel sendable");

        var response = await client.PostAsJsonAsync(
            $"/api/tickets/{ticketId}/messages",
            new { channel = "Email", body = "Routed to the stub." });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await BodyOf(response);

        body.GetProperty("providerName").GetString().Should().Be(
            StubProvider.StubName,
            "the row records which provider actually sent it — this is the column that makes the "
            + "seam legible in a data dump the day a second provider exists");

        body.GetProperty("providerMessageId").GetString().Should().StartWith("stub-");

        /* THE DIFF, STATED. No edit was needed to:
         *   TicketsController.SendMessage      the endpoint
         *   SendMessageCommand                 the command
         *   SendMessageCommandHandler          the handler
         *   SendMessageCommandValidator        the validator
         *   InteractionResponse                the response
         *   communications-api.md              the contract
         *   the client
         * One class and one registration line. That is the sentence the feature exists to make. */
    }

    /// <summary>
    /// AC-4's half that AC-24 does not cover: registration alone makes a channel sendable.
    /// </summary>
    /// <remarks>
    /// <b>And it stops at the recipient, which is spec A-3's stated consequence rather than a
    /// defect.</b> The validator accepts <c>LiveChat</c> and the channels endpoint lists it — both
    /// with no edit anywhere — and then the handler answers `409` because a live-chat session has
    /// no outbound address. Asserting the `409` rather than a `201` is what makes this test honest
    /// about where the seam ends.
    /// </remarks>
    [Fact]
    public async Task Registering_a_channel_with_no_address_makes_it_sendable_and_then_conflicts()
    {
        var ticketId = await NewTicketAsync();

        var before = await factory.CreateManagerClient().PostAsJsonAsync(
            $"/api/tickets/{ticketId}/messages",
            new { channel = "LiveChat", body = "Is anyone there?" });

        before.StatusCode.Should().Be(
            HttpStatusCode.BadRequest, "the control — with no provider this is a 400");

        using var host = factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddSingleton<ICommunicationProvider>(
                    new StubProvider(CommunicationChannel.LiveChat))));

        var client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", factory.ManagerToken);

        (await BodyOf(await client.GetAsync("/api/communications/channels")))
            .GetProperty("sendableChannels")
            .EnumerateArray()
            .Select(entry => entry.GetString()!)
            .Should().Equal(
                ["Email", "WhatsApp", "LiveChat", "Sms"],
                "it appears, and still in enum declaration order — LiveChat sits between "
                + "WhatsApp and Sms, not at the end where it was registered");

        var response = await client.PostAsJsonAsync(
            $"/api/tickets/{ticketId}/messages",
            new { channel = "LiveChat", body = "Now sendable, but to what address?" });

        response.StatusCode.Should().Be(
            HttpStatusCode.Conflict,
            "no longer a 400 — the validator accepts it now — but there is no rule for resolving "
            + "a live-chat recipient. Spec A-3: one registration line PLUS a recipient rule");

        (await BodyOf(response)).GetProperty("type").GetString().Should()
            .EndWith("/errors/no-contact-for-channel");
    }

    // ── AC-9. The check constraint, verified against the database ──────────────

    /// <summary>
    /// AC-9. <c>CK_Interactions_Direction</c> exists, is not null, and refuses an inbound row.
    /// </summary>
    /// <remarks>
    /// <b>Both halves, because either alone is weak.</b> Querying
    /// <c>sys.check_constraints</c> for a non-null <c>definition</c> proves the constraint is on
    /// the applied table rather than only in the migration file — `020b` learned that lesson when
    /// EF re-added a filter the configuration had suppressed. And a failing <c>INSERT</c> proves
    /// the definition actually refuses what it claims to: a constraint whose expression is subtly
    /// wrong is still non-null.
    /// </remarks>
    [Fact]
    public async Task The_direction_constraint_exists_and_refuses_an_inbound_row()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        /* THE DEFINITION IS READ ON THE MIGRATOR CONNECTION, AND THAT IS A REAL FINDING.
         *
         * `sys.check_constraints.definition` requires VIEW DEFINITION on the object, and
         * `003b`'s restricted `wasl_app` principal holds `db_datareader` + `db_datawriter`, which
         * does not include it. SQL Server does not error — **it returns NULL** — so this test
         * first reported `definition was <null>` for a constraint that is present and working.
         *
         * That is the shape `CLAUDE.md` warns about: a measurement that names the wrong thing is
         * worse than no measurement. The row count said the constraint existed while the
         * definition said nothing, and the obvious reading was "the migration did not apply".
         *
         * Two steps, and both are needed: the DEFINITION comes from the migrator connection (a
         * schema question, asked by a principal that may see schema), and the REFUSAL is proved
         * below on the runtime connection (a behaviour question, asked by the principal the
         * application actually uses). AC-9 asks for both. */
        await using var migrator = new Microsoft.Data.SqlClient.SqlConnection(
            factory.MigratorConnectionString);

        await migrator.OpenAsync(CancellationToken.None);

        await using var command = migrator.CreateCommand();
        command.CommandText = """
            SELECT  definition
            FROM    sys.check_constraints
            WHERE   parent_object_id = OBJECT_ID('dbo.Interactions')
              AND   name = 'CK_Interactions_Direction'
            """;

        var definition = await command.ExecuteScalarAsync(CancellationToken.None) as string;

        definition.Should().NotBeNull(
            "read from the APPLIED table, not from the migration — a migration proves somebody "
            + "typed it, sys.check_constraints proves the database has it");

        definition!.Should().Contain(
            "Outbound", "and the expression must actually name the permitted value");

        /* The second half: it refuses. A raw INSERT, because no code path in the product can
         * produce an inbound row — which is the property being verified.
         *
         * THE FOREIGN KEYS ARE SATISFIED WITH REAL IDS FETCHED IN C#, not with
         * `(SELECT TOP 1 Id FROM dbo.Tickets)` subqueries. The first version used those and
         * failed on `Cannot insert the value NULL into column 'TicketId'` — a message about a
         * NOT NULL column, in a test about a CHECK constraint, which sent the reader looking at
         * the wrong constraint entirely. Explicit ids make the test fail only for the reason it
         * is written for. */
        var ticketId = await NewTicketAsync();
        var senderId = await context.SupportUsers
            .Select(user => user.Id)
            .FirstAsync(CancellationToken.None);

        var insert = async () => await context.Database.ExecuteSqlAsync(
            $"""
             INSERT INTO dbo.Interactions
                 (Id, TicketId, Direction, Channel, RecipientAddress, Body,
                  ProviderName, ProviderMessageId, DeliveryStatus, FailureCode,
                  SentByUserId, CreatedAtUtc)
             VALUES (NEWID(), {ticketId}, N'Inbound', N'Email',
                     N'x@example.com', N'Inbound body', N'Mock', N'mock-1', N'Accepted', NULL,
                     {senderId}, SYSUTCDATETIME())
             """,
            CancellationToken.None);

        (await insert.Should().ThrowAsync<Microsoft.Data.SqlClient.SqlException>())
            .Which.Message.Should().Contain(
                "CK_Interactions_Direction",
                "until US-013 exists, 'zero inbound rows' is a fact the database guarantees "
                + "rather than a question somebody has to go and check");
    }

    /// <summary>
    /// AC-9's sibling: <c>CK_Interactions_Outcome</c> refuses the two rows that read as fact.
    /// </summary>
    /// <remarks>
    /// The third layer of the outcome pairing — <c>SendOutcome</c> catches a provider,
    /// <c>Interaction.Send</c> catches a handler, and this catches anything reaching the table by
    /// another route. This test IS that other route.
    /// </remarks>
    /// <remarks>
    /// <b>The three varying values are PARAMETERS, not interpolated SQL fragments</b>, and the
    /// EF1002 analyser is what forced that — the first version passed <c>NULL</c> and
    /// <c>N'mock-1'</c> as text and was refused. `CLAUDE.md` names that rule precisely because the
    /// habit forms in a test and moves to a query built from user input, and `020b` records three
    /// attempts at the same problem. Suppressing it would have been the wrong lesson; here the
    /// values are genuinely values, so <c>ExecuteSqlAsync</c> takes them as parameters and a
    /// <c>null</c> becomes a real SQL <c>NULL</c>.
    /// </remarks>
    [Theory]
    [InlineData("Accepted", null, null, "accepted with no provider id reads as delivered")]
    [InlineData("Failed", "mock-1", "SomeCode", "failed with a provider id is a contradiction")]
    public async Task The_outcome_constraint_refuses_an_inconsistent_row(
        string status, string? providerMessageId, string? failureCode, string because)
    {
        var ticketId = await NewTicketAsync();

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        // Real ids, for the reason the direction test above records: a subquery that returns NULL
        // fails on a NOT NULL column and reports the wrong constraint.
        var senderId = await context.SupportUsers
            .Select(user => user.Id)
            .FirstAsync(CancellationToken.None);

        var insert = async () => await context.Database.ExecuteSqlAsync(
            $"""
             INSERT INTO dbo.Interactions
                 (Id, TicketId, Direction, Channel, RecipientAddress, Body,
                  ProviderName, ProviderMessageId, DeliveryStatus, FailureCode,
                  SentByUserId, CreatedAtUtc)
             VALUES (NEWID(), {ticketId}, N'Outbound', N'Email',
                     N'x@example.com', N'Body', N'Mock', {providerMessageId}, {status},
                     {failureCode}, {senderId}, SYSUTCDATETIME())
             """,
            CancellationToken.None);

        (await insert.Should().ThrowAsync<Microsoft.Data.SqlClient.SqlException>(because))
            .Which.Message.Should().Contain("CK_Interactions_Outcome");
    }

    /// <summary>
    /// The ticket index is NOT filtered, and that is the answer this table wants.
    /// </summary>
    /// <remarks>
    /// <b>`CLAUDE.md`'s rule is to read the filter and know which answer you want</b>, because
    /// `007` verifies non-null for BR-4's partial index and `020b` verifies null for a unique
    /// index over a nullable column. Here it is null: every row belongs to a ticket, so there is
    /// no subset to exclude.
    /// </remarks>
    [Fact]
    public async Task The_ticket_time_index_is_not_filtered()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        /* `has_filter` AND NOT just the definition, for the reason above: a null
         * `filter_definition` cannot distinguish "the index has no filter" from "there is no such
         * index". `has_filter` is a non-nullable bit, so a missing index makes the list empty and
         * an unfiltered one makes it `false`. */
        var filtered = await context.Database
            .SqlQuery<bool>($"""
                SELECT  has_filter AS Value
                FROM    sys.indexes
                WHERE   object_id = OBJECT_ID('dbo.Interactions')
                  AND   name = 'IX_Interactions_Ticket_Time'
                """)
            .ToListAsync(CancellationToken.None);

        filtered.Should().ContainSingle("the index must exist before its filter means anything");

        filtered[0].Should().BeFalse(
            "every interaction belongs to a ticket, so there is no subset to exclude — unlike "
            + "BR-4's filtered unique indexes, where a null filter would be the defect");
    }

    // ── AC-17. No network and no credential ───────────────────────────────────

    /// <summary>
    /// AC-17. Nothing behind the seam touches a network or names a secret.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The search path was corrected before this test was written.</b> The spec said
    /// <c>src/Wasl.Api/Features/Communications/</c>, which targets ADR-010 — rejected — so the
    /// search would have run over a directory that never exists and the criterion would have
    /// passed vacuously. That is the failure mode `001` recorded for its own architecture test,
    /// and `CLAUDE.md` lists a grep over the wrong place among the tools that have lied here.
    /// </para>
    /// <para>
    /// <b>So the directories are asserted to EXIST first.</b> A scan over an empty file set is not
    /// evidence.
    /// </para>
    /// </remarks>
    [Fact]
    public void No_communications_source_touches_a_network_or_names_a_credential()
    {
        var root = RepositoryRoot();

        var directories = new[]
        {
            Path.Combine(root, "src", "Wasl.Infrastructure", "Communications"),
            Path.Combine(root, "src", "Wasl.Application", "Features", "Communications"),
            Path.Combine(root, "src", "Wasl.Application", "Common", "Communications"),
            Path.Combine(root, "src", "Wasl.Domain", "Communications"),
        };

        foreach (var directory in directories)
        {
            Directory.Exists(directory).Should().BeTrue(
                $"{directory} must exist — a search over a missing folder passes vacuously, "
                + "which is exactly how the spec's original ADR-010 path would have behaved");
        }

        var files = directories
            .SelectMany(directory => Directory.EnumerateFiles(directory, "*.cs", SearchOption.AllDirectories))
            .ToList();

        files.Should().HaveCountGreaterThan(5, "and the scan must actually read files");

        var offenders = new SortedSet<string>(StringComparer.Ordinal);

        foreach (var file in files)
        {
            /* COMMENTS STRIPPED, AND THIS GUARD FAILED ON ITS OWN PROSE FIRST.
             *
             * `MockCommunicationProvider.cs` carries the sentence "No `HttpClient`, no
             * `SmtpClient`, no `Socket`, no `WebSocket`" — written to tell a reader what the file
             * deliberately does not do — and the first version of this scan reported all three as
             * offenders in the file whose comment promised their absence.
             *
             * `027` had exactly this twice: an absence guard went red on the word it was
             * searching for appearing in `useTranslation`, and a sidebar guard went red on the
             * comment explaining the declaration it forbade. Both strip comments now, and both
             * carry a control proving the stripper ran — which is the next assertion in this
             * test. */
            var source = StripComments(File.ReadAllText(file));

            foreach (var forbidden in new[]
            {
                // The network.
                "HttpClient", "SmtpClient", "WebSocket", "System.Net.Sockets", "Socket(",

                // A credential, by any of the names a reviewer would grep for.
                "ApiKey", "AccessKey", "SecretKey", "AccountSid", "AuthToken", "BearerToken",
            })
            {
                if (source.Contains(forbidden, StringComparison.Ordinal))
                {
                    offenders.Add($"{Path.GetFileName(file)}: {forbidden}");
                }
            }
        }

        offenders.Should().BeEmpty(
            "the exclusion in 00-project-context.md — real WhatsApp / SMS / email delivery — is "
            + "untouched. A mock that needs a fake API key has already lost the argument for "
            + $"being a mock. Offenders: {string.Join(", ", offenders)}");
    }

    /// <summary>
    /// THE CONTROL for the scan above. A stripper that stopped working must not pass.
    /// </summary>
    /// <remarks>
    /// <b>Not optional, and `001` is why:</b> it shipped an architecture test that was a false
    /// negative until somebody broke it on purpose. A <see cref="StripComments"/> that returned
    /// an empty string would make every assertion in the scan pass over nothing — and the scan
    /// exists precisely because <c>MockCommunicationProvider.cs</c> names all four forbidden
    /// types in a comment.
    /// <para>
    /// The last two cases are the ones that matter: the stripper must remove a comment mentioning
    /// <c>HttpClient</c> and must NOT remove real code that uses it.
    /// </para>
    /// </remarks>
    [Theory]
    [InlineData("// no HttpClient here", false, "a line comment goes")]
    [InlineData("/* no HttpClient here */", false, "and a block comment goes")]
    [InlineData("/// <remarks>No HttpClient.</remarks>", false, "and a doc comment goes")]
    [InlineData("var client = new HttpClient();", true, "but real code stays")]
    [InlineData("var url = \"HttpClient\";", true, "and so does a string literal")]
    public void The_comment_stripper_removes_prose_and_keeps_code(
        string source, bool survives, string because)
    {
        StripComments(source).Contains("HttpClient", StringComparison.Ordinal)
            .Should().Be(survives, because);
    }

    /// <summary>
    /// Comments out, strings kept. Hand-rolled for the reason `027`'s version gives.
    /// </summary>
    /// <remarks>
    /// A regex cannot tell a comment from the same characters inside a string literal, and the
    /// files this scans contain both — <c>MockCommunicationProvider</c> has a comment naming
    /// <c>HttpClient</c> and a string literal containing <c>"mock-"</c>. Walking the characters is
    /// the only version that is right about both.
    /// </remarks>
    private static string StripComments(string source)
    {
        var output = new System.Text.StringBuilder(source.Length);
        var mode = 'c';

        for (var index = 0; index < source.Length; index++)
        {
            var pair = index + 1 < source.Length ? source.Substring(index, 2) : string.Empty;

            switch (mode)
            {
                case 'c' when pair == "/*":
                    mode = 'b';
                    index++;
                    continue;

                case 'c' when pair == "//":
                    mode = 'l';
                    index++;
                    continue;

                case 'c' when source[index] == '"':
                    mode = 's';
                    output.Append(source[index]);
                    continue;

                case 's':
                    output.Append(source[index]);

                    if (source[index] == '"')
                    {
                        mode = 'c';
                    }

                    continue;

                case 'b' when pair == "*/":
                    mode = 'c';
                    index++;
                    continue;

                case 'l' when source[index] == '\n':
                    mode = 'c';
                    output.Append('\n');
                    continue;

                case 'c':
                    output.Append(source[index]);
                    continue;

                default:
                    continue;
            }
        }

        return output.ToString();
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null
            && !directory.EnumerateFiles("*.sln").Any()
            && !directory.EnumerateFiles("*.slnx").Any())
        {
            directory = directory.Parent;
        }

        directory.Should().NotBeNull("the repository root must be findable from the test binary");

        return directory!.FullName;
    }
}
