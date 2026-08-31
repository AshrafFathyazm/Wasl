namespace Wasl.Domain.Tickets;

/// <summary>
/// A reply template an agent can drop into the composer. `034`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Scoped to a <see cref="TicketCategory"/>, and that scope is the whole reason it is
/// useful.</b> The v3 design heads the menu «ردود جاهزة · الفاتورة» — the templates offered are
/// the billing ones, because the ticket is a billing ticket. A flat list of every template in the
/// product is a list nobody opens twice.
/// </para>
/// <para>
/// <b>Read-only in this feature.</b> There is no endpoint to write one and no admin screen;
/// <c>--seed</c> supplies them. Same limitation as <see cref="Tag"/>, stated for the same reason:
/// the alternative is specifying a management screen nobody asked for.
/// </para>
/// <para>
/// <b>The body is a template, not markup.</b> It is inserted into the composer as plain text and
/// the agent edits it before sending — `027`'s Q-4 already ruled comments are plain text, and
/// rendering markup from a field the contract does not describe as markup is an injection
/// surface.
/// </para>
/// </remarks>
public sealed class CannedReply
{
    public const int TitleMaxLength = 120;
    public const int BodyMaxLength = 4000;

    private CannedReply()
    {
    }

    public Guid Id { get; private set; }

    /// <summary>What the agent picks from the menu.</summary>
    public string Title { get; private set; } = null!;

    /// <summary>What lands in the composer.</summary>
    public string Body { get; private set; } = null!;

    /// <summary>
    /// The category this template belongs to, or null for one offered on every ticket.
    /// </summary>
    /// <remarks>
    /// Nullable so a genuinely general template — an acknowledgement, a closing notice — does not
    /// have to be duplicated once per category. A null here means "always offered", which is a
    /// fact rather than a missing value.
    /// </remarks>
    public TicketCategory? Category { get; private set; }

    public bool IsActive { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public static CannedReply Create(
        string title,
        string body,
        DateTime createdAtUtc,
        TicketCategory? category = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        ArgumentException.ThrowIfNullOrWhiteSpace(body);

        return new CannedReply
        {
            Id = Guid.CreateVersion7(),
            Title = title.Trim(),
            Body = body.Trim(),
            Category = category,
            IsActive = true,
            CreatedAtUtc = createdAtUtc,
        };
    }
}
