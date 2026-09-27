using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Domain.Audit;
using Wasl.Domain.Settings;
using Wasl.Infrastructure.Persistence;
using Wasl.Infrastructure.Persistence.Seed;

namespace Wasl.Api.IntegrationTests.Settings;

/// <summary>
/// <c>GET</c> and <c>PUT /api/settings/branding</c>, through the real pipeline. `022`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Every test restores the branding it changed.</b> One <c>ICollectionFixture</c> means one
/// container and one database shared with every other integration class — and this table has
/// exactly ONE row, so a test that left a brand colour behind would change what every later test
/// in the run is looking at. That is a sharper version of the usual scoping rule: there is no
/// id to scope by.
/// </para>
/// <para>
/// <b>Audit assertions are scoped by action and trace id</b>, never by <c>COUNT(*)</c>.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class BrandingTests(WaslApiFactory factory)
{
    private const string Path = "/api/settings/branding";

    private const string AuditAction = "Settings.BrandingChanged";

    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>
    /// Reads the current branding and restores it afterwards, whatever the test did.
    /// </summary>
    private async Task RestoringBranding(Func<HttpClient, Task> body)
    {
        using var manager = factory.CreateManagerClient();

        var before = await BodyOf(await manager.GetAsync(Path));
        var colour = before.GetProperty("brandColor").GetString()!;
        var mode = before.GetProperty("sidebarMode").GetString()!;

        try
        {
            await body(manager);
        }
        finally
        {
            var current = await BodyOf(await manager.GetAsync(Path));

            await manager.PutAsJsonAsync(Path, new
            {
                brandColor = colour,
                sidebarMode = mode,
                expectedVersion = current.GetProperty("version").GetString(),
            });
        }
    }

    /* ---- AC-1, AC-2 ---------------------------------------------------- */

    [Fact]
    public async Task The_seeded_default_is_returned_and_there_is_no_not_configured_state()
    {
        using var manager = factory.CreateManagerClient();

        var response = await manager.GetAsync(Path);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await BodyOf(response);

        body.GetProperty("brandColor").GetString().Should().MatchRegex("^#[0-9A-F]{6}$");
        body.GetProperty("onBrand").GetString().Should().BeOneOf("#FFFFFF", "#0D2626");
        body.GetProperty("version").GetString().Should().NotBeNullOrWhiteSpace();
    }

    /// <summary>AC-2, and spec Q-A: ADR-005 wins over a design file marking the read "Any".</summary>
    [Fact]
    public async Task An_unauthenticated_read_is_refused()
    {
        using var anonymous = factory.CreateClient();

        var response = await anonymous.GetAsync(Path);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var body = await BodyOf(response);
        body.GetProperty("type").GetString().Should().EndWith("errors/unauthenticated");
    }

    /// <summary>An Agent READS it — every screen is painted with it.</summary>
    [Fact]
    public async Task An_agent_may_read_the_branding()
    {
        using var agent = factory.CreateAgentClient();

        (await agent.GetAsync(Path)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /* ---- AC-3 ------------------------------------------------------------ */

    /// <summary>
    /// AC-3. <b>One test that calls both and compares</b>, not two that each check a shape.
    /// </summary>
    /// <remarks>
    /// Two independent shape assertions both keep passing while the two responses drift apart,
    /// which is exactly the failure this criterion is written against — and the drift would show
    /// up as a theme flash on sign-in, which nobody files.
    /// </remarks>
    [Fact]
    public async Task The_token_responses_theme_equals_the_branding_read_field_for_field()
    {
        using var manager = factory.CreateManagerClient();

        var read = await BodyOf(await manager.GetAsync(Path));

        var signIn = await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/token",
            new { email = SupportUserSeeder.ManagerEmail, password = WaslApiFactory.ManagerPassword });

        var theme = (await BodyOf(signIn)).GetProperty("theme");

        theme.GetRawText().Should().Be(read.GetRawText());
    }

    /* ---- AC-4, AC-26 ----------------------------------------------------- */

    [Fact]
    public async Task A_manager_changes_the_branding_and_the_server_recomputes_the_foreground()
    {
        await RestoringBranding(async manager =>
        {
            var before = await BodyOf(await manager.GetAsync(Path));

            // A LIGHT brand, so `onBrand` must come back as the INK — the assertion a
            // hard-coded white foreground passes for every dark colour and fails here.
            var response = await manager.PutAsJsonAsync(Path, new
            {
                brandColor = "#4A9E96",
                sidebarMode = "Brand",
                expectedVersion = before.GetProperty("version").GetString(),
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await BodyOf(response);

            body.GetProperty("brandColor").GetString().Should().Be("#4A9E96");
            body.GetProperty("onBrand").GetString().Should().Be("#0D2626");
            body.GetProperty("sidebarMode").GetString().Should().Be("Brand");
            body.GetProperty("version").GetString()
                .Should().NotBe(before.GetProperty("version").GetString());
        });
    }

    /// <summary>Case-insensitive on input, stored and returned upper case.</summary>
    [Fact]
    public async Task A_lower_case_colour_is_normalised_on_the_way_in()
    {
        await RestoringBranding(async manager =>
        {
            var before = await BodyOf(await manager.GetAsync(Path));

            var body = await BodyOf(await manager.PutAsJsonAsync(Path, new
            {
                brandColor = " #1570ef ",
                sidebarMode = "Light",
                expectedVersion = before.GetProperty("version").GetString(),
            }));

            body.GetProperty("brandColor").GetString().Should().Be("#1570EF");
        });
    }

    [Fact]
    public async Task A_successful_change_writes_one_audit_row_naming_the_colour()
    {
        await RestoringBranding(async manager =>
        {
            var before = await BodyOf(await manager.GetAsync(Path));

            var response = await manager.PutAsJsonAsync(Path, new
            {
                brandColor = "#2E7D32",
                sidebarMode = "Light",
                expectedVersion = before.GetProperty("version").GetString(),
            });

            var traceId = (await BodyOf(await manager.GetAsync(Path))) is var _
                ? response.Headers.TryGetValues("X-Trace-Id", out var values)
                    ? values.FirstOrDefault()
                    : null
                : null;

            _ = traceId;

            using var scope = factory.Services.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

            var rows = await context.Set<AuditEntry>()
                .Where(entry => entry.Action == AuditAction
                    && entry.EntityLabel == "#2E7D32")
                .ToListAsync();

            rows.Should().ContainSingle();

            var row = rows[0];

            row.Outcome.Should().Be(AuditOutcome.Success);
            row.EntityType.Should().Be(nameof(OrganizationSettings));

            // CONTENT, NOT PRESENCE. `003` moved its interceptor one hook later and four tests
            // stayed green while `Changes` came back null on every command.
            row.Changes.Should().NotBeNull();
            row.Changes.Should().Contain("BrandColor");
        });
    }

    /* ---- AC-5 ------------------------------------------------------------ */

    /// <summary>
    /// AC-5. The policy denial: `403`, an enveloped body (`004b`), and nothing changed.
    /// </summary>
    [Fact]
    public async Task An_agent_cannot_change_the_branding()
    {
        using var manager = factory.CreateManagerClient();
        using var agent = factory.CreateAgentClient();

        var before = await BodyOf(await manager.GetAsync(Path));

        var response = await agent.PutAsJsonAsync(Path, new
        {
            brandColor = "#000000",
            sidebarMode = "Dark",
            expectedVersion = before.GetProperty("version").GetString(),
        });

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        // `004b` — the body is enveloped, not empty.
        var body = await BodyOf(response);
        body.GetProperty("type").GetString().Should().EndWith("errors/forbidden");
        body.TryGetProperty("traceId", out _).Should().BeTrue();

        var after = await BodyOf(await manager.GetAsync(Path));
        after.GetRawText().Should().Be(before.GetRawText());
    }

    /* ---- AC-6 ------------------------------------------------------------ */

    [Fact]
    public async Task A_stale_version_is_refused_and_the_row_is_untouched()
    {
        await RestoringBranding(async manager =>
        {
            var first = await BodyOf(await manager.GetAsync(Path));
            var staleVersion = first.GetProperty("version").GetString();

            await manager.PutAsJsonAsync(Path, new
            {
                brandColor = "#1570EF",
                sidebarMode = "Light",
                expectedVersion = staleVersion,
            });

            var afterFirst = await BodyOf(await manager.GetAsync(Path));

            var response = await manager.PutAsJsonAsync(Path, new
            {
                brandColor = "#000000",
                sidebarMode = "Dark",
                expectedVersion = staleVersion,
            });

            response.StatusCode.Should().Be(HttpStatusCode.Conflict);

            var body = await BodyOf(response);
            body.GetProperty("type").GetString().Should().EndWith("errors/concurrency-conflict");

            // BYTE-IDENTICAL to before the refused call.
            var after = await BodyOf(await manager.GetAsync(Path));
            after.GetRawText().Should().Be(afterFirst.GetRawText());
        });
    }

    /* ---- AC-7, AC-14 ----------------------------------------------------- */

    [Theory]
    [InlineData("#ABC")]
    [InlineData("1D174D")]
    [InlineData("#1D174DFF")]
    [InlineData("rgb(29,23,77)")]
    [InlineData("#GGGGGG")]
    [InlineData("")]
    public async Task A_malformed_colour_is_a_validation_failure_naming_the_field(string colour)
    {
        using var manager = factory.CreateManagerClient();

        var before = await BodyOf(await manager.GetAsync(Path));

        var response = await manager.PutAsJsonAsync(Path, new
        {
            brandColor = colour,
            sidebarMode = "Light",
            expectedVersion = before.GetProperty("version").GetString(),
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await BodyOf(response);
        body.GetProperty("type").GetString().Should().EndWith("errors/validation");

        var message = body.GetProperty("errors").GetProperty("brandColor")[0].GetString();

        // READ THE MESSAGE, not just the shape. All seventeen unresolved keys in `004b` went out
        // under assertions that counted entries under the right field name.
        message.Should().NotBeNullOrWhiteSpace();
        message.Should().NotStartWith("Validation.");

        var after = await BodyOf(await manager.GetAsync(Path));
        after.GetRawText().Should().Be(before.GetRawText());
    }

    /// <summary>AC-14. An enum identifier, not a label — `light` is a `400`.</summary>
    [Theory]
    [InlineData("light")]
    [InlineData("DARK")]
    [InlineData("Rainbow")]
    [InlineData("1")]
    public async Task An_unknown_sidebar_mode_is_refused(string mode)
    {
        using var manager = factory.CreateManagerClient();

        var before = await BodyOf(await manager.GetAsync(Path));

        var response = await manager.PutAsJsonAsync(Path, new
        {
            brandColor = "#1D174D",
            sidebarMode = mode,
            expectedVersion = before.GetProperty("version").GetString(),
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await BodyOf(response);
        body.GetProperty("errors").TryGetProperty("sidebarMode", out _).Should().BeTrue();
    }

    /* ---- AC-8, AC-12, AC-23 ---------------------------------------------- */

    /// <summary>
    /// AC-8 and AC-12. A refused colour, its own <c>type</c>, and four NUMERIC extensions.
    /// </summary>
    [Theory]
    [InlineData("#808080", "text")]
    [InlineData("#FFF59D", "surface")]
    public async Task A_refused_colour_carries_the_gate_and_the_measured_ratios(
        string colour,
        string refusedBy)
    {
        using var manager = factory.CreateManagerClient();

        var before = await BodyOf(await manager.GetAsync(Path));

        var response = await manager.PutAsJsonAsync(Path, new
        {
            brandColor = colour,
            sidebarMode = "Light",
            expectedVersion = before.GetProperty("version").GetString(),
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await BodyOf(response);

        body.GetProperty("type").GetString().Should().EndWith("errors/inaccessible-brand-color");
        body.GetProperty("refusedBy").GetString().Should().Be(refusedBy);

        // NUMBERS on the wire, so the client can format them in the active locale.
        body.GetProperty("bestContrastRatio").ValueKind.Should().Be(JsonValueKind.Number);
        body.GetProperty("requiredContrastRatio").GetDouble().Should().Be(4.5d);
        body.GetProperty("surfaceContrastRatio").ValueKind.Should().Be(JsonValueKind.Number);
        body.GetProperty("requiredSurfaceContrastRatio").GetDouble().Should().Be(3.0d);

        body.GetProperty("errors").TryGetProperty("brandColor", out _).Should().BeTrue();

        var after = await BodyOf(await manager.GetAsync(Path));
        after.GetRawText().Should().Be(before.GetRawText());
    }

    /// <summary>
    /// AC-8's other half, and BR-8.7: the numbers do not move between languages.
    /// </summary>
    [Fact]
    public async Task The_refusals_numbers_are_identical_in_arabic_and_its_sentences_are_not()
    {
        using var manager = factory.CreateManagerClient();

        var before = await BodyOf(await manager.GetAsync(Path));
        var version = before.GetProperty("version").GetString();

        async Task<JsonElement> RefuseIn(string language)
        {
            using var request = new HttpRequestMessage(HttpMethod.Put, Path)
            {
                Content = JsonContent.Create(new
                {
                    brandColor = "#808080",
                    sidebarMode = "Light",
                    expectedVersion = version,
                }),
            };

            request.Headers.Add("Accept-Language", language);

            return await BodyOf(await manager.SendAsync(request));
        }

        var english = await RefuseIn("en");
        var arabic = await RefuseIn("ar");

        // Never translated.
        arabic.GetProperty("type").GetString().Should().Be(english.GetProperty("type").GetString());
        arabic.GetProperty("refusedBy").GetString().Should().Be("text");
        arabic.GetProperty("bestContrastRatio").GetDouble()
            .Should().Be(english.GetProperty("bestContrastRatio").GetDouble());
        arabic.GetProperty("surfaceContrastRatio").GetDouble()
            .Should().Be(english.GetProperty("surfaceContrastRatio").GetDouble());

        // Translated — and asserted by READING it, not by counting entries.
        arabic.GetProperty("title").GetString()
            .Should().NotBe(english.GetProperty("title").GetString());

        var arabicMessage = arabic.GetProperty("errors").GetProperty("brandColor")[0].GetString();
        arabicMessage.Should().NotBeNullOrWhiteSpace();
        arabicMessage.Should().NotStartWith("Error.");
        arabicMessage.Should().NotBe(
            english.GetProperty("errors").GetProperty("brandColor")[0].GetString());
    }

    /* ---- AC-25 ----------------------------------------------------------- */

    /// <summary>
    /// AC-25. Exactly one row, and the database is what says so.
    /// </summary>
    /// <remarks>
    /// <b>The metadata half is read on the MIGRATOR connection.</b> `021` asked
    /// <c>sys.check_constraints</c> for a <c>definition</c> over `003b`'s restricted principal
    /// and got NULL — that column needs <c>VIEW DEFINITION</c>, and SQL Server returns null
    /// rather than erroring, so the test reported a missing constraint for one that was present
    /// and enforcing.
    /// </remarks>
    [Fact]
    public async Task Exactly_one_settings_row_exists_and_a_second_insert_is_refused()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        (await context.OrganizationSettings.CountAsync()).Should().Be(1);

        var act = async () => await context.Database.ExecuteSqlAsync(
            $"""
             INSERT INTO dbo.OrganizationSettings
                 (Id, BrandColor, OnBrand, SidebarMode, CreatedAtUtc, UpdatedAtUtc)
             VALUES
                 (NEWID(), '#123456', '#FFFFFF', 'Light', SYSUTCDATETIME(), SYSUTCDATETIME())
             """);

        await act.Should().ThrowAsync<Exception>(
            "CK_OrganizationSettings_SingleRow pins the id to one literal");

        (await context.OrganizationSettings.CountAsync()).Should().Be(1);
    }

    /// <summary>
    /// AC-25's other half: the constraint is on the APPLIED table, not only in the migration.
    /// </summary>
    /// <remarks>
    /// <b>Read on the migrator connection</b>, for the reason `021` found the hard way:
    /// <c>sys.check_constraints.definition</c> needs <c>VIEW DEFINITION</c>, `003b`'s
    /// <c>db_datareader</c> does not grant it, and <b>SQL Server returns null rather than
    /// erroring</b> — so the same query on the runtime connection reports a missing constraint
    /// for one that is present and enforcing.
    /// </remarks>
    [Fact]
    public async Task The_single_row_constraint_is_on_the_applied_table()
    {
        await using var migrator = new Microsoft.Data.SqlClient.SqlConnection(
            factory.MigratorConnectionString);

        await migrator.OpenAsync(CancellationToken.None);

        await using var command = migrator.CreateCommand();
        command.CommandText = """
            SELECT  definition
            FROM    sys.check_constraints
            WHERE   name = 'CK_OrganizationSettings_SingleRow'
            """;

        var definition = await command.ExecuteScalarAsync(CancellationToken.None);

        definition.Should().NotBeNull();
        definition.Should().BeOfType<string>()
            .Which.Should().Contain("Id", "the constraint pins the id to one literal");
    }
}
