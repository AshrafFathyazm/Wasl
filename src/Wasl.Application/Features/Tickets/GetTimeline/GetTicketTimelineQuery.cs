using MediatR;

namespace Wasl.Application.Features.Tickets.GetTimeline;

/// <summary>
/// <c>GET /api/tickets/{id}/timeline</c>. US-010, BR-5.7. `013` AC-9 to AC-12, AC-16.
/// </summary>
/// <remarks>
/// <para>
/// <b>Not an <c>ICommand</c>:</b> it changes no state, so it opens no transaction and writes no
/// audit row. A timeline read is the most frequent request this application will serve and
/// auditing it would bury every real event.
/// </para>
/// <para>
/// <b>The handler is in <c>Wasl.Infrastructure</c>, not here.</b> This query needs a union of
/// <c>dbo.TicketComments</c> and <c>dbo.TicketHistory</c>, and neither is exposed on
/// <c>IApplicationDbContext</c> — deliberately, since `009`. `CLAUDE.md` sanctions
/// <c>TicketTimelineQuery</c> as one of exactly two named query classes for this case, so the
/// alternative is not "put it in Application" but "widen the interface for one consumer and let
/// the tie-break have two implementations".
/// </para>
/// </remarks>
/// <param name="TicketId">The ticket. Unknown is `404` (AC-16).</param>
/// <param name="Before">
/// An opaque cursor from a previous page's <c>nextCursor</c>. Null asks for the newest page.
/// </param>
/// <param name="Limit">
/// How many entries. Defaults to 50 (`spec.md` A-3) and clamps to 100, the same ceiling BR-7.2
/// puts on the ticket list — an unclamped page size is a denial of service with one query string,
/// and the rule does not stop applying because the shape of the pagination changed.
/// </param>
public sealed record GetTicketTimelineQuery(
    Guid TicketId,
    string? Before = null,
    int Limit = 50) : IRequest<TimelinePage>
{
    /// <summary>`spec.md` A-3. The literal is repeated in the parameter default above because a
    /// record`s parameter default must be a compile-time constant of the enclosing scope, which a
    /// member of the same record is not. Asserted equal by a unit test rather than left to drift.</summary>
    public const int DefaultLimit = 50;
    public const int MaxLimit = 100;

    /// <summary>
    /// The limit actually used — clamped, never rejected.
    /// </summary>
    /// <remarks>
    /// Clamped rather than a `400`, which is what BR-7.2 does for the ticket list: a client asking
    /// for 500 entries gets 100 and a working screen, not an error it cannot act on. A zero or
    /// negative value asks for nothing useful, so it becomes the default rather than an empty page
    /// — an empty page would read as "this ticket has no history".
    /// </remarks>
    public int EffectiveLimit => Limit switch
    {
        < 1 => DefaultLimit,
        > MaxLimit => MaxLimit,
        _ => Limit,
    };
}
