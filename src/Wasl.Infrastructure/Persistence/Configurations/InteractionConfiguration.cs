using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;
using Wasl.Domain.Users;

namespace Wasl.Infrastructure.Persistence.Configurations;

/// <summary>
/// <c>dbo.Interactions</c> — the shape in
/// `specs/021-communication-provider-abstraction/data-model.md`.
/// </summary>
internal sealed class InteractionConfiguration : IEntityTypeConfiguration<Interaction>
{
    /// <summary>Named so the test can query <c>sys.check_constraints</c> for it (AC-9).</summary>
    public const string DirectionConstraintName = "CK_Interactions_Direction";

    public const string OutcomeConstraintName = "CK_Interactions_Outcome";

    public const string TicketTimeIndexName = "IX_Interactions_Ticket_Time";

    public void Configure(EntityTypeBuilder<Interaction> builder)
    {
        builder.ToTable("Interactions", table =>
        {
            /* AC-9. THE SCHEMA-LEVEL STATEMENT THAT `021` SENDS AND DOES NOT RECEIVE.
             *
             * `InteractionDirection` declares `Inbound` so the column carries information and so
             * US-013 is a dropped constraint rather than a migration of every row — but nothing in
             * this release may write one. Until US-013 exists, "zero inbound rows" is a fact the
             * database guarantees rather than a question somebody has to go and check.
             *
             * AC-9 verifies it by querying `sys.check_constraints` for a NON-NULL definition AND
             * by attempting a failing insert. Reading the migration would prove only that somebody
             * typed it. */
            table.HasCheckConstraint(
                DirectionConstraintName,
                $"Direction = N'{nameof(InteractionDirection.Outbound)}'");

            /* THE OUTCOME PAIRING — the same rule `Interaction.Send` and `SendOutcome` enforce.
             *
             * Three layers for one rule, and each catches a different mistake: `SendOutcome`
             * catches a PROVIDER returning an inconsistent pair, `Interaction.Send` catches a
             * HANDLER passing one, and this catches anything reaching the table by another route
             * — a seeder, a migration, a manual INSERT.
             *
             * The two rows it forbids are the two that read as fact: an `Accepted` row with no
             * provider id looks delivered and cannot be chased with the provider, and a `Failed`
             * row carrying one is a contradiction somebody will resolve in favour of the wrong
             * half. */
            table.HasCheckConstraint(
                OutcomeConstraintName,
                $"""
                 (DeliveryStatus = N'{nameof(DeliveryStatus.Accepted)}' AND ProviderMessageId IS NOT NULL AND FailureCode IS NULL)
                 OR (DeliveryStatus = N'{nameof(DeliveryStatus.Failed)}' AND ProviderMessageId IS NULL AND FailureCode IS NOT NULL)
                 """);
        });

        builder.HasKey(interaction => interaction.Id);

        builder.Property(interaction => interaction.TicketId).IsRequired();

        // Enums as strings, like every other one in this schema. An int would let a reordering
        // rewrite the meaning of every existing row (ADR-013).
        builder.Property(interaction => interaction.Direction)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(interaction => interaction.Channel)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(interaction => interaction.DeliveryStatus)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        /* `nvarchar` ON EVERY STRING COLUMN, and AC-10 is the test that would catch `varchar`.
         *
         * `nvarchar` is EF Core's default for `string`, so these lines set the LENGTH and the
         * default carries the encoding — which is worth stating, because "we did not write
         * varchar" is not the same as "we verified nvarchar", and `????` for Arabic presents as a
         * font problem rather than as a column type. */
        builder.Property(interaction => interaction.RecipientAddress)
            .HasMaxLength(Interaction.RecipientAddressMaxLength)
            .IsRequired();

        builder.Property(interaction => interaction.Body)
            .HasMaxLength(Interaction.BodyMaxLength)
            .IsRequired();

        builder.Property(interaction => interaction.ProviderName)
            .HasMaxLength(Interaction.ProviderNameMaxLength)
            .IsRequired();

        // Nullable exactly when delivery failed — the pairing is the check constraint's, not this
        // line's. `IsRequired(false)` is the default and is written out so the asymmetry with the
        // three columns above is visible rather than inferred from an absence.
        builder.Property(interaction => interaction.ProviderMessageId)
            .HasMaxLength(Interaction.ProviderMessageIdMaxLength)
            .IsRequired(false);

        builder.Property(interaction => interaction.FailureCode)
            .HasMaxLength(Interaction.FailureCodeMaxLength)
            .IsRequired(false);

        builder.Property(interaction => interaction.SentByUserId).IsRequired();

        // datetime2(3) plus `001`'s global UTC converter. SQL Server has no `timestamptz`.
        builder.Property(interaction => interaction.CreatedAtUtc)
            .HasColumnType("datetime2(3)")
            .IsRequired();

        /* `ON DELETE NO ACTION` AND NOT `CASCADE`, WHICH DIVERGES FROM `TicketComments`.
         *
         * `03-domain-model.md` cascades comments with their ticket, and this table deliberately
         * does not follow the precedent: an interaction records something that LEFT THE SYSTEM
         * TOWARD A CUSTOMER, which is closer to `AuditLog`'s reasoning (BR-9.12) than to a
         * comment's. Nothing in the application deletes a ticket, so this is a guard against a
         * manual delete — and the effect is that such a delete fails loudly instead of erasing
         * the record of what was sent to whom.
         *
         * The divergence is stated here as well as in `data-model.md`, so a reviewer comparing
         * the two tables finds a reason rather than an inconsistency. */
        builder.HasOne<Ticket>()
            .WithMany()
            .HasForeignKey(interaction => interaction.TicketId)
            .HasConstraintName("FK_Interactions_Tickets")
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne<SupportUser>()
            .WithMany()
            .HasForeignKey(interaction => interaction.SentByUserId)
            .HasConstraintName("FK_Interactions_Sender")
            .OnDelete(DeleteBehavior.NoAction);

        /* THE ONLY QUERY THAT READS THIS TABLE, and the index matches its shape exactly:
         * `WHERE TicketId = @p ORDER BY CreatedAtUtc`. Same shape and same justification as
         * `IX_TicketComments_Ticket_Time`.
         *
         * NOT FILTERED — so `filter_definition` comes back NULL here, which is worth stating
         * because `007` and `020b` both verify the opposite for their indexes using the same
         * `sys.indexes` query. `CLAUDE.md`'s rule is to read the filter and know which answer you
         * want; here the answer is null, because every row in this table belongs to a ticket and
         * there is no subset to exclude. */
        builder.HasIndex(interaction => new { interaction.TicketId, interaction.CreatedAtUtc })
            .HasDatabaseName(TicketTimeIndexName);
    }
}
