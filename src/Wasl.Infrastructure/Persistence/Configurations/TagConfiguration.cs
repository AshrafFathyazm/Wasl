using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Wasl.Domain.Tickets;
using Wasl.Domain.Users;

namespace Wasl.Infrastructure.Persistence.Configurations;

/// <summary>
/// <c>dbo.Tags</c>. `034`.
/// </summary>
internal sealed class TagConfiguration : IEntityTypeConfiguration<Tag>
{
    /// <summary>
    /// The collation the tag name is compared under.
    /// </summary>
    /// <remarks>
    /// <b>Explicit, never inherited from the server.</b> `008` found three searched customer
    /// columns with no explicit collation, which made two thirds of the search surface
    /// case-insensitive by luck of how that server happened to be installed — correct on the
    /// developer's machine and undefined anywhere else. A tag set whose uniqueness depends on a
    /// server setting is a set that grows duplicates on one deployment and not another.
    /// </remarks>
    internal const string CaseInsensitive = "SQL_Latin1_General_CP1_CI_AS";

    public void Configure(EntityTypeBuilder<Tag> builder)
    {
        builder.ToTable("Tags");
        builder.HasKey(tag => tag.Id);

        // nvarchar, never varchar — ADR-013. A tag written in Arabic into a varchar column
        // returns ????, which presents as a font problem rather than a schema one.
        builder.Property(tag => tag.Name)
            .HasColumnType($"nvarchar({Tag.NameMaxLength})")
            .UseCollation(CaseInsensitive)
            .IsRequired();

        builder.Property(tag => tag.IsActive).IsRequired();
        builder.Property(tag => tag.CreatedAtUtc).IsRequired();

        // UNIQUE ON THE NAME, and it is the collation above that gives it meaning: without the
        // explicit CI collation this index would reject «استرداد» twice but accept «Refund» and
        // «refund» — or not — depending on the server.
        builder.HasIndex(tag => tag.Name)
            .IsUnique()
            .HasDatabaseName("UX_Tags_Name");
    }
}

/// <summary>
/// <c>dbo.TicketTags</c>. `034`.
/// </summary>
internal sealed class TicketTagConfiguration : IEntityTypeConfiguration<TicketTag>
{
    /// <summary>
    /// The index whose violation means the ticket already carries this tag. `036` §3.1.
    /// </summary>
    /// <remarks>
    /// <b>A constant rather than a literal, because two files must agree on it</b> — this
    /// configuration creates the index and <c>WaslDbContext.TranslateDuplicate</c> matches the
    /// SQL Server message against its name. `007` learned the same thing for customers and put
    /// its two names on <c>DuplicateCustomer</c>; that class is in <c>Wasl.Application</c>
    /// because the pre-check that raises the exception lives there. This one is here because
    /// both halves are in <c>Wasl.Infrastructure</c> and there is no boundary to cross.
    /// <para>
    /// Matching on the NAME and not on error number 2601/2627 is the rule, not an
    /// implementation detail — see <c>TranslateDuplicate</c>.
    /// </para>
    /// </remarks>
    public const string UniqueIndexName = "UX_TicketTags_Ticket_Tag";

    public void Configure(EntityTypeBuilder<TicketTag> builder)
    {
        builder.ToTable("TicketTags");
        builder.HasKey(link => link.Id);

        builder.Property(link => link.TicketId).IsRequired();
        builder.Property(link => link.TagId).IsRequired();
        builder.Property(link => link.AttachedByUserId).IsRequired();
        builder.Property(link => link.AttachedAtUtc).IsRequired();

        // THE SAME TAG CANNOT BE ATTACHED TWICE. A double-click on the tag picker is the common
        // case, and the client guard is not the guarantee — CLAUDE.md's first concurrency row.
        // Two parallel requests both pass a "does it already have this tag" check and only the
        // index stops the second insert.
        //
        // `036` §3.1 finished the sentence above. The index did stop the second insert and then
        // produced a `500`, because WaslDbContext.TranslateDuplicate knew only `007`'s two
        // customer indexes by name. The loser of the race and the loser of a sequential
        // double-click now get the same `409 errors/tag-unchanged` — `007` Q-D's rule, which was
        // written once for customers and not generalised.
        builder.HasIndex(link => new { link.TicketId, link.TagId })
            .IsUnique()
            .HasDatabaseName(UniqueIndexName);

        builder.HasOne<Ticket>()
            .WithMany()
            .HasForeignKey(link => link.TicketId)

            // CASCADE, unlike the comment's author FK, and the difference is what the row means.
            // A link row is not a historical record — it says "this ticket currently carries this
            // tag" — so it has no reason to outlive the ticket. Nothing hard-deletes a ticket
            // today; this states what should happen if anything ever does.
            .OnDelete(DeleteBehavior.Cascade)
            .HasConstraintName("FK_TicketTags_Ticket");

        builder.HasOne<Tag>()
            .WithMany()
            .HasForeignKey(link => link.TagId)

            // NO ACTION. A tag is retired, never deleted (Tag.IsActive), so a cascade here would
            // exist only to make a delete nobody performs quieter.
            .OnDelete(DeleteBehavior.NoAction)
            .HasConstraintName("FK_TicketTags_Tag");

        builder.HasOne<SupportUser>()
            .WithMany()
            .HasForeignKey(link => link.AttachedByUserId)
            .OnDelete(DeleteBehavior.NoAction)
            .HasConstraintName("FK_TicketTags_AttachedBy");
    }
}

/// <summary>
/// <c>dbo.CannedReplies</c>. `034`.
/// </summary>
internal sealed class CannedReplyConfiguration : IEntityTypeConfiguration<CannedReply>
{
    public void Configure(EntityTypeBuilder<CannedReply> builder)
    {
        builder.ToTable("CannedReplies");
        builder.HasKey(reply => reply.Id);

        builder.Property(reply => reply.Title)
            .HasColumnType($"nvarchar({CannedReply.TitleMaxLength})")
            .IsRequired();

        builder.Property(reply => reply.Body)
            .HasColumnType($"nvarchar({CannedReply.BodyMaxLength})")
            .IsRequired();

        // A string, like every other enum in this schema. Nullable — a template with no category
        // is offered on every ticket, which is a fact and not a missing value.
        builder.Property(reply => reply.Category)
            .HasConversion<string>()
            .HasMaxLength(16);

        builder.Property(reply => reply.IsActive).IsRequired();
        builder.Property(reply => reply.CreatedAtUtc).IsRequired();

        // The read path filters on category and active, in that order.
        builder.HasIndex(reply => new { reply.Category, reply.IsActive })
            .HasDatabaseName("IX_CannedReplies_Category");
    }
}
