using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Wasl.Domain.Tickets;
using Wasl.Domain.Users;

namespace Wasl.Infrastructure.Persistence.Configurations;

/// <summary>
/// <c>dbo.TicketComments</c> — the shape in `specs/013-ticket-timeline-and-comments/data-model.md`.
/// </summary>
internal sealed class TicketCommentConfiguration : IEntityTypeConfiguration<TicketComment>
{
    public void Configure(EntityTypeBuilder<TicketComment> builder)
    {
        builder.ToTable("TicketComments", table => table.HasCheckConstraint(
            "CK_TicketComments_Body",

            // Kept, unlike the column defaults below, and the distinction is the `009` lesson: a
            // CHECK is a constraint, not a value the database computes alongside the code. Nothing
            // is calculated twice.
            //
            // Its cost is stated rather than hidden: a body that reaches this produces a
            // DbUpdateException and therefore a 500, not BR-5.1's 400. The validator is what
            // produces the 400; this is the guarantee of last resort for a caller that is not the
            // API — a migration, a script, a future importer.
            "LEN(LTRIM(RTRIM(Body))) > 0"));

        builder.HasKey(comment => comment.Id);

        builder.Property(comment => comment.TicketId).IsRequired();

        // STILL REQUIRED, and `034` is the change that most wanted to relax it.
        //
        // Letting a customer author a comment looks like it needs a nullable support user. It
        // does not: the customer never signs in, so a support user recorded every one of these
        // rows and the audit trail must name them. Making this nullable is how the NULL actor
        // `011` found on TicketHistory.PerformedByUserId comes back — every row written, none of
        // them attributable, and nothing throwing.
        builder.Property(comment => comment.AuthorUserId).IsRequired();

        // `034`. A string, like every other enum in this schema — an int would let a reordering
        // rewrite the meaning of every existing row.
        builder.Property(comment => comment.AuthorKind)
            .HasConversion<string>()
            .HasMaxLength(16)
            .IsRequired();

        builder.Property(comment => comment.AuthorCustomerId);

        // NO foreign key to dbo.Customers, and that is deliberate rather than an omission.
        //
        // The FK would be correct today and wrong the first time a customer is merged or
        // anonymised: the comment is a historical record of who said something, and it must
        // survive the customer row changing. TicketComment.AuthorUserId keeps its FK because a
        // support user is never hard-deleted (IsActive handles departures) — the two columns
        // have different lifetimes, so they get different guarantees.
        //
        // The invariant that matters is enforced where it can be: Ticket.AcceptComment refuses a
        // customer that is not the ticket's own.

        // THE PAIRING IS ENFORCED IN THE DATABASE TOO, not only in the factory.
        //
        // TicketComment.Create sets AuthorKind from AuthorCustomerId so the two cannot drift —
        // but the factory is not the only writer a schema has to survive, and a check constraint
        // is what makes "Customer implies a customer id, Agent implies none" true for a script,
        // an importer, or a migration as well.
        builder.ToTable(table => table.HasCheckConstraint(
            "CK_TicketComments_AuthorKind",
            "(AuthorKind = 'Customer' AND AuthorCustomerId IS NOT NULL) OR "
            + "(AuthorKind = 'Agent' AND AuthorCustomerId IS NULL)"));

        // nvarchar, never varchar. Arabic in a varchar column under a non-Arabic collation stores
        // ????, which presents as a font problem rather than a schema one — ADR-013 names it the
        // defect that costs the most time to diagnose, and a comment body is the field most likely
        // to be written in Arabic.
        builder.Property(comment => comment.Body)
            .HasColumnType($"nvarchar({TicketComment.BodyMaxLength})")
            .IsRequired();

        // NO column default on IsInternal, and this is a deliberate departure from the original
        // data-model.md, which specified DF_TicketComments_Internal DEFAULT 0.
        //
        // House rule since `004` D-4: EF applies a database default whenever the property holds
        // the CLR default. For bool that is false — which here EQUALS the default, so this one
        // would be harmless today. It goes anyway, because a value with two sources of truth that
        // currently agree is the same defect waiting for one of them to move. `001` shipped
        // Customers.IsActive DEFAULT 1 where they did not agree, and undoing it needed a
        // migration.
        builder.Property(comment => comment.IsInternal).IsRequired();

        // Enum as a string (ADR-013). No CHECK constraint listing the members: adding one means
        // every new channel is a migration, and the enum is already the single definition —
        // `009` corrected two invented members in it precisely because the type is the authority.
        builder.Property(comment => comment.Channel)
            .HasConversion<string>()
            .HasColumnType("nvarchar(20)");

        builder.Property(comment => comment.CreatedAtUtc)
            .HasColumnType("datetime2(3)")
            .IsRequired();

        // No rowversion: append-only, so there is no second writer to conflict with. Same argument
        // as TicketHistoryEntry (BR-5.6) and dbo.AuditLog.

        // CASCADE from the ticket, like TicketHistory. A comment has no meaning without its
        // ticket, and the audit log — which must survive a deletion — is the other table, with no
        // foreign keys at all (ADR-008).
        builder.HasOne<Ticket>()
            .WithMany()
            .HasForeignKey(comment => comment.TicketId)
            .OnDelete(DeleteBehavior.Cascade)
            .HasConstraintName("FK_TicketComments_Tickets");

        // NO ACTION to the author — not RESTRICT, which is not SQL Server syntax, and not CASCADE,
        // which would delete a departed colleague's comments and take the ticket's history with
        // them. Nothing hard-deletes a support user anyway; IsActive handles departures.
        builder.HasOne<SupportUser>()
            .WithMany()
            .HasForeignKey(comment => comment.AuthorUserId)
            .OnDelete(DeleteBehavior.NoAction)
            .HasConstraintName("FK_TicketComments_Author");

        // The comment branch of the timeline union: seek on TicketId, then an ordered scan on
        // CreatedAtUtc. The mirror of IX_TicketHistory_Ticket, and the two together are what keep
        // the sort out of the union's plan.
        //
        // Body is deliberately not an INCLUDE column: at nvarchar(4000) it would nearly duplicate
        // the table in the index to avoid a key lookup on fifty rows.
        builder.HasIndex(comment => new { comment.TicketId, comment.CreatedAtUtc })
            .HasDatabaseName("IX_TicketComments_Ticket_Time");
    }
}
