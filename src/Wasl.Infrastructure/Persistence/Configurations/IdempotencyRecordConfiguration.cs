using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Wasl.Application.Common.Abstractions;
using Wasl.Infrastructure.Persistence.Idempotency;

namespace Wasl.Infrastructure.Persistence.Configurations;

/// <summary>
/// <c>dbo.IdempotencyKeys</c>. `036` §3.5.
/// </summary>
internal sealed class IdempotencyRecordConfiguration : IEntityTypeConfiguration<IdempotencyRecord>
{
    /// <summary>
    /// The index whose violation means the key is already claimed — AC-18's guarantee.
    /// </summary>
    /// <remarks>
    /// A constant because <c>IdempotencyStore</c> matches the SQL Server message against this
    /// name, exactly as `007` does for the customer indexes and `036` §3.1 now does for the tag
    /// one. Matching on the NAME rather than on error number 2601/2627 is the rule — a number
    /// matches any unique violation, so keying on it would report an unrelated collision as a
    /// claimed key.
    /// </remarks>
    public const string UniqueIndexName = "UX_IdempotencyKeys_User_Endpoint_Key";

    /// <summary>Longest header value accepted. Anything longer is a `400` before the store is reached.</summary>
    public const int KeyMaxLength = IdempotencyLimits.KeyMaxLength;

    public const int EndpointMaxLength = IdempotencyLimits.EndpointMaxLength;

    /// <summary>SHA-256, hex — fixed width, so the column is not guessing.</summary>
    public const int HashLength = IdempotencyLimits.HashLength;

    public const int LocationMaxLength = IdempotencyLimits.LocationMaxLength;

    public void Configure(EntityTypeBuilder<IdempotencyRecord> builder)
    {
        builder.ToTable("IdempotencyKeys");
        builder.HasKey(record => record.Id);

        // nvarchar, never varchar — ADR-013. A key is client-generated and this API answers in
        // two scripts; a non-ASCII key silently becoming `????` would make it collide with every
        // other non-ASCII key, which is a duplicate-suppression bug wearing an encoding bug.
        builder.Property(record => record.KeyValue)
            .HasColumnType($"nvarchar({KeyMaxLength})")

            // CASE-SENSITIVE, and that is a decision. The default database collation is
            // case-insensitive, which would make `A1b` and `a1B` the same key — two distinct
            // client-generated identifiers silently merged, so the second request replays the
            // first's response. The opposite of `008`'s email rule, and for the opposite reason:
            // an email is a human-typed name for one thing, a key is an opaque token.
            .UseCollation("SQL_Latin1_General_CP1_CS_AS")
            .IsRequired();

        builder.Property(record => record.UserId).IsRequired();

        builder.Property(record => record.Endpoint)
            .HasColumnType($"nvarchar({EndpointMaxLength})")
            .IsRequired();

        builder.Property(record => record.RequestHash)
            .HasColumnType($"nvarchar({HashLength})")
            .IsRequired();

        builder.Property(record => record.StatusCode);

        // nvarchar(max): a ticket response is small, but a stored response is whatever the action
        // returned and capping it would truncate a body into invalid JSON — a replay that parses
        // as nothing, produced only for the largest tickets.
        builder.Property(record => record.ResponseBody);

        builder.Property(record => record.Location)
            .HasColumnType($"nvarchar({LocationMaxLength})");

        // datetime2(3) by the global convention — ADR-013, and `007` AC-14's reason: full .NET
        // tick precision in memory against a truncated column makes two reads of one value differ.
        builder.Property(record => record.CreatedAtUtc).IsRequired();
        builder.Property(record => record.ExpiresAtUtc).IsRequired();

        // ── THE GUARANTEE. AC-18 ────────────────────────────────────────────────────
        //
        // Two simultaneous deliveries of one key both pass any "has this key been used" check and
        // only this index stops the second reservation. The store's lookup exists to produce a
        // clean replay for the common case — a retry after a timeout — not to make the index
        // unnecessary. `CLAUDE.md`'s first concurrency row, and the third index in this schema
        // whose violation is translated rather than allowed to become a `500`.
        //
        // (UserId, Endpoint, KeyValue) and not KeyValue alone: two users must be able to mint the
        // same key, and one key must not span two endpoints.
        builder.HasIndex(record => new { record.UserId, record.Endpoint, record.KeyValue })
            .IsUnique()
            .HasDatabaseName(UniqueIndexName);
    }
}
