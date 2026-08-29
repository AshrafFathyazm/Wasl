using Wasl.Application.Common.Abstractions;

namespace Wasl.Infrastructure;

/// <summary>
/// One instant per request, at the precision the database keeps.
/// </summary>
/// <remarks>
/// <para>
/// <b>Memoized</b> (`009` AC-9): every caller in a request gets the same value, so a ticket and its
/// history row, or a comment and its <c>CommentAdded</c> row, carry an identical timestamp by
/// construction rather than by two calls happening to land in the same millisecond. `013`'s
/// tie-break test depends on that being exact.
/// </para>
/// <para>
/// <b>And truncated to the millisecond</b>, because every timestamp column in this schema is
/// <c>datetime2(3)</c> (ADR-013). Without it, the value a handler returns in a `201` keeps full
/// .NET tick precision while the value in the column is rounded, so a create and a later read of
/// the same resource disagree:
/// </para>
/// <code>
/// POST /api/tickets/{id}/comments   "createdAtUtc":  "2026-08-29T10:30:04.7247017Z"
/// GET  /api/tickets/{id}/timeline   "occurredAtUtc": "2026-08-29T10:30:04.724Z"
/// </code>
/// <para>
/// <b>A client that caches a create response holds a value the server will never return again.</b>
/// Found by `007` AC-14, which asserts a `POST` body and a `GET` of its <c>Location</c> are
/// <b>byte-identical</b> — a field-by-field comparison walks straight past it. Then measured
/// across the other features rather than assumed: `009`'s ticket create was already correct,
/// because <c>Ticket</c> is an <c>IAuditableEntity</c> and its timestamps come from
/// <c>WaslDbContext.Stamp()</c>; `013`'s comment was not, because <c>TicketComment.CreatedAtUtc</c>
/// and <c>TicketHistoryEntry.PerformedAtUtc</c> come from here.
/// </para>
/// <para>
/// <b>Fixed here rather than in each handler</b>, which is what makes it one rule instead of five.
/// <c>Stamp()</c> reads this same value, so entity timestamps and event timestamps are truncated
/// by the same line.
/// </para>
/// <para>
/// <b>Truncation, not rounding.</b> Rounding can produce an instant one millisecond ahead of the
/// request's own, and `009` AC-9 asserts two rows written in one request share an instant exactly —
/// down is always consistent with itself.
/// </para>
/// </remarks>
internal sealed class RequestTimestamp(TimeProvider clock) : IRequestTimestamp
{
    private DateTimeOffset? _captured;

    public DateTimeOffset UtcNow => _captured ??= Truncate(clock.GetUtcNow());

    private static DateTimeOffset Truncate(DateTimeOffset value) =>
        new(value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond), value.Offset);
}
