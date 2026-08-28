using Wasl.Application.Features.Tickets.AddComment;
using Wasl.Domain.Communications;

namespace Wasl.Application.Features.Tickets.GetTimeline;

/// <summary>
/// What kind of thing a timeline entry is. `013` AC-11, `spec.md` Q-D.
/// </summary>
/// <remarks>
/// <b>A discriminator on every entry, rather than letting the client infer the kind from which
/// fields are populated.</b> Inference is a rule, and it would live in whatever renders the row —
/// so two renderers would eventually disagree about what an entry with a null <c>body</c> and a
/// null <c>oldValue</c> means. The six history values mirror
/// <c>TicketHistoryEventType</c> exactly; <see cref="Comment"/> is the seventh and is the only one
/// that comes from the other table.
/// </remarks>
public enum TimelineEntryType
{
    Created,
    StatusChanged,
    Assigned,
    Unassigned,
    Escalated,
    CommentAdded,
    Comment,
}

/// <summary>
/// One entry in the merged feed — a comment, or a recorded change. `013` AC-9, AC-11.
/// </summary>
/// <remarks>
/// <para>
/// <b>One flat shape for both branches, with the irrelevant fields null.</b> The alternative is a
/// polymorphic payload, which JSON handles badly and which every client then has to narrow before
/// it can read a timestamp. <see cref="Type"/> says which fields to expect.
/// </para>
/// <para>
/// <b><see cref="Cursor"/> is what the client sends back as <c>before</c>.</b> It is opaque: never
/// parsed, compared, or ordered by the client — the same contract `version` carries. It encodes
/// the sort key, so paging cannot drift when a new comment arrives between two requests, which is
/// the whole reason this endpoint uses a cursor and not the page envelope `010` froze.
/// </para>
/// </remarks>
public sealed record TimelineEntry(
    TimelineEntryType Type,
    Guid Id,
    DateTime OccurredAtUtc,
    TimelineActor Actor,
    string Cursor,

    /// <summary>The comment's text. Null on every history entry.</summary>
    string? Body = null,

    /// <summary>Comment only. BR-5.4 — marked distinctly, never hidden.</summary>
    bool? IsInternal = null,

    /// <summary>Comment only, and null when it was typed rather than received. FR-3.3.</summary>
    CommunicationChannel? Channel = null,

    /// <summary>History only. The status, assignee id, or comment id before the event.</summary>
    string? OldValue = null,

    /// <summary>History only. The value after it.</summary>
    string? NewValue = null,

    /// <summary>History only. The note supplied with a status change, when one was.</summary>
    string? Note = null);

/// <summary>
/// One page of the timeline. `013` AC-12.
/// </summary>
/// <remarks>
/// <para>
/// <b>Not `010`'s <c>{ items, page, pageSize, totalCount, totalPages }</c> envelope, deliberately,
/// and `CLAUDE.md` records the distinction under *API contract*.</b> A ticket list grows at the
/// end the user is not reading, so page 2 stays page 2. A timeline grows at the end they <i>are</i>
/// reading, so a page number silently skips or repeats entries between two requests — the reader
/// asks for "the next fifty older" and gets a set that shifted underneath them.
/// </para>
/// <para>
/// <b>No total count either.</b> Counting a union of two tables costs a second pass over both to
/// render a number nothing acts on: there is no page picker to populate, because there are no
/// pages. <see cref="HasMore"/> is what the "load older" control needs, and it is one row of
/// lookahead rather than a full count.
/// </para>
/// </remarks>
public sealed record TimelinePage(
    IReadOnlyList<TimelineEntry> Items,
    bool HasMore,

    /// <summary>
    /// Send this back as <c>before</c> to load the previous page. Null when there is no more.
    /// </summary>
    string? NextCursor);
