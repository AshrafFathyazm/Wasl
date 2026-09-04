using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Domain.Audit;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Customers;

/// <summary>
/// <c>PUT /api/customers/{id}</c>. `017`'s frozen contract, built by `035`.
/// </summary>
/// <remarks>
/// Every test mints its own contact values: the suite shares one database and half of this
/// endpoint's behaviour is about uniqueness. Nothing here counts rows in a whole table.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class UpdateCustomerTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    /// <summary>
    /// A unique local-part and national number per call.
    /// </summary>
    /// <remarks>
    /// <b><c>RandomNumberGenerator</c>, not a slice of a <c>Guid</c>.</b> A v7 GUID leads with a
    /// timestamp, so two minted in the same millisecond share their leading hex digits — `008`
    /// matched the wrong row that way and `007` collided on a unique index the very next feature.
    /// </remarks>
    private static (string Email, string Phone) Unique()
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();
        var digits = Random.Shared.NextInt64(100_000_000, 999_999_999);

        return ($"u{token}@example.com", $"+96650{digits}");
    }

    /// <summary>Creates a customer through the real endpoint and returns its body.</summary>
    /// <remarks>
    /// <b>Through the API, not through the context.</b> `009`, `011` and `007` each shipped an
    /// entity that only ever got written from outside the real path, and each looked like a
    /// different bug — an invented enum member, a NULL actor on every history row, a CLR-default
    /// timestamp served as a fact. An update test whose subject was inserted with raw SQL would
    /// be asserting against a row no request had ever produced.
    /// </remarks>
    private async Task<JsonElement> CreateAsync(string? name = null)
    {
        var (email, phone) = Unique();
        var response = await factory.CreateEnglishManagerClient().PostAsJsonAsync(
            "/api/customers",
            new
            {
                fullName = name ?? $"Update subject {Guid.CreateVersion7():N}",
                email,
                phone,
                companyName = "Northwind Logistics",
                notes = "Prefers WhatsApp.",
            });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return await BodyOf(response);
    }

    private Task<HttpResponseMessage> PutAsync(Guid id, object body) =>
        factory.CreateEnglishManagerClient().PutAsJsonAsync($"/api/customers/{id}", body);

    private static Guid IdOf(JsonElement body) => body.GetProperty("id").GetGuid();

    private static string VersionOf(JsonElement body) => body.GetProperty("version").GetString()!;

    // ── the happy path, and the version it returns ──────────────────────────────────

    /// <summary>
    /// AC-1, AC-23 — a valid update returns the full resource with a NEW version, and a
    /// <c>GET</c> returns the identical body.
    /// </summary>
    /// <remarks>
    /// <b>The two bodies are compared as raw JSON, not field by field.</b> `007` AC-14 found what
    /// a field-by-field comparison walks past: a create returned
    /// <c>"…57.7129947Z"</c> and the <c>GET</c> <c>"…57.712Z"</c> — full .NET tick precision in
    /// memory against <c>datetime2(3)</c> in the column. Every create in the product had that
    /// shape.
    /// </remarks>
    [Fact]
    public async Task A_valid_update_returns_the_resource_and_a_get_returns_the_same_bytes()
    {
        var created = await CreateAsync();
        var (email, phone) = Unique();

        var response = await PutAsync(IdOf(created), new
        {
            fullName = "علي الأحمد",
            email,
            phone,
            companyName = "Riyadh Holdings Group",
            notes = "Renews in January.",
            expectedVersion = VersionOf(created),
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await BodyOf(response);

        updated.GetProperty("fullName").GetString().Should().Be("علي الأحمد");
        updated.GetProperty("email").GetString().Should().Be(email);
        updated.GetProperty("companyName").GetString().Should().Be("Riyadh Holdings Group");

        VersionOf(updated).Should().NotBe(VersionOf(created),
            "the row changed, so its rowversion must have");

        var read = await factory.CreateEnglishManagerClient()
            .GetAsync($"/api/customers/{IdOf(created)}");
        var readText = await read.Content.ReadAsStringAsync();
        var updatedText = await response.Content.ReadAsStringAsync();

        readText.Should().Be(updatedText, "byte for byte, not field by field");
    }

    /// <summary>
    /// AC-23 — the version the response carries is immediately usable on the next <c>PUT</c>.
    /// </summary>
    /// <remarks>
    /// Two saves in a row from one screen. Without this, a client would have to refetch between
    /// every pair of edits and nothing would say so.
    /// </remarks>
    [Fact]
    public async Task The_returned_version_works_on_the_next_update()
    {
        var created = await CreateAsync();
        var (firstEmail, _) = Unique();

        var first = await PutAsync(IdOf(created), new
        {
            fullName = "First save",
            email = firstEmail,
            expectedVersion = VersionOf(created),
        });
        first.StatusCode.Should().Be(HttpStatusCode.OK);

        var (secondEmail, _) = Unique();
        var second = await PutAsync(IdOf(created), new
        {
            fullName = "Second save",
            email = secondEmail,
            expectedVersion = VersionOf(await BodyOf(first)),
        });

        second.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── it replaces, and that is the dangerous part ─────────────────────────────────

    /// <summary>
    /// AC-12 — an omitted optional field is <b>cleared</b>. <c>PUT</c> replaces; it does not
    /// merge.
    /// </summary>
    /// <remarks>
    /// <b>This is the contract's own warning, asserted.</b> "The only failure on this endpoint
    /// that produces no error at all: the request succeeds, returns <c>200</c>, and four fields
    /// are gone." A handler that skipped nulls would make the endpoint behave like <c>PATCH</c>
    /// with nothing on the wire saying so, and this test is the difference between the two.
    /// </remarks>
    [Fact]
    public async Task An_omitted_optional_field_is_cleared_rather_than_kept()
    {
        var created = await CreateAsync();
        created.GetProperty("companyName").GetString().Should().NotBeNull(
            "the subject must start with the fields this test clears");
        created.GetProperty("notes").GetString().Should().NotBeNull();

        var response = await PutAsync(IdOf(created), new
        {
            fullName = created.GetProperty("fullName").GetString(),
            email = created.GetProperty("email").GetString(),
            expectedVersion = VersionOf(created),
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await BodyOf(response);

        updated.GetProperty("phone").ValueKind.Should().Be(JsonValueKind.Null);
        updated.GetProperty("companyName").ValueKind.Should().Be(JsonValueKind.Null);
        updated.GetProperty("notes").ValueKind.Should().Be(JsonValueKind.Null);
    }

    // ── the version check, and its ordering ─────────────────────────────────────────

    /// <summary>AC-4 — a stale version is <c>409 concurrency-conflict</c>.</summary>
    [Fact]
    public async Task A_stale_version_is_a_concurrency_conflict()
    {
        var created = await CreateAsync();
        var stale = VersionOf(created);

        var (email, _) = Unique();
        var first = await PutAsync(IdOf(created), new
        {
            fullName = "Moved on",
            email,
            expectedVersion = stale,
        });
        first.StatusCode.Should().Be(HttpStatusCode.OK);

        var (second, _) = Unique();
        var response = await PutAsync(IdOf(created), new
        {
            fullName = "Using the old token",
            email = second,
            expectedVersion = stale,
        });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await BodyOf(response);
        body.GetProperty("type").GetString().Should().EndWith("errors/concurrency-conflict");
    }

    /// <summary>
    /// The version is checked <b>before</b> the duplicate rule, and the answer proves the order.
    /// </summary>
    /// <remarks>
    /// <b>`012` measured why this ordering matters.</b> A stale client whose email also collides
    /// gets <c>concurrency-conflict</c>, not <c>duplicate-customer</c>: it is told to refetch,
    /// which is the only thing that can help. The other order tells it to change the email, it
    /// does, and the next request is refused for being stale anyway — two round trips to learn
    /// the first fact.
    /// </remarks>
    [Fact]
    public async Task A_request_that_is_both_stale_and_duplicate_answers_stale()
    {
        var neighbour = await CreateAsync();
        var subject = await CreateAsync();
        var stale = VersionOf(subject);

        // move the subject on, so `stale` is genuinely old
        var (moved, _) = Unique();
        (await PutAsync(IdOf(subject), new
        {
            fullName = "Moved on",
            email = moved,
            expectedVersion = stale,
        })).StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await PutAsync(IdOf(subject), new
        {
            fullName = "Both wrong at once",
            email = neighbour.GetProperty("email").GetString(),
            expectedVersion = stale,
        });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().EndWith("errors/concurrency-conflict",
                "the version is checked first, so the caller is told to refetch");
    }

    /// <summary>AC-13 — a MISSING version is a `400`, not a `409`.</summary>
    /// <remarks>
    /// Three different answers for three different faults: absent is `400`, undecodable is `400`,
    /// stale is `409`. Treating absent as "no opinion" would turn every client that forgets the
    /// field into a last-write-wins client, silently.
    /// </remarks>
    [Fact]
    public async Task A_missing_version_is_a_400_naming_the_field()
    {
        var created = await CreateAsync();
        var (email, _) = Unique();

        var response = await PutAsync(IdOf(created), new { fullName = "No token", email });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var text = (await BodyOf(response)).GetProperty("errors")
            .GetProperty("expectedVersion")
            .EnumerateArray()
            .Single()
            .GetString()!;

        // THE MESSAGE IS READ, not counted. `errors[field]` with one entry is a shape assertion,
        // and seventeen raw resource keys once shipped under exactly that check.
        text.Should().NotStartWith("Validation.");
        text.Should().Contain("version");
    }

    /// <summary>AC-14 — an undecodable version is a `400`, and the length is checked first.</summary>
    /// <remarks>
    /// `004b` AC-38: <c>Convert.TryFromBase64String</c> needs a destination buffer the size of the
    /// INPUT, so a ten-megabyte string allocates ten megabytes before being refused. The length
    /// rule runs first and <c>Cascade.Stop</c> is what makes that ordering real.
    /// </remarks>
    [Fact]
    public async Task An_undecodable_version_is_a_400()
    {
        var created = await CreateAsync();
        var (email, _) = Unique();

        var response = await PutAsync(IdOf(created), new
        {
            fullName = "Bad token",
            email,
            expectedVersion = "not base64 at all!!",
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await BodyOf(response)).GetProperty("errors")
            .TryGetProperty("expectedVersion", out _).Should().BeTrue();
    }

    /// <summary>An over-long version token is refused before any buffer is allocated.</summary>
    [Fact]
    public async Task An_over_long_version_is_a_400()
    {
        var created = await CreateAsync();
        var (email, _) = Unique();

        var response = await PutAsync(IdOf(created), new
        {
            fullName = "Long token",
            email,
            expectedVersion = new string('A', 5000),
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── the duplicate rule, scoped to a DIFFERENT customer ─────────────────────────

    /// <summary>
    /// <b>Saving without changing the contact values is not a duplicate of itself.</b>
    /// </summary>
    /// <remarks>
    /// The pre-check has to exclude the row being updated. Without <c>c.Id != request.Id</c> this
    /// endpoint answers `409` to every no-op save — the most common request it will ever get —
    /// and the failure is indistinguishable from a real conflict.
    /// </remarks>
    [Fact]
    public async Task Re_saving_a_customer_with_its_own_contacts_is_not_a_duplicate()
    {
        var created = await CreateAsync();

        var response = await PutAsync(IdOf(created), new
        {
            fullName = "Renamed only",
            email = created.GetProperty("email").GetString(),
            phone = created.GetProperty("phone").GetString(),
            expectedVersion = VersionOf(created),
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await BodyOf(response)).GetProperty("fullName").GetString().Should().Be("Renamed only");
    }

    /// <summary>BR-4.4 — another active customer's email is `409 duplicate-customer`.</summary>
    /// <remarks>
    /// The body names the FIELD and nothing else — no id, no name (BR-4.7). Asserted, because a
    /// `409` that leaked either would tell the caller about a record they were told nothing about.
    /// </remarks>
    [Fact]
    public async Task Another_customers_email_is_a_duplicate_naming_only_the_field()
    {
        var neighbour = await CreateAsync("Neighbour");
        var subject = await CreateAsync("Subject");

        var response = await PutAsync(IdOf(subject), new
        {
            fullName = "Trying to take an email",
            email = neighbour.GetProperty("email").GetString(),
            expectedVersion = VersionOf(subject),
        });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await BodyOf(response);

        body.GetProperty("type").GetString().Should().EndWith("errors/duplicate-customer");
        body.GetProperty("errors").TryGetProperty("email", out _).Should().BeTrue();

        var raw = await response.Content.ReadAsStringAsync();
        raw.Should().NotContain(IdOf(neighbour).ToString(), "BR-4.7 — no id");
        raw.Should().NotContain("Neighbour", "BR-4.7 — no name");
    }

    /// <summary>BR-4.5 — the same for a phone.</summary>
    [Fact]
    public async Task Another_customers_phone_is_a_duplicate()
    {
        var neighbour = await CreateAsync();
        var subject = await CreateAsync();
        var (email, _) = Unique();

        var response = await PutAsync(IdOf(subject), new
        {
            fullName = "Trying to take a phone",
            email,
            phone = neighbour.GetProperty("phone").GetString(),
            expectedVersion = VersionOf(subject),
        });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await BodyOf(response)).GetProperty("errors")
            .TryGetProperty("phone", out _).Should().BeTrue();
    }

    // ── BR-4.1, BR-4.3 ─────────────────────────────────────────────────────────────

    /// <summary>
    /// AC-3 — clearing both contact methods is a `400` naming <b>both</b> fields.
    /// </summary>
    /// <remarks>
    /// Because <c>PUT</c> replaces, this is reachable by simply omitting them — which is the whole
    /// reason BR-4.1 has to be re-checked on an update rather than only on a create.
    /// </remarks>
    [Fact]
    public async Task Clearing_both_contact_methods_is_a_400_naming_both()
    {
        var created = await CreateAsync();

        var response = await PutAsync(IdOf(created), new
        {
            fullName = "No way to reach them",
            expectedVersion = VersionOf(created),
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var errors = (await BodyOf(response)).GetProperty("errors");

        errors.TryGetProperty("email", out var emailErrors).Should().BeTrue();
        errors.TryGetProperty("phone", out _).Should().BeTrue();
        emailErrors.EnumerateArray().Single().GetString().Should().NotStartWith("Validation.");
    }

    /// <summary>AC-10 — an unparseable phone is a `400` naming `phone`, never a `409`.</summary>
    [Fact]
    public async Task An_unparseable_phone_is_a_400_and_not_a_conflict()
    {
        var created = await CreateAsync();
        var (email, _) = Unique();

        var response = await PutAsync(IdOf(created), new
        {
            fullName = "Bad phone",
            email,
            phone = "not a phone number",
            expectedVersion = VersionOf(created),
        });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await BodyOf(response)).GetProperty("errors")
            .TryGetProperty("phone", out _).Should().BeTrue();
    }

    /// <summary>BR-4.2 — the email is trimmed and lowercased before storage.</summary>
    [Fact]
    public async Task The_email_is_normalised_before_it_is_stored()
    {
        var created = await CreateAsync();
        var (email, _) = Unique();

        var response = await PutAsync(IdOf(created), new
        {
            fullName = "Normalising",
            email = $"  {email.ToUpperInvariant()}  ",
            expectedVersion = VersionOf(created),
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await BodyOf(response)).GetProperty("email").GetString().Should().Be(email);
    }

    // ── not found ──────────────────────────────────────────────────────────────────

    /// <summary>An unknown id is `404`, and it is checked before the version.</summary>
    [Fact]
    public async Task An_unknown_id_is_a_404()
    {
        var (email, _) = Unique();

        var response = await PutAsync(Guid.CreateVersion7(), new
        {
            fullName = "Nobody",
            email,
            expectedVersion = Convert.ToBase64String(new byte[8]),
        });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── BR-9 ───────────────────────────────────────────────────────────────────────

    /// <summary>
    /// AC-13 (of `035`) — a successful update writes ONE audit row naming the actor and the
    /// customer.
    /// </summary>
    /// <remarks>
    /// <b>Scoped to this customer's id, never <c>COUNT(*)</c> over the table.</b> The suite shares
    /// one database, so a whole-table count is wrong the moment a second test runs and fails
    /// intermittently depending on order.
    /// <para>
    /// <b>And the CONTENT is read, not the presence.</b> `003` moved its interceptor one hook
    /// later and four tests went red while the row still existed and <c>COUNT(*)</c> still
    /// returned 1 — <c>Changes</c> came back <c>null</c> on every command.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_successful_update_writes_one_audit_row_with_an_actor()
    {
        var created = await CreateAsync();
        var id = IdOf(created);
        var (email, _) = Unique();

        (await PutAsync(id, new
        {
            fullName = "Audited",
            email,
            expectedVersion = VersionOf(created),
        })).StatusCode.Should().Be(HttpStatusCode.OK);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var rows = await db.Set<AuditEntry>()
            .Where(e => e.Action == "Customer.Updated" && e.EntityId == id)
            .ToListAsync();

        rows.Should().HaveCount(1);
        rows[0].ActorUserId.Should().NotBeNull("MapInboundClaims = false is what keeps this set");
        rows[0].Outcome.Should().Be(AuditOutcome.Success);
        rows[0].Changes.Should().NotBeNullOrWhiteSpace("a row with no diff is a row with no use");
    }

    /// <summary>
    /// A rejected update writes a <c>Denied</c>/<c>Failed</c> row and does <b>not</b> write a
    /// <c>Succeeded</c> one.
    /// </summary>
    /// <remarks>
    /// The interesting half is the absence: BR-9 puts the audit row in the same transaction as the
    /// change, so a rolled-back update must leave no success row behind. Asserted by forcing the
    /// failure rather than by reading the happy path.
    /// </remarks>
    [Fact]
    public async Task A_rejected_update_writes_no_succeeded_row()
    {
        var neighbour = await CreateAsync();
        var subject = await CreateAsync();
        var id = IdOf(subject);

        (await PutAsync(id, new
        {
            fullName = "Rejected",
            email = neighbour.GetProperty("email").GetString(),
            expectedVersion = VersionOf(subject),
        })).StatusCode.Should().Be(HttpStatusCode.Conflict);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var succeeded = await db.Set<AuditEntry>()
            .Where(e => e.Action == "Customer.Updated"
                && e.EntityId == id
                && e.Outcome == AuditOutcome.Success)
            .CountAsync();

        succeeded.Should().Be(0, "the transaction rolled back, so its audit row went with it");
    }

    // ── the entity's own guard ─────────────────────────────────────────────────────

    /// <summary>
    /// The stored row actually changed — read back through the context, not through the response.
    /// </summary>
    /// <remarks>
    /// The response is built from the tracked entity, so it would report a change that
    /// <c>SaveChangesAsync</c> never persisted. This reads the database.
    /// </remarks>
    [Fact]
    public async Task The_row_in_the_database_carries_the_new_values()
    {
        var created = await CreateAsync();
        var id = IdOf(created);
        var (email, phone) = Unique();

        (await PutAsync(id, new
        {
            fullName = "  Persisted Name  ",
            email,
            phone,
            companyName = "  Trimmed Co  ",
            expectedVersion = VersionOf(created),
        })).StatusCode.Should().Be(HttpStatusCode.OK);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WaslDbContext>();
        var row = await db.Customers.AsNoTracking().SingleAsync(c => c.Id == id);

        row.FullName.Should().Be("Persisted Name", "trimmed, per the factory's own rule");
        row.Email.Should().Be(email);
        row.PhoneE164.Should().Be(phone);
        row.CompanyName.Should().Be("Trimmed Co");
        row.Notes.Should().BeNull("it was omitted, and PUT clears what it omits");
        row.IsActive.Should().BeTrue("Update does not touch IsActive");
        row.UpdatedAtUtc.Should().BeAfter(row.CreatedAtUtc);
    }
}
