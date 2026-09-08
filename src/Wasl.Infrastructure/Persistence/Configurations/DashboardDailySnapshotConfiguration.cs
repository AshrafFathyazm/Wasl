using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Wasl.Domain.Users;
using Wasl.Infrastructure.Persistence.Snapshots;

namespace Wasl.Infrastructure.Persistence.Configurations;

/// <summary>
/// <c>dbo.DashboardDailySnapshot</c>. `020b`.
/// </summary>
internal sealed class DashboardDailySnapshotConfiguration
    : IEntityTypeConfiguration<DashboardDailySnapshot>
{
    /// <summary>
    /// The index that makes the capture safe under concurrency.
    /// </summary>
    /// <remarks>
    /// A constant because <c>DashboardSnapshotCapture</c> matches SQL Server's duplicate-key
    /// message against this NAME rather than against error number 2601/2627 — the rule `007`
    /// established and `036` §3.1 repeated: a number matches any unique violation, so keying on it
    /// would treat an unrelated collision as "the other instance won".
    /// </remarks>
    public const string UniqueIndexName = "UX_DashboardDailySnapshot_Date_Scope";

    public void Configure(EntityTypeBuilder<DashboardDailySnapshot> builder)
    {
        builder.ToTable("DashboardDailySnapshot");
        builder.HasKey(snapshot => snapshot.Id);

        // `date`, not datetime2. The business date carries no time BY CONSTRUCTION, which is the
        // same reasoning that makes `020`'s localDate a bare string on the wire — a column that
        // cannot hold a time cannot acquire one through a converter change made elsewhere.
        builder.Property(snapshot => snapshot.LocalDate)
            .HasColumnType("date")
            .IsRequired();

        builder.Property(snapshot => snapshot.ScopeUserId);

        builder.Property(snapshot => snapshot.UnassignedCount).IsRequired();
        builder.Property(snapshot => snapshot.EscalatedOpenCount).IsRequired();
        builder.Property(snapshot => snapshot.WaitingOnCustomerCount).IsRequired();
        builder.Property(snapshot => snapshot.AssignedCount).IsRequired();

        // Nullable, and the nullability is the point: no untouched ticket is not "0 hours old".
        builder.Property(snapshot => snapshot.OldestUntouchedHours);

        // datetime2(3) and the UTC converter arrive from ConfigureConventions, which applies to
        // every DateTime in the model — so this needs no per-property configuration and gets the
        // same treatment as every other instant in the product.
        builder.Property(snapshot => snapshot.CapturedAtUtc).IsRequired();

        /* ONE ROW PER (DAY, SCOPE) — AND IT IS PLAIN, NOT FILTERED.
         *
         * `spec.md` first claimed SQL Server needed a filtered pair on `ScopeUserId IS NULL` /
         * `IS NOT NULL`. That was written without checking and it is WRONG: SQL Server compares
         * NULLs as EQUAL inside a unique index, so this single index already permits exactly one
         * TEAM row per day. Measured against the running engine — `research.md` R-1:
         *
         *     first  (2026-09-07, NULL) → inserted
         *     second (2026-09-07, NULL) → REFUSED, error 2601
         *            (2026-09-08, NULL) → inserted
         *
         * The claim came from PostgreSQL, where unique NULLs ARE distinct. `CLAUDE.md`'s note
         * about ADR-013's filtered index is about BR-4's PARTIAL uniqueness — a genuinely
         * different problem, and the resemblance is what made the wrong answer plausible.
         *
         * THIS INDEX IS THE CONCURRENCY GUARANTEE. Not a lock, and not a SELECT before the
         * INSERT: two instances capturing in the same minute converge on one row because the
         * database refuses the second, and the capture reads that refusal as success.
         *
         * ────────────────────────────────────────────────────────────────────────────────────
         * `HasFilter(null)` IS LOAD-BEARING, AND WITHOUT IT THIS INDEX PROTECTS EVERY ROW EXCEPT
         * THE ONES THAT MATTER MOST.
         *
         * EF Core's SQL Server provider adds `[ScopeUserId] IS NOT NULL` to a unique index over a
         * nullable column BY DEFAULT — a convention meant to imitate the "NULLs are distinct"
         * semantics other databases have. Caught by reading the generated migration, which said:
         *
         *     unique: true,
         *     filter: "[ScopeUserId] IS NOT NULL"
         *
         * That filter excludes every TEAM row from the index, so `(2026-09-07, NULL)` would have
         * been insertable twice and the team's snapshot would silently duplicate — the exact
         * failure the index exists to prevent, on the scope every Manager reads.
         *
         * `research.md` R-1 measured the ENGINE and was right about it; it said nothing about
         * what the TOOL emits, and the two disagree. Both halves are now recorded: the engine
         * compares NULLs as equal, and EF must be told not to opt out of that.
         * ──────────────────────────────────────────────────────────────────────────────────── */
        builder
            .HasIndex(snapshot => new { snapshot.LocalDate, snapshot.ScopeUserId })
            .IsUnique()
            .HasFilter(null)
            .HasDatabaseName(UniqueIndexName);

        /* NO CASCADE, and no cascade is a decision rather than a default.
         *
         * A SupportUser is deactivated, never deleted — `020`'s team-load card renders a
         * deactivated user who still holds work, which is only possible because the row survives.
         * If a delete is ever added, these snapshots are history and should outlive it. */
        builder
            .HasOne<SupportUser>()
            .WithMany()
            .HasForeignKey(snapshot => snapshot.ScopeUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
