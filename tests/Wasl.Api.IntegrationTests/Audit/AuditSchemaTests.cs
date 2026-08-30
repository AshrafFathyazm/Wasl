using FluentAssertions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Audit;

/// <summary>
/// AC-1 to AC-5, read from the catalogue rather than from the migration file.
/// </summary>
/// <remarks>
/// The migration is what would be wrong, so it is not evidence. Every assertion here queries
/// <c>sys.*</c> or <c>INFORMATION_SCHEMA</c> against a real engine — which is also why EF
/// <c>InMemory</c> is never used in this suite: it would report all of this as fine.
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class AuditSchemaTests(WaslApiFactory factory)
{
    private async Task<List<Dictionary<string, object?>>> QueryAsync(string sql)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await using var connection = new SqlConnection(factory.MigratorConnectionString);
        await connection.OpenAsync();

        await using var command = new SqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();

        var rows = new List<Dictionary<string, object?>>();

        while (await reader.ReadAsync())
        {
            var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

            for (var i = 0; i < reader.FieldCount; i++)
            {
                row[reader.GetName(i)] = await reader.IsDBNullAsync(i) ? null : reader.GetValue(i);
            }

            rows.Add(row);
        }

        return rows;
    }

    private async Task<int> ExecuteAsync(string sql)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await using var connection = new SqlConnection(factory.MigratorConnectionString);
        await connection.OpenAsync();

        await using var command = new SqlCommand(sql, connection);
        return await command.ExecuteNonQueryAsync();
    }

    /// <summary>AC-1. Columns, types, nullability, lengths.</summary>
    [Fact]
    public async Task The_table_has_exactly_the_documented_columns()
    {
        var rows = await QueryAsync(
            """
            SELECT  COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
            FROM    INFORMATION_SCHEMA.COLUMNS
            WHERE   TABLE_NAME = 'AuditLog'
            """);

        var columns = rows.ToDictionary(
            row => (string)row["COLUMN_NAME"]!,
            row => (
                Type: (string)row["DATA_TYPE"]!,
                Nullable: (string)row["IS_NULLABLE"]! == "YES",
                Length: row["CHARACTER_MAXIMUM_LENGTH"] as int?),
            StringComparer.Ordinal);

        columns.Keys.Should().BeEquivalentTo(
            [
                "Id", "OccurredAtUtc", "ActorUserId", "ActorEmail", "ActorRole", "Action",
                "EntityType", "EntityId", "EntityLabel", "Outcome", "Changes", "TraceId",
                "IpAddress", "UserAgent",
            ],
            "data-model.md lists fourteen columns. An extra one is scope creep and a missing "
            + "one is a defect the row shape hides");

        columns["Id"].Type.Should().Be("bigint", "AC-1 — the only non-uniqueidentifier key");
        columns["Id"].Nullable.Should().BeFalse();

        columns["OccurredAtUtc"].Type.Should().Be("datetime2");
        columns["ActorUserId"].Type.Should().Be("uniqueidentifier");
        columns["ActorUserId"].Nullable.Should().BeTrue("a failed sign-in has no actor");

        columns["ActorEmail"].Length.Should().Be(320);
        columns["Action"].Length.Should().Be(80);
        columns["Action"].Nullable.Should().BeFalse();

        // nvarchar, never varchar, for anything a human writes — varchar returns ???? for
        // Arabic and presents as a font bug (ADR-013 row 4).
        columns["ActorEmail"].Type.Should().Be("nvarchar");
        columns["EntityLabel"].Type.Should().Be("nvarchar");
        columns["UserAgent"].Type.Should().Be("nvarchar");
        columns["Changes"].Type.Should().Be("nvarchar");
        columns["Changes"].Length.Should().Be(-1, "nvarchar(max) reports -1");

        // varchar deliberately: a W3C traceparent and an IP address are ASCII by definition,
        // and this is the highest-volume table in the schema.
        columns["TraceId"].Type.Should().Be("varchar");
        columns["TraceId"].Nullable.Should().BeFalse("BR-9.9 — a row nobody can correlate");
        columns["IpAddress"].Type.Should().Be("varchar");
        columns["IpAddress"].Length.Should().Be(45, "the longest IPv6 form");
    }

    /// <summary>AC-1. IDENTITY, not a client-assigned key.</summary>
    [Fact]
    public async Task The_key_is_an_identity_column()
    {
        var rows = await QueryAsync(
            """
            SELECT  is_identity, seed_value, increment_value
            FROM    sys.identity_columns
            WHERE   object_id = OBJECT_ID('dbo.AuditLog')
            """);

        rows.Should().HaveCount(1, "IDENTITY(1,1) on Id");
        Convert.ToInt32(rows[0]["seed_value"]).Should().Be(1);
        Convert.ToInt32(rows[0]["increment_value"]).Should().Be(1);
    }

    /// <summary>AC-2. No foreign key, deliberately.</summary>
    [Fact]
    public async Task The_table_has_no_foreign_key()
    {
        var rows = await QueryAsync(
            """
            SELECT  COUNT(*) AS ForeignKeys
            FROM    sys.foreign_keys
            WHERE   parent_object_id = OBJECT_ID('dbo.AuditLog')
            """);

        Convert.ToInt32(rows[0]["ForeignKeys"]).Should().Be(0,
            "BR-9.12. An audit row must be able to record a deletion and still exist "
            + "afterwards. Asserted rather than assumed because EF infers relationships from "
            + "shapes, and a Guid property beside a matching table is such a shape");
    }

    /// <summary>
    /// AC-3. All four indexes, <b>by name</b>, and the filtered one carrying its filter.
    /// </summary>
    /// <remarks>
    /// Asserting the names is not pedantry. The first version of the EF configuration used the
    /// unnamed <c>HasIndex</c> overload for both indexes over <c>OccurredAtUtc</c>, and EF
    /// silently merged them — the generated migration had three indexes, and the one that
    /// vanished was the unfiltered one. A check that only looked for the filter would have
    /// passed.
    /// </remarks>
    [Fact]
    public async Task All_four_indexes_exist_and_the_filtered_one_kept_its_filter()
    {
        var rows = await QueryAsync(
            """
            SELECT  name, has_filter, filter_definition
            FROM    sys.indexes
            WHERE   object_id = OBJECT_ID('dbo.AuditLog') AND name IS NOT NULL AND is_primary_key = 0
            """);

        var indexes = rows.ToDictionary(
            row => (string)row["name"]!,
            row => (Filtered: (bool)row["has_filter"]!, Definition: row["filter_definition"] as string),
            StringComparer.Ordinal);

        indexes.Keys.Should().BeEquivalentTo(
            ["IX_AuditLog_Time", "IX_AuditLog_Entity", "IX_AuditLog_Actor", "IX_AuditLog_NotSuccess"],
            "four indexes, each serving a named query in contracts/README.md");

        indexes["IX_AuditLog_NotSuccess"].Filtered.Should().BeTrue(
            "a filtered index created without its WHERE clause is a valid index over the whole "
            + "table, so nothing errors and the only symptom is a slow query during an incident");

        indexes["IX_AuditLog_NotSuccess"].Definition.Should().NotBeNull()
            .And.Subject.Should().Contain("Success");

        indexes["IX_AuditLog_Time"].Filtered.Should().BeFalse(
            "the time index must cover every row, not only the failures");
    }

    /// <summary>AC-4. The check constraint rejects malformed JSON and accepts null.</summary>
    [Fact]
    public async Task The_changes_column_rejects_invalid_json_and_accepts_null()
    {
        // Through ADO.NET, not EF's ExecuteSqlRaw, and the reason is a real trap.
        //
        // ExecuteSqlRaw performs `{n}` placeholder substitution on the SQL it is given — so
        // the deliberately malformed value `{not json` was parsed as a format placeholder and
        // the call threw FormatException before reaching SQL Server. The test reported "no
        // SqlException" and the check constraint was never exercised at all: a test that
        // looked like it was asserting a database constraint while never touching the database.
        const string insertInvalid =
            """
            INSERT INTO dbo.AuditLog (OccurredAtUtc, Action, Outcome, TraceId, Changes)
            VALUES (SYSUTCDATETIME(), 'Probe.CheckConstraint', 'Success', 'trace-check', '{not json')
            """;

        const string insertNull =
            """
            INSERT INTO dbo.AuditLog (OccurredAtUtc, Action, Outcome, TraceId, Changes)
            VALUES (SYSUTCDATETIME(), 'Probe.CheckConstraint', 'Success', 'trace-check', NULL)
            """;

        var invalid = () => ExecuteAsync(insertInvalid);

        (await invalid.Should().ThrowAsync<SqlException>())
            .Which.Message.Should().Contain("CK_AuditLog_ChangesIsJson",
                "SQL Server has no jsonb (ADR-013 row 6), so this constraint is the only thing "
                + "keeping a malformed diff out of an nvarchar(max) column");

        var accepted = await ExecuteAsync(insertNull);

        accepted.Should().Be(1, "null is legal — an empty diff is null, never []");
    }

    /// <summary>AC-5. No concurrency token and no update timestamp, in the database.</summary>
    /// <remarks>
    /// The domain test asserts the properties are absent from the CLR type. This asserts the
    /// columns are absent from the table, which is the claim that survives someone adding a
    /// shadow property.
    /// </remarks>
    [Fact]
    public async Task The_table_has_no_rowversion_and_no_updated_timestamp()
    {
        var rows = await QueryAsync(
            """
            SELECT  c.name, t.name AS TypeName
            FROM    sys.columns c
            JOIN    sys.types t ON t.user_type_id = c.user_type_id
            WHERE   c.object_id = OBJECT_ID('dbo.AuditLog')
            """);

        rows.Select(row => (string)row["TypeName"]!)
            .Should().NotContain("timestamp",
                "rowversion surfaces as the `timestamp` type. Append-only means no second "
                + "writer to conflict with (research.md R-10)");

        rows.Select(row => (string)row["name"]!)
            .Should().NotContain("UpdatedAtUtc",
                "nothing updates a row, and a column for it would be an invitation");
    }
}
