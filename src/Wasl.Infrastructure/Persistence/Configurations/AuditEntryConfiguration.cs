using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Wasl.Domain.Audit;

namespace Wasl.Infrastructure.Persistence.Configurations;

/// <summary>
/// <c>dbo.AuditLog</c> — the physical shape in `specs/003-audit-trail/data-model.md`.
/// </summary>
/// <remarks>
/// Four things here are provider-coupled and three of them fail quietly if written wrong.
/// Each carries its own comment at the point of use rather than in a block at the top,
/// because the place a mistake gets made is the line, not the summary.
/// </remarks>
internal sealed class AuditEntryConfiguration : IEntityTypeConfiguration<AuditEntry>
{
    public void Configure(EntityTypeBuilder<AuditEntry> builder)
    {
        builder.ToTable("AuditLog", table => table.HasCheckConstraint(
            "CK_AuditLog_ChangesIsJson",
            // SQL Server has no jsonb (ADR-013 row 6). This check is the only thing keeping
            // a malformed diff out of an nvarchar(max) column, and AC-4 proves it rejects one.
            "[Changes] IS NULL OR ISJSON([Changes]) = 1"));

        // bigint IDENTITY(1,1) — the only non-uniqueidentifier key in the schema. ADR-008
        // makes the case for it here and nowhere else: append-only, high volume, always read
        // in time order.
        builder.HasKey(entry => entry.Id);
        builder.Property(entry => entry.Id).ValueGeneratedOnAdd();

        // datetime2(3) and the UTC value converter both come from 001's ConfigureConventions,
        // which applies them to every DateTime in the model. Not restated here — a second
        // declaration is a second thing to keep in step.
        builder.Property(entry => entry.OccurredAtUtc).IsRequired();

        // No foreign key on ActorUserId or EntityId, deliberately (BR-9.12, ADR-008). An
        // audit row must be able to record a deletion and still exist afterwards. AC-2
        // asserts sys.foreign_keys is empty for this table, because "we did not add one" and
        // "EF did not infer one" are different claims.

        // No collation override on ActorEmail. ADR-013 row 3 puts the CI collation on the two
        // columns where uniqueness is compared; this one is never compared, only read, and a
        // blanket collation changes comparison semantics where it was never wanted.
        builder.Property(entry => entry.ActorEmail).HasColumnType("nvarchar(320)");

        builder.Property(entry => entry.ActorRole).HasColumnType("nvarchar(20)");

        builder.Property(entry => entry.Action)
            .HasColumnType("nvarchar(80)")
            .IsRequired();

        builder.Property(entry => entry.EntityType).HasColumnType("nvarchar(50)");

        builder.Property(entry => entry.EntityLabel).HasColumnType("nvarchar(200)");

        // Persisted as a string, not an int. A database dump stays readable without the enum
        // beside it, and reordering the members cannot silently re-label existing rows —
        // which, in a table nothing ever updates, would be unrecoverable.
        builder.Property(entry => entry.Outcome)
            .HasConversion<string>()
            .HasColumnType("nvarchar(20)")
            .IsRequired();

        // No CHECK constraint on Outcome: the domain is the constraint, consistent with every
        // other enum column in this schema (03-domain-model.md, "No lookup tables").

        builder.Property(entry => entry.Changes).HasColumnType("nvarchar(max)");

        // varchar, not nvarchar, and that is not an oversight. A W3C traceparent is ASCII by
        // definition, so nvarchar would double the width of a column on every row of the
        // highest-volume table in the schema for no reachable value.
        builder.Property(entry => entry.TraceId)
            .HasColumnType("varchar(64)")
            .IsRequired();

        // 45 characters is the longest IPv6 form. varchar for the same reason as TraceId.
        builder.Property(entry => entry.IpAddress).HasColumnType("varchar(45)");

        // nvarchar: a user agent is not guaranteed ASCII, and AuditEntry.For truncates to
        // this width so a long header can never throw on the write it is recording.
        builder.Property(entry => entry.UserAgent)
            .HasColumnType($"nvarchar({AuditEntry.UserAgentMaxLength})");

        // ── Four indexes, each serving a named query in contracts/README.md ──────────────
        //
        // Two of them cover the SAME column — OccurredAtUtc — and that is why both use the
        // NAMED HasIndex overload. EF Core identifies an unnamed index by its property set,
        // so two unnamed HasIndex calls over one property are the same index: the second
        // configuration replaces the first, the model builder reports nothing, and the
        // migration comes out with three indexes instead of four.
        //
        // That is not hypothetical. The first version of this file used the unnamed overload
        // and the generated migration was missing IX_AuditLog_Time entirely — the filtered
        // one survived, so a check that only asserted "the filter is present" would have
        // passed. AC-3 asserts all four exist BY NAME for this reason.
        builder.HasIndex(entry => entry.OccurredAtUtc, "IX_AuditLog_Time")
            .IsDescending();

        builder.HasIndex(entry => new { entry.EntityType, entry.EntityId, entry.OccurredAtUtc })
            .IsDescending(false, false, true)
            .HasDatabaseName("IX_AuditLog_Entity");

        builder.HasIndex(entry => new { entry.ActorUserId, entry.OccurredAtUtc })
            .IsDescending(false, true)
            .HasDatabaseName("IX_AuditLog_Actor");

        // The filtered one. This is the line that fails silently: a filtered index created
        // without its WHERE clause is a valid index over the whole table, so nothing errors
        // and the only symptom is a slow query on an incident. AC-3 therefore reads
        // sys.indexes.filter_definition and requires it non-null — the migration file is not
        // evidence, because the migration file is what would be wrong.
        builder.HasIndex(entry => entry.OccurredAtUtc, "IX_AuditLog_NotSuccess")
            .IsDescending()
            .HasFilter("[Outcome] <> 'Success'");
    }
}
