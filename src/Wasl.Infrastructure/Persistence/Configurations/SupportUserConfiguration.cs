using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Wasl.Domain.Users;

namespace Wasl.Infrastructure.Persistence.Configurations;

/// <summary>
/// <c>dbo.SupportUsers</c> — the shape in `specs/004-auth-and-roles/data-model.md`.
/// </summary>
internal sealed class SupportUserConfiguration : IEntityTypeConfiguration<SupportUser>
{
    /// <summary>
    /// Case-insensitive, on the column, so the unique index can serve the sign-in lookup.
    /// </summary>
    /// <remarks>
    /// <b>By collation, not by <c>LOWER(Email)</c></b> (ADR-013 row 3). SQL Server cannot index an
    /// expression, so lowercasing in the query would give a case-insensitive comparison and an
    /// index it cannot use — a seek becomes a scan on the one query every request depends on.
    /// Written explicitly rather than relying on the server default: on a case-sensitive server
    /// `MANAGER@WASL.LOCAL` would silently fail to sign in, which AC-23 is the test for.
    /// </remarks>
    private const string CaseInsensitiveCollation = "Latin1_General_100_CI_AS";

    public void Configure(EntityTypeBuilder<SupportUser> builder)
    {
        builder.ToTable("SupportUsers");
        builder.HasKey(user => user.Id);

        builder.Property(user => user.FullName)
            .HasColumnType($"nvarchar({SupportUser.FullNameMaxLength})")
            .IsRequired();

        builder.Property(user => user.Email)
            .HasColumnType($"nvarchar({SupportUser.EmailMaxLength})")
            .UseCollation(CaseInsensitiveCollation)
            .IsRequired();

        // Unique and UNFILTERED. The login identity is unique across every row, active or not —
        // a filtered index would let a deactivated user's address be taken by someone else, and
        // then reactivation is impossible.
        builder.HasIndex(user => user.Email)
            .IsUnique()
            .HasDatabaseName("UX_SupportUsers_Email");

        // nvarchar even though a PBKDF2 hash is ASCII: the blueprint's DDL says so, and a
        // Base64 hash in a varchar column is the kind of saving that becomes a defect the day
        // the hash format changes.
        builder.Property(user => user.PasswordHash)
            .HasColumnType($"nvarchar({SupportUser.PasswordHashMaxLength})")
            .IsRequired();

        builder.Property(user => user.Role)
            .HasConversion<string>()
            .HasColumnType("nvarchar(20)")
            .IsRequired();

        builder.Property(user => user.PreferredLanguage)
            .HasColumnType("nvarchar(5)")
            .IsRequired();

        // NO column default on IsActive or PreferredLanguage, and this is a deliberate departure
        // from `data-model.md`, which specifies DF_SupportUsers_Active and DF_SupportUsers_Lang.
        //
        // `001` shipped exactly that default on Customers.IsActive and it was a defect: EF applies
        // a database default whenever the property holds the CLR default, and for bool that is
        // false — so deactivating a user would have stored them as active. `SupportUser.Create`
        // sets both explicitly. One source of truth for a default.
        builder.Property(user => user.IsActive).IsRequired();

        builder.Property(user => user.RowVersion).IsRowVersion();

        // ── The four foreign keys `009` deferred ─────────────────────────────────────────
        //
        // `009`'s data-model.md claimed this table already existed; it did not, so the keys were
        // deferred here with the reason recorded. Each is NO ACTION, and that is not a rename of
        // RESTRICT — it is the only choice SQL Server allows.
        //
        // Three of them point from dbo.Tickets to this table. If any one cascaded there would be
        // multiple cascade paths from SupportUsers into Tickets and onward into TicketHistory,
        // and SQL Server REJECTS multiple cascade paths at CREATE TABLE time — not at delete
        // time. The migration would fail with "may cause cycles or multiple cascade paths", which
        // reads as an EF bug and is not one.
        builder.HasMany<Wasl.Domain.Tickets.Ticket>()
            .WithOne()
            .HasForeignKey(ticket => ticket.CreatedByUserId)
            .OnDelete(DeleteBehavior.NoAction)
            .HasConstraintName("FK_Tickets_CreatedBy");

        builder.HasMany<Wasl.Domain.Tickets.Ticket>()
            .WithOne()
            .HasForeignKey(ticket => ticket.AssignedToUserId)
            .OnDelete(DeleteBehavior.NoAction)
            .HasConstraintName("FK_Tickets_Assignee");

        builder.HasMany<Wasl.Domain.Tickets.Ticket>()
            .WithOne()
            .HasForeignKey(ticket => ticket.EscalatedByUserId)
            .OnDelete(DeleteBehavior.NoAction)
            .HasConstraintName("FK_Tickets_EscalatedBy");

        builder.HasMany<Wasl.Domain.Tickets.TicketHistoryEntry>()
            .WithOne()
            .HasForeignKey(entry => entry.PerformedByUserId)
            .OnDelete(DeleteBehavior.NoAction)
            .HasConstraintName("FK_TicketHistory_PerformedBy");
    }
}
