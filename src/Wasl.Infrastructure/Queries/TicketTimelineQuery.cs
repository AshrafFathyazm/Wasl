using System.Text;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Wasl.Application.Features.Tickets.AddComment;
using Wasl.Application.Features.Tickets.GetTimeline;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Infrastructure.Queries;

/// <summary>
/// The merged ticket timeline. `013` AC-9 to AC-12, AC-14, AC-16. BR-5.7.
/// </summary>
/// <remarks>
/// <para>
/// <b>One of exactly two named query classes `CLAUDE.md` sanctions</b>, and the reason is
/// structural rather than stylistic: this reads <c>dbo.TicketComments</c> and
/// <c>dbo.TicketHistory</c>, neither of which is exposed on <c>IApplicationDbContext</c>. The
/// alternative is not "write it in <c>Wasl.Application</c>" — it is "widen that interface with two
/// <c>IQueryable</c>s for one consumer", after which any handler can build its own union and the
/// tie-break has two implementations that must agree.
/// </para>
/// <para>
/// <b>Registered explicitly in <c>AddInfrastructure</c>.</b> MediatR scans <c>Wasl.Application</c>
/// only, so a handler living here is invisible to it — the same situation `003` met with its two
/// behaviours, and the same answer: register the one type rather than scanning a second assembly
/// and pulling every internal class in this project into the container.
/// </para>
/// </remarks>
internal sealed class TicketTimelineQuery(WaslDbContext context)
    : IRequestHandler<GetTicketTimelineQuery, TimelinePage>
{
    /// <summary>
    /// The name shown for a history row nobody performed.
    /// </summary>
    /// <remarks>
    /// <c>--seed</c> writes rows with a null <c>PerformedByUserId</c> — legitimately, because
    /// seeding is not something a person did — so the demo database contains them and the timeline
    /// meets them on its first render. Supplying the word here rather than leaving the client a
    /// null is what stops the UI showing a blank where a person should be, which reads as a
    /// loading bug.
    /// </remarks>
    private const string SystemActor = "System";

    /// <summary>
    /// The tie-break's first key. `spec.md` A-4: ties break by <b>type</b>, then id.
    /// </summary>
    /// <remarks>
    /// <para>
    /// A comment sorts before the <c>CommentAdded</c> row that records it, within the instant they
    /// share. Substance before bookkeeping — and the pair does share an instant on <b>every</b>
    /// comment, because <c>IRequestTimestamp</c> memoizes the clock once per request and one
    /// request writes both.
    /// </para>
    /// <para>
    /// Two ranks rather than one per entry type: the only tie this system produces by construction
    /// is comment-versus-its-own-history-row, and inventing an order among six history events that
    /// cannot share an instant would be a rule with no case behind it.
    /// </para>
    /// </remarks>
    private const int CommentRank = 0;

    private const int HistoryRank = 1;

    public async Task<TimelinePage> Handle(
        GetTicketTimelineQuery request,
        CancellationToken cancellationToken)
    {
        // AC-16, and it runs first so an unknown ticket is a 404 rather than an empty timeline —
        // which the client cannot tell from a ticket that genuinely has no entries.
        var exists = await context.Tickets
            .AnyAsync(ticket => ticket.Id == request.TicketId, cancellationToken);

        if (!exists)
        {
            throw new NotFoundException("Error.Ticket.NotFound");
        }

        var cursor = TimelineCursor.Parse(request.Before);
        var limit = request.EffectiveLimit;

        // ── The union ───────────────────────────────────────────────────────────────
        //
        // Two projections onto one row shape, concatenated, so SQL Server sees a single UNION ALL
        // it can sort once. Both branches project the actor's name by JOIN (AC-14) — a per-entry
        // lookup would be fifty round trips to render one screen, and it is the specific failure
        // AC-14 was written to forbid.
        //
        // The join is a LEFT join in effect, because PerformedByUserId is nullable: EF renders
        // `from ... left join SupportUsers` for the null-conditional projection below.
        var comments =
            from comment in context.TicketComments
            where comment.TicketId == request.TicketId
            join user in context.SupportUsers on comment.AuthorUserId equals user.Id into authors
            from author in authors.DefaultIfEmpty()
            select new TimelineRow
            {
                Kind = CommentRank,
                Id = comment.Id,
                IdText = comment.Id.ToString(),
                OccurredAtUtc = comment.CreatedAtUtc,
                ActorId = comment.AuthorUserId,
                ActorName = author == null ? null : author.FullName,
                ActorRole = author == null ? null : author.Role.ToString(),
                Body = comment.Body,
                IsInternal = comment.IsInternal,
                Channel = comment.Channel.ToString(),
                EventType = null,
                OldValue = null,
                NewValue = null,
                Note = null,
            };

        var history =
            from entry in context.TicketHistory
            where entry.TicketId == request.TicketId
            join user in context.SupportUsers on entry.PerformedByUserId equals user.Id into actors
            from actor in actors.DefaultIfEmpty()
            select new TimelineRow
            {
                Kind = HistoryRank,
                Id = entry.Id,
                IdText = entry.Id.ToString(),
                OccurredAtUtc = entry.PerformedAtUtc,
                ActorId = entry.PerformedByUserId,
                ActorName = actor == null ? null : actor.FullName,
                ActorRole = actor == null ? null : actor.Role.ToString(),
                Body = null,
                IsInternal = null,
                Channel = null,
                EventType = entry.EventType.ToString(),
                OldValue = entry.OldValue,
                NewValue = entry.NewValue,
                Note = entry.Note,
            };

        var union = comments.Concat(history);

        // ── The cursor ──────────────────────────────────────────────────────────────
        //
        // Strictly before the cursor, on the SAME composite key the ordering uses — instant, then
        // kind, then id. A cursor on the timestamp alone would skip or repeat exactly the entries
        // AC-10 is about, because a comment and its own CommentAdded row share an instant.
        if (cursor is { } from)
        {
            // Strictly before the cursor, on ALL THREE keys the ordering uses and in the same
            // sequence — instant, then type rank, then id-as-text. A cursor comparing fewer keys
            // than the sort uses is the defect this endpoint exists to avoid: it skips or repeats
            // exactly the entries that tie, which here is every comment.
            union = union.Where(row =>
                row.OccurredAtUtc < from.OccurredAtUtc
                || (row.OccurredAtUtc == from.OccurredAtUtc && row.Kind < from.Kind)
                || (row.OccurredAtUtc == from.OccurredAtUtc && row.Kind == from.Kind
                    && string.Compare(row.IdText, from.IdText) < 0));
        }

        // Newest first for the QUERY, because the newest page is what a person reads on arrival
        // (`spec.md` Q-2) — then reversed for the RESPONSE, because BR-5.7 says the feed is
        // ascending. Fetching limit+1 is how HasMore is answered without counting the union.
        var rows = await union
            .OrderByDescending(row => row.OccurredAtUtc)
            .ThenByDescending(row => row.Kind)

            // IdText, not Id — and this cost a repeated entry before it was found.
            //
            // SQL Server orders `uniqueidentifier` by a byte order of its own, which is NOT the
            // lexical order of the same value rendered as text. The cursor filter compares text,
            // so ordering by the raw Guid made the two disagree: an entry could sort AFTER the
            // cursor by the ORDER BY and BEFORE it by the WHERE, and it then appeared on two
            // consecutive pages. Caught by AC-12's test asserting that no entry appears twice —
            // a test that only counted entries per page would have passed.
            //
            // Both sides now use the same rendered text, so the sort key and the cursor key are
            // one thing. The conversion is paid on at most limit+1 rows after the index seek.
            .ThenByDescending(row => row.IdText)
            .Take(limit + 1)
            .ToListAsync(cancellationToken);

        var hasMore = rows.Count > limit;

        if (hasMore)
        {
            rows.RemoveAt(rows.Count - 1);
        }

        // The cursor for "load older" is the OLDEST entry on this page — the last one after the
        // reversal below, and the last one in `rows` before it.
        var nextCursor = hasMore && rows.Count > 0
            ? TimelineCursor.Encode(rows[^1].OccurredAtUtc, rows[^1].Kind, rows[^1].IdText)
            : null;

        rows.Reverse();

        return new TimelinePage(
            rows.Select(Map).ToList(),
            hasMore,
            nextCursor);
    }

    private static TimelineEntry Map(TimelineRow row)
    {
        var type = row.EventType is { } eventType
            ? Enum.Parse<TimelineEntryType>(eventType)
            : TimelineEntryType.Comment;

        return new TimelineEntry(
            Type: type,
            Id: row.Id,
            OccurredAtUtc: row.OccurredAtUtc,

            // The name is resolved here rather than in SQL so the fallback lives in one place. A
            // COALESCE in the query would put the word "System" in a projection, where it could
            // not be localized later and would be invisible to anyone reading the C#.
            Actor: new TimelineActor(row.ActorId, row.ActorName ?? SystemActor, row.ActorRole),
            Cursor: TimelineCursor.Encode(row.OccurredAtUtc, row.Kind, row.IdText),
            Body: row.Body,
            IsInternal: row.IsInternal,
            Channel: row.Channel is null ? null : Enum.Parse<CommunicationChannel>(row.Channel),
            OldValue: row.OldValue,
            NewValue: row.NewValue,
            Note: row.Note);
    }

    /// <summary>
    /// The shape both branches project onto, so the union has one row type.
    /// </summary>
    /// <remarks>
    /// A class with settable properties rather than a record, because EF must construct it in a
    /// projection over a <c>Concat</c> and a positional record's constructor is not always
    /// translatable there. Internal to this file's concern and never leaves it — <c>Map</c>
    /// converts to the contract's <see cref="TimelineEntry"/>.
    /// </remarks>
    private sealed class TimelineRow
    {
        /// <summary>The type rank — <c>0</c> for a comment, <c>1</c> for history. `spec.md` A-4.</summary>
        public int Kind { get; set; }

        public Guid Id { get; set; }

        /// <summary>
        /// The id as text — the tie-break key, and the same key the cursor compares.
        /// </summary>
        public string IdText { get; set; } = string.Empty;
        public DateTime OccurredAtUtc { get; set; }
        public Guid? ActorId { get; set; }
        public string? ActorName { get; set; }
        public string? ActorRole { get; set; }
        public string? Body { get; set; }
        public bool? IsInternal { get; set; }
        // Both enum-valued columns are carried as STRINGS through the union, and parsed in Map.
        //
        // A UNION ALL aligns its two branches by column POSITION and requires one type per
        // position. Both of these are stored as nvarchar by a value converter, but only one branch
        // has a real column to read — the other supplies a literal null, which EF typed from the
        // CLR enum rather than from the converted column. SQL Server then returned nvarchar where
        // the reader expected int, and the request died with
        // "Unable to cast object of type 'System.String' to type 'System.Int32'" — a 500 with
        // nothing in it pointing at a union.
        //
        // Projecting .ToString() on both sides removes the ambiguity at the source rather than
        // working around it downstream.
        public string? Channel { get; set; }
        public string? EventType { get; set; }
        public string? OldValue { get; set; }
        public string? NewValue { get; set; }
        public string? Note { get; set; }
    }
}

/// <summary>
/// The opaque page cursor: the three sort keys — instant, type rank, id — base64-encoded. `013` AC-12.
/// </summary>
/// <remarks>
/// <para>
/// <b>Opaque by contract</b> — the client never parses, compares, or orders it, the same agreement
/// <c>version</c> carries. Encoded rather than sent as two query parameters so the pair cannot be
/// separated: a client that sent the timestamp and forgot the id would silently skip every entry
/// sharing that instant, which is exactly the case a comment creates.
/// </para>
/// <para>
/// <b>Not signed and not encrypted.</b> It addresses a position in a feed the caller is already
/// authorized to read, so forging one reveals nothing the endpoint would not return anyway. An
/// unparseable cursor is treated as absent — the newest page — rather than a `400`: the worst a
/// corrupted cursor does is send the reader back to the top, and refusing the request strands a
/// client whose stored cursor went stale.
/// </para>
/// </remarks>
internal static class TimelineCursor
{
    public static string Encode(DateTime occurredAtUtc, int kind, string idText) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes($"{occurredAtUtc.Ticks}|{kind}|{idText}"));

    public static (DateTime OccurredAtUtc, int Kind, string IdText)? Parse(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor))
        {
            return null;
        }

        try
        {
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|');

            if (parts.Length == 3
                && long.TryParse(parts[0], out var ticks)
                && int.TryParse(parts[1], out var kind)
                && Guid.TryParse(parts[2], out _))
            {
                return (new DateTime(ticks, DateTimeKind.Utc), kind, parts[2]);
            }
        }
        catch (FormatException)
        {
            // Not base64. Falls through to null — the newest page.
        }

        return null;
    }
}
