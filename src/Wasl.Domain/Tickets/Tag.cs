namespace Wasl.Domain.Tickets;

/// <summary>
/// A label that can be attached to a ticket. `034`.
/// </summary>
/// <remarks>
/// <para>
/// <b>A managed set, not free text</b> (`034` Q-3, ruled 2026-08-31). Free text becomes forty
/// spellings of one tag and no way to filter by any of them; a managed set needs somewhere to
/// manage it, and that screen is not specified. The compromise is stated rather than hidden:
/// <c>--seed</c> supplies the starting tags and adding one is a database action until an admin
/// screen exists.
/// </para>
/// <para>
/// <b>The name is user-visible content in Arabic, so it is <c>nvarchar</c> with an explicit
/// case-insensitive collation on the column.</b> `008` found <c>FullName</c>, <c>PhoneE164</c> and
/// <c>CompanyName</c> carrying no explicit collation, which left two thirds of the customer search
/// case-insensitive by luck of the server's default. A tag set that treats «استرداد» and «إسترداد»
/// as different is a set that quietly grows duplicates.
/// </para>
/// <para>
/// <b>No colour.</b> The v3 design tints three tags, and which colour a tag takes is a rendering
/// decision until someone asks to choose one — storing it now would be a column with no chooser.
/// </para>
/// </remarks>
public sealed class Tag
{
    public const int NameMaxLength = 60;

    // EF Core materialises through this. Nothing else should.
    private Tag()
    {
    }

    public Guid Id { get; private set; }

    public string Name { get; private set; } = null!;

    /// <summary>
    /// Retired rather than deleted.
    /// </summary>
    /// <remarks>
    /// A tag already attached to a hundred tickets cannot be removed without rewriting their
    /// history, so retiring it keeps those rows readable while taking it out of the picker — the
    /// same shape as <c>SupportUser.IsActive</c>, and for the same reason.
    /// </remarks>
    public bool IsActive { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public static Tag Create(string name, DateTime createdAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        return new Tag
        {
            Id = Guid.CreateVersion7(),
            Name = name.Trim(),
            IsActive = true,
            CreatedAtUtc = createdAtUtc,
        };
    }
}

/// <summary>
/// One tag attached to one ticket. `034`.
/// </summary>
/// <remarks>
/// <para>
/// <b>An entity with its own id, not a bare composite-key join row.</b> Attaching and detaching
/// are auditable actions (AC-13), and <c>AuditBehaviour</c> describes a target by id — a row whose
/// identity is the pair it joins has no single id to name.
/// </para>
/// <para>
/// <b>It records who attached it and when.</b> "Who tagged this as escalated-billing" is the
/// question a support lead asks about a tag, and reconstructing it from the audit log is possible
/// but not queryable.
/// </para>
/// </remarks>
public sealed class TicketTag
{
    private TicketTag()
    {
    }

    public Guid Id { get; private set; }

    public Guid TicketId { get; private set; }

    public Guid TagId { get; private set; }

    /// <summary>
    /// Stamped by <c>WaslDbContext.SaveChangesAsync</c> from <c>ICurrentUser</c>, never passed in
    /// — the same path <c>TicketComment.AuthorUserId</c> takes, so no handler can attribute an
    /// attachment to a user the server did not authenticate.
    /// </summary>
    public Guid AttachedByUserId { get; private set; }

    public DateTime AttachedAtUtc { get; private set; }

    public static TicketTag Create(Guid ticketId, Guid tagId, DateTime attachedAtUtc) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            TicketId = ticketId,
            TagId = tagId,
            AttachedAtUtc = attachedAtUtc,
        };
}
