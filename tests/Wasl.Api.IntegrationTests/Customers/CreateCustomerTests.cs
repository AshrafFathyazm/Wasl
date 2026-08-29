using System.Net;
using System.Security.Cryptography;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Domain.Audit;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Customers;

/// <summary>
/// <c>POST /api/customers</c>. `007`, BR-4.
/// </summary>
/// <remarks>
/// Every test mints its own email and phone, because the integration suite shares one database and
/// the whole subject of this feature is uniqueness. Nothing here counts rows in a whole table.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class CreateCustomerTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>A unique local-part and a unique national number, per call.</summary>
    /// <remarks>
    /// <para>
    /// <b>Random, not a slice of a <c>Guid</c> — and this is the second time that mattered.</b>
    /// The first version took <c>Guid.CreateVersion7().ToString("N")[..10]</c>, and two customers
    /// created milliseconds apart came back as a duplicate: **a v7 GUID leads with a timestamp**,
    /// so its leading hex digits are shared by everything minted in the same instant.
    /// </para>
    /// <para>
    /// `008` hit the identical trap one feature earlier — a seven-character prefix used as a
    /// search term matched the wrong row — and recorded the lesson in its <c>tests.md</c>. It was
    /// then repeated here, which is the more useful finding: **a time-ordered id is a poor source
    /// of a unique prefix**, and writing that down once did not stop it happening again.
    /// </para>
    /// </remarks>
    private static (string Email, string Phone) Unique()
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();
        var digits = Random.Shared.NextInt64(100_000_000, 999_999_999);

        return ($"c{token}@example.com", $"+96650{digits}");
    }

    private Task<HttpResponseMessage> PostAsync(object body) =>
        factory.CreateManagerClient().PostAsJsonAsync("/api/customers", body);

    // ── AC-1, AC-14 ─────────────────────────────────────────────────────────────────

    /// <summary>AC-1 and AC-14 — the `Location` resolves to the identical resource.</summary>
    [Fact]
    public async Task A_valid_create_returns_201_and_the_location_returns_the_same_resource()
    {
        var (email, phone) = Unique();

        var response = await PostAsync(new
        {
            fullName = "علي الأحمد",
            email,
            phone,
            companyName = "شركة الأفق",
            notes = "Prefers WhatsApp.",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location.Should().NotBeNull();

        var created = await BodyOf(response);
        created.GetProperty("fullName").GetString().Should().Be("علي الأحمد");
        created.GetProperty("isActive").GetBoolean().Should().BeTrue(
            "set by the factory, not by a column default — `001` shipped that default and it was "
            + "removed, because EF applies one whenever the property holds the CLR default");
        created.GetProperty("version").GetString().Should().NotBeNullOrWhiteSpace();

        var fetched = await factory.CreateManagerClient().GetAsync(response.Headers.Location);

        fetched.StatusCode.Should().Be(HttpStatusCode.OK);

        (await fetched.Content.ReadAsStringAsync())
            .Should().Be(await response.Content.ReadAsStringAsync(),
                "AC-14 — byte-identical, because both endpoints return the same DTO. 'Similar' "
                + "would let the two drift and nothing would notice");
    }

    // ── AC-2, AC-3, AC-5 · validation ───────────────────────────────────────────────

    /// <summary>AC-2.</summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task A_missing_name_is_refused_and_names_the_field(string fullName)
    {
        var (email, _) = Unique();

        var response = await PostAsync(new { fullName, email });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await BodyOf(response)).GetProperty("errors").GetProperty("fullName")
            .EnumerateArray().Should().ContainSingle()
            .Which.GetString().Should().Be("Enter the customer's name.");
    }

    /// <summary>
    /// AC-3, BR-4.1 — and the message lands on **both** fields.
    /// </summary>
    /// <remarks>
    /// One rule reported twice, deliberately. A single rule on one field would leave the other
    /// input with nothing beside it, so a form highlighting invalid fields would highlight one of
    /// the two places the user may fix.
    /// </remarks>
    [Fact]
    public async Task Neither_an_email_nor_a_phone_is_refused_and_names_both_fields()
    {
        var response = await PostAsync(new { fullName = "No Contact", email = "  ", phone = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var errors = (await BodyOf(response)).GetProperty("errors");

        errors.GetProperty("email").EnumerateArray().Should().ContainSingle()
            .Which.GetString().Should().Be("Provide either an email address or a phone number.");
        errors.GetProperty("phone").EnumerateArray().Should().ContainSingle();
    }

    /// <summary>AC-5.</summary>
    [Theory]
    [InlineData("not-an-address")]
    [InlineData("missing@")]
    [InlineData("@example.com")]
    public async Task A_malformed_email_is_refused(string email)
    {
        var response = await PostAsync(new { fullName = "Bad Email", email });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await BodyOf(response)).GetProperty("errors").TryGetProperty("email", out _)
            .Should().BeTrue();
    }

    // ── AC-4, AC-6, AC-7, AC-19 · normalisation ─────────────────────────────────────

    /// <summary>
    /// AC-4 and **AC-19** — the stored value is read back from the database.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>AC-19 exists because AC-9 would pass without any normalisation at all.</b>
    /// <c>Customers.Email</c> carries a case-insensitive collation, so the unique index catches
    /// <c>ALI@EXAMPLE.COM</c> against a stored <c>ali@example.com</c> whether or not the
    /// application lowercases anything.
    /// </para>
    /// <para>
    /// So the duplicate test cannot be the evidence that BR-4.2 runs. This one reads the column
    /// and looks at it — content, not consequence.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task The_stored_email_is_trimmed_and_lowercased()
    {
        var (email, phone) = Unique();
        var shouted = $"  {email.ToUpperInvariant()}  ";

        var response = await PostAsync(new { fullName = "Normalised", email = shouted, phone });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var id = (await BodyOf(response)).GetProperty("id").GetGuid();

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var stored = await context.Customers
            .Where(customer => customer.Id == id)
            .Select(customer => customer.Email)
            .SingleAsync();

        stored.Should().Be(email,
            "BR-4.2. Read from the column, not from the response — and not inferred from the "
            + "duplicate rule, which the collation would satisfy on its own");
    }

    /// <summary>AC-6 — formatting removed, nothing inferred.</summary>
    [Theory]
    [InlineData("+966 50 123 4567", "+966501234567")]
    [InlineData("+966-50-123-4567", "+966501234567")]
    [InlineData("+966 (50) 123.4567", "+966501234567")]
    public async Task Formatting_characters_are_stripped_from_a_phone(string typed, string expected)
    {
        var response = await PostAsync(new { fullName = "Formatted", phone = typed });

        // The expected number may already exist from another case of this theory; either answer
        // proves the normalisation, and only the 201 proves the stored form.
        if (response.StatusCode is HttpStatusCode.Created)
        {
            (await BodyOf(response)).GetProperty("phone").GetString().Should().Be(expected);
            return;
        }

        response.StatusCode.Should().Be(HttpStatusCode.Conflict,
            "the same number in a different format collided with the row a sibling case wrote — "
            + "which is itself the normalisation working");
    }

    /// <summary>
    /// AC-7 — a phone that cannot be normalised is a `400`, never a `409`.
    /// </summary>
    /// <remarks>
    /// <c>0501234567</c> is the case the ruling on Q-B is about: no country is inferred, because
    /// guessing that it is Saudi is a business rule nobody has stated and being wrong writes an
    /// unreachable number into a record whose whole purpose is that its owner can be reached.
    /// </remarks>
    [Theory]
    [InlineData("0501234567")]
    [InlineData("501234567")]
    [InlineData("+966 5012 3456 ext 7")]
    [InlineData("+12")]
    [InlineData("phone")]
    public async Task An_unnormalisable_phone_is_a_validation_error(string phone)
    {
        var response = await PostAsync(new { fullName = "Bad Phone", phone });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "AC-7 — the caller's input is wrong, not in conflict with someone else's");

        (await BodyOf(response)).GetProperty("errors").GetProperty("phone")
            .EnumerateArray().Should().ContainSingle()
            .Which.GetString().Should().Contain("country code",
                "the message says what to do, not that something is invalid");
    }

    // ── AC-8 … AC-12 · the duplicate rule ───────────────────────────────────────────

    /// <summary>AC-8, AC-9, AC-12.</summary>
    [Fact]
    public async Task A_duplicate_email_is_a_conflict_naming_only_the_field()
    {
        var (email, phone) = Unique();
        var (_, otherPhone) = Unique();

        (await PostAsync(new { fullName = "First", email, phone })).StatusCode
            .Should().Be(HttpStatusCode.Created);

        var response = await PostAsync(new
        {
            fullName = "Second",
            email = $"  {email.ToUpperInvariant()}  ",
            phone = otherPhone,
        });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var problem = await BodyOf(response);
        problem.GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/duplicate-customer");
        problem.GetProperty("errors").GetProperty("email").EnumerateArray()
            .Should().ContainSingle().Which.GetString()
            .Should().Be("A customer with this email already exists.");

        // AC-12, over the raw text — the response must carry nothing about the existing record.
        var raw = await response.Content.ReadAsStringAsync();
        raw.Should().NotContain("First", "not the existing customer's name");
        raw.Should().NotContain("id\":", "and not its id — BR-4.7");
    }

    /// <summary>AC-10.</summary>
    [Fact]
    public async Task A_duplicate_phone_is_a_conflict_naming_the_phone()
    {
        var (email, phone) = Unique();
        var (otherEmail, _) = Unique();

        (await PostAsync(new { fullName = "First", email, phone })).StatusCode
            .Should().Be(HttpStatusCode.Created);

        var response = await PostAsync(new
        {
            fullName = "Second",
            email = otherEmail,

            // The same number, differently formatted — so this also proves the duplicate check
            // compares NORMALISED values rather than raw input.
            phone = phone.Insert(4, " ").Insert(8, "-"),
        });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("errors").TryGetProperty("phone", out _)
            .Should().BeTrue();
    }

    /// <summary>AC-11, BR-4.6 — a shared name is not a duplicate.</summary>
    [Fact]
    public async Task Two_customers_may_share_a_name()
    {
        var (firstEmail, firstPhone) = Unique();
        var (secondEmail, secondPhone) = Unique();

        (await PostAsync(new { fullName = "أحمد محمد", email = firstEmail, phone = firstPhone }))
            .StatusCode.Should().Be(HttpStatusCode.Created);

        (await PostAsync(new { fullName = "أحمد محمد", email = secondEmail, phone = secondPhone }))
            .StatusCode.Should().Be(HttpStatusCode.Created,
                "two different people can legitimately share a name, and blocking that creates a "
                + "worse failure than allowing it");
    }

    /// <summary>
    /// The edge case an **unfiltered** index breaks. Two phone-only customers.
    /// </summary>
    /// <remarks>
    /// SQL Server treats NULLs as equal in a unique index, so an unfiltered unique index on
    /// <c>Email</c> rejects the second customer who has no email — with a `409` naming
    /// <c>email</c>, which is correct-looking, wrong, and would be diagnosed as a bug in the
    /// duplicate rule rather than in the index. AC-18 asserts the filter; this asserts the
    /// behaviour it buys.
    /// </remarks>
    [Fact]
    public async Task Two_customers_with_no_email_are_both_created()
    {
        var (_, firstPhone) = Unique();
        var (_, secondPhone) = Unique();

        (await PostAsync(new { fullName = "Phone Only One", phone = firstPhone })).StatusCode
            .Should().Be(HttpStatusCode.Created);

        (await PostAsync(new { fullName = "Phone Only Two", phone = secondPhone })).StatusCode
            .Should().Be(HttpStatusCode.Created,
                "both have a NULL email. An unfiltered unique index would call that a duplicate");
    }

    // ── AC-13 · the race ────────────────────────────────────────────────────────────

    /// <summary>
    /// AC-13 — two simultaneous identical requests: one `201`, one `409`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The first test in this project to exercise `CLAUDE.md`'s "does a duplicate request
    /// create a duplicate row?" row.</b> `009` recorded `POST /api/tickets` as not idempotent with
    /// no owner; here the index *is* the owner, so the claim is testable.
    /// </para>
    /// <para>
    /// The pre-check cannot win this on its own — both requests read before either writes — so a
    /// pass means the unique index caught it and the violation was translated. The
    /// <b>identical body</b> assertion below is Q-D: a client cannot tell which request it was,
    /// and a difference between the two paths would leak timing.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Two_simultaneous_identical_creates_produce_one_201_and_one_409()
    {
        var (email, phone) = Unique();

        object Body() => new { fullName = "Racing", email, phone };

        var first = PostAsync(Body());
        var second = PostAsync(Body());

        var responses = await Task.WhenAll(first, second);

        responses.Select(response => response.StatusCode)
            .Should().BeEquivalentTo([HttpStatusCode.Created, HttpStatusCode.Conflict],
                "one wins the insert and the other loses it on the unique index. Two 201s means "
                + "the index is missing or unfiltered; a 500 means the violation was not "
                + "translated and the loser got a DbUpdateException");

        var conflict = responses.Single(response => response.StatusCode == HttpStatusCode.Conflict);
        var problem = await BodyOf(conflict);

        problem.GetProperty("type").GetString()
            .Should().Be("https://wasl.local/errors/duplicate-customer",
                "Q-D — indistinguishable from the pre-check's 409. The client cannot know which "
                + "of the two racing requests it was, so the two paths must answer identically");
        problem.GetProperty("errors").GetProperty("email").EnumerateArray()
            .Should().ContainSingle().Which.GetString()
            .Should().Be("A customer with this email already exists.");

        // And exactly one row exists — the assertion the status codes alone do not make.
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        (await context.Customers.CountAsync(customer => customer.Email == email))
            .Should().Be(1, "the whole point of the index");
    }

    // ── AC-18 · the filter, read back from sys.indexes ──────────────────────────────

    /// <summary>
    /// AC-18 — both indexes are unique **and filtered**, asserted from the database.
    /// </summary>
    /// <remarks>
    /// ADR-013 lists this among four provider-coupled points that fail quietly:
    /// <c>HasIndex(...).IsUnique()</c> reads identically with and without a filter, and there is no
    /// way to see the difference in C#. `004` AC-22 made the mirror assertion — that
    /// <c>UX_SupportUsers_Email</c> is deliberately **un**filtered — for the same reason.
    /// </remarks>
    [Fact]
    public async Task Both_duplicate_indexes_are_unique_and_filtered()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await using var connection = new SqlConnection(context.Database.GetConnectionString());
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT name, is_unique, filter_definition
            FROM sys.indexes
            WHERE object_id = OBJECT_ID('dbo.Customers')
              AND name IN ('UX_Customers_Email_Active', 'UX_Customers_Phone_Active')
            """;

        var indexes = new Dictionary<string, (bool Unique, string? Filter)>(StringComparer.Ordinal);

        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                indexes[reader.GetString(0)] =
                    (reader.GetBoolean(1), reader.IsDBNull(2) ? null : reader.GetString(2));
            }
        }

        indexes.Should().HaveCount(2, "BR-4.8 needs both");

        foreach (var (name, (unique, filter)) in indexes)
        {
            unique.Should().BeTrue($"{name} is the guarantee, not a lookup index");

            filter.Should().NotBeNull(
                $"{name} MUST be filtered. Unfiltered, SQL Server treats two NULLs as equal and "
                + "rejects the second customer who has no email — a 409 that is correct-looking "
                + "and wrong (ADR-013)");

            filter.Should().Contain("IsActive",
                $"{name}'s filter must also scope to active customers (BR-4.4, BR-4.5), or a "
                + "deactivated customer's address is reserved forever and they cannot be re-added");
        }
    }

    /// <summary>
    /// **Why the filter is not optional** — proved against SQL Server directly, not argued.
    /// </summary>
    /// <remarks>
    /// <para>
    /// AC-18 asserts that <c>filter_definition</c> is non-null;
    /// <c>Two_customers_with_no_email_are_both_created</c> asserts the behaviour it buys. Neither
    /// demonstrates the <b>reason</b>, which is a property of SQL Server rather than of this code:
    /// a unique index treats two NULLs as equal.
    /// </para>
    /// <para>
    /// This builds the wrong index on a throwaway table, inserts two NULLs, and reads the failure.
    /// It is the negative control the schema itself cannot carry — a migration that removes the
    /// filter breaks the test fixture before any assertion runs, so the counterfactual has to be
    /// staged somewhere the suite does not depend on.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task An_unfiltered_unique_index_treats_two_nulls_as_a_duplicate()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await using var connection = new SqlConnection(context.Database.GetConnectionString());
        await connection.OpenAsync();

        var table = $"ControlNulls_{Convert.ToHexString(RandomNumberGenerator.GetBytes(4))}";

        async Task ExecuteAsync(string sql)
        {
            await using var command = connection.CreateCommand();
            command.CommandText = sql;
            await command.ExecuteNonQueryAsync();
        }

        await ExecuteAsync($"CREATE TABLE dbo.{table} (Id int NOT NULL, Email nvarchar(50) NULL)");

        try
        {
            // The index `007` did NOT build: unique, and unfiltered.
            await ExecuteAsync($"CREATE UNIQUE INDEX UX_{table} ON dbo.{table} (Email)");
            await ExecuteAsync($"INSERT INTO dbo.{table} (Id, Email) VALUES (1, NULL)");

            var second = async () => await ExecuteAsync(
                $"INSERT INTO dbo.{table} (Id, Email) VALUES (2, NULL)");

            (await second.Should().ThrowAsync<SqlException>(
                "SQL Server treats two NULLs as EQUAL in a unique index — so an unfiltered index "
                + "on Customers.Email would reject the second customer who has no email, with a "
                + "409 naming `email` that is correct-looking and wrong"))
                .Which.Number.Should().BeOneOf(2601, 2627);
        }
        finally
        {
            await ExecuteAsync($"DROP TABLE dbo.{table}");
        }
    }

    // ── AC-15, and the audit row ────────────────────────────────────────────────────

    /// <summary>AC-15.</summary>
    [Fact]
    public async Task An_unauthenticated_create_is_refused()
    {
        var (email, _) = Unique();

        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/customers", new { fullName = "Anonymous", email });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>BR-9.1 — and the row carries no contact details.</summary>
    /// <remarks>
    /// <c>DescribeTarget</c> labels the row with the customer's **name**, never the email or the
    /// phone. A rejected duplicate would otherwise write the contact details of a person the caller
    /// was told nothing about — BR-4.7 keeps them out of the `409`, and the audit row is the other
    /// place they could have leaked.
    /// </remarks>
    [Fact]
    public async Task A_create_writes_an_audit_row_that_carries_no_contact_details()
    {
        var (email, phone) = Unique();

        var response = await PostAsync(new { fullName = "Audited Customer", email, phone });
        var id = (await BodyOf(response)).GetProperty("id").GetGuid();

        var row = (await Audit.AuditFixture.RowsForAsync(factory, "Customer.Created"))
            .Single(entry => entry.EntityId == id);

        row.Outcome.Should().Be(AuditOutcome.Success);
        row.EntityLabel.Should().Be("Audited Customer");
        row.ActorEmail.Should().NotBeNull("the creating user, from the token");

        var everyColumn = string.Join(' ', new[]
        {
            row.ActorEmail, row.ActorRole, row.Action, row.EntityType, row.EntityLabel,
            row.Changes, row.TraceId, row.IpAddress, row.UserAgent,
        });

        everyColumn.Should().NotContain(phone,
            "the audit trail records that a customer was created, not how to reach them");
    }

    /// <summary>A refused duplicate writes a Failed row, and it names no contact detail either.</summary>
    [Fact]
    public async Task A_refused_duplicate_writes_a_failed_row_without_the_email()
    {
        var (email, phone) = Unique();
        var (_, otherPhone) = Unique();

        await PostAsync(new { fullName = "Original", email, phone });

        var conflict = await PostAsync(new { fullName = "Duplicate Attempt", email, phone = otherPhone });
        conflict.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var row = (await Audit.AuditFixture.RowsForAsync(factory, "Customer.Created"))
            .Where(entry => entry.EntityLabel == "Duplicate Attempt")
            .OrderByDescending(entry => entry.OccurredAtUtc)
            .First();

        row.Outcome.Should().Be(AuditOutcome.Failed,
            "a duplicate is a business-rule refusal, not a permission denial — Denied is reserved "
            + "for DomainErrorCodes.Forbidden");
        row.EntityId.Should().BeNull("there is no customer, so there is no id to name");

        string.Join(' ', row.EntityLabel, row.Changes).Should().NotContain(email);
    }
}
