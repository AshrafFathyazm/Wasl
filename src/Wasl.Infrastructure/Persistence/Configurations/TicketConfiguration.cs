using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Wasl.Domain.Tickets;

namespace Wasl.Infrastructure.Persistence.Configurations;

/// <summary>
/// <c>dbo.Tickets</c> — the shape in `specs/009-create-ticket/data-model.md`.
/// </summary>
internal sealed class TicketConfiguration : IEntityTypeConfiguration<Ticket>
{
    public void Configure(EntityTypeBuilder<Ticket> builder)
    {
        builder.ToTable("Tickets");
        builder.HasKey(ticket => ticket.Id);

        builder.Property(ticket => ticket.TicketNumber)
            .HasColumnType("nvarchar(20)")
            .IsRequired();

        // AC-3. Uniqueness is the database's job, not the generator's: two concurrent creates
        // that somehow drew the same value must fail rather than both succeed. Unfiltered —
        // every ticket has a number, so there is no NULL to exclude.
        builder.HasIndex(ticket => ticket.TicketNumber)
            .IsUnique()
            .HasDatabaseName("UX_Tickets_TicketNumber");

        // nvarchar for everything a human writes. varchar under a non-Arabic collation returns
        // ???? and presents as a font bug (ADR-013 row 4).
        builder.Property(ticket => ticket.Subject)
            .HasColumnType($"nvarchar({Ticket.SubjectMaxLength})")
            .IsRequired();

        builder.Property(ticket => ticket.Description)
            .HasColumnType($"nvarchar({Ticket.DescriptionMaxLength})")
            .IsRequired();

        // Enums as strings, so a dump is readable and reordering the members cannot re-label
        // existing rows. No CHECK constraint: the domain is the constraint, consistently with
        // every other enum column in this schema.
        builder.Property(ticket => ticket.Category)
            .HasConversion<string>().HasColumnType("nvarchar(20)").IsRequired();

        // NO column default, and that is a deliberate correction to `data-model.md`, which
        // specifies DEFAULT 'Normal'.
        //
        // EF Core warned: a database-generated default is used whenever the property holds the
        // CLR default, and the CLR default for TicketPriority is Low. So a caller explicitly
        // choosing Low would have been stored as Normal — silently, no error, the value simply
        // changed on the way in. AC-8's default belongs in ONE place, and
        // CreateTicketHandler already applies it as `request.Priority ?? Normal`. Two sources of
        // truth for one default, and the database's was the one that was wrong.
        builder.Property(ticket => ticket.Priority)
            .HasConversion<string>().HasColumnType("nvarchar(20)").IsRequired();

        builder.Property(ticket => ticket.Channel)
            .HasConversion<string>().HasColumnType("nvarchar(20)").IsRequired();

        // Same reasoning. Here the two values coincide — New is both the CLR default and the
        // intended one — so it was harmless, and it is still removed: a latent version of a
        // defect that has already bitten once is not worth keeping for symmetry with a document.
        builder.Property(ticket => ticket.Status)
            .HasConversion<string>().HasColumnType("nvarchar(20)").IsRequired();

        builder.Property(ticket => ticket.EscalationReason).HasColumnType("nvarchar(500)");

        // The only foreign key from this table. NO ACTION, not CASCADE: deleting a customer must
        // never silently erase their support history. ON DELETE RESTRICT is not SQL Server
        // syntax — NO ACTION is the same behaviour (ADR-013).
        builder.HasOne<Wasl.Domain.Customers.Customer>()
            .WithMany()
            .HasForeignKey(ticket => ticket.CustomerId)
            .OnDelete(DeleteBehavior.NoAction)
            .HasConstraintName("FK_Tickets_Customers");

        // AssignedToUserId, CreatedByUserId and EscalatedByUserId carry NO foreign key.
        // dbo.SupportUsers does not exist — `009`'s data-model.md claimed `001` had created it
        // and it never has. `004` creates the table and adds all four keys in the same
        // migration. Written here because a missing key looks identical to a forgotten one.

        // rowversion, maintained by the engine. Unused by this feature; `011` and `012` send it
        // back as expectedVersion (ADR-006 as amended by ADR-013).
        builder.Property(ticket => ticket.RowVersion).IsRowVersion();

        // Computed from the BR-1 map, so there is nothing to store and nothing to keep in step.
        builder.Ignore(ticket => ticket.AllowedTransitions);

        builder.HasIndex(ticket => ticket.CustomerId).HasDatabaseName("IX_Tickets_Customer");

        builder.HasIndex(ticket => new { ticket.Status, ticket.CreatedAtUtc })
            .IsDescending(false, true)
            .HasDatabaseName("IX_Tickets_Status");
    }
}

/// <summary>
/// <c>dbo.TicketHistory</c> — the product timeline, not the audit log (ADR-008).
/// </summary>
internal sealed class TicketHistoryEntryConfiguration : IEntityTypeConfiguration<TicketHistoryEntry>
{
    public void Configure(EntityTypeBuilder<TicketHistoryEntry> builder)
    {
        builder.ToTable("TicketHistory");
        builder.HasKey(entry => entry.Id);

        builder.Property(entry => entry.EventType)
            .HasConversion<string>().HasColumnType("nvarchar(30)").IsRequired();

        builder.Property(entry => entry.OldValue)
            .HasColumnType($"nvarchar({TicketHistoryEntry.ValueMaxLength})");

        builder.Property(entry => entry.NewValue)
            .HasColumnType($"nvarchar({TicketHistoryEntry.ValueMaxLength})");

        builder.Property(entry => entry.Note)
            .HasColumnType($"nvarchar({TicketHistoryEntry.NoteMaxLength})");

        // CASCADE, and this is the line that separates this table from dbo.AuditLog. History has
        // no meaning without its ticket, so it goes with it. The audit log has no foreign keys
        // precisely so it survives a deletion (BR-9.12) — one is a product projection, the other
        // is a forensic record, and collapsing them gives either an audit trail a user can
        // delete or a timeline showing failed sign-ins.
        builder.HasOne<Ticket>()
            .WithMany()
            .HasForeignKey(entry => entry.TicketId)
            .OnDelete(DeleteBehavior.Cascade)
            .HasConstraintName("FK_TicketHistory_Tickets");

        // No rowversion: append-only, so no second writer to conflict with (BR-5.6).

        builder.HasIndex(entry => new { entry.TicketId, entry.PerformedAtUtc })
            .HasDatabaseName("IX_TicketHistory_Ticket");
    }
}
