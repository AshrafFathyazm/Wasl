using Wasl.Application.Features.Tickets.AddComment;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

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
    string? Note = null,

    /// <summary>
    /// On a comment entry: who it is FROM. Null on a history entry. `034`.
    /// </summary>
    /// <remarks>
    /// Explicit, so the client never infers "customer or agent" from whether
    /// <c>Actor.Role</c> happens to be null. The badge it drives is the difference between the
    /// customer's words and ours, and an inferred one is a refactor away from being wrong.
    /// </remarks>
    CommentAuthorKind? AuthorKind = null,

    /// <summary>
    /// The support user who recorded a customer's reply. Null everywhere else.
    /// </summary>
    /// <remarks>
    /// The customer never signs in, so someone typed it. <c>Actor</c> is who it is from and this
    /// is who put it there — both are real people and the row records both.
    /// </remarks>
    TimelineActor? RecordedBy = null);

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
/// <b>`013` said "no total count either", and `034` reversed it — the paragraph is corrected here
/// rather than deleted, because the reasoning was right and the premise changed.</b> `013`'s
/// argument was that a count renders a number nothing acts on, since there is no page picker to
/// populate. True while the feed was one tab. The v3 detail design puts two tabs side by side,
/// each labelled with its own total, so the number is now the label on the control the reader is
/// about to press — something acts on it.
/// </para>
/// <para>
/// <b>What survives from that paragraph is the cost objection, and it is answered rather than
/// ignored:</b> the counts are two constant <c>COUNT</c> queries, never a second pass that grows
/// with the page. <see cref="HasMore"/> is still what the "load older" control uses, still one
/// row of lookahead.
/// </para>
/// </remarks>
public sealed record TimelinePage(
    IReadOnlyList<TimelineEntry> Items,
    bool HasMore,

    /// <summary>
    /// Send this back as <c>before</c> to load the previous page. Null when there is no more.
    /// </summary>
    string? NextCursor,

    /// <summary>
    /// Every comment on this ticket — not the number on this page. `034`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The counts are the part of the split with a trap in it.</b> A cursor reports
    /// <see cref="HasMore"/> and never a total, so the two tab counters the v3 design draws
    /// cannot come out of paging. They are two <c>COUNT</c> queries, and what makes them
    /// acceptable is that their cost is constant: two round trips whether the page holds five
    /// entries or a hundred, asserted with <c>CountQueries()</c> rather than argued from the
    /// LINQ.
    /// </para>
    /// <para>
    /// <b>Both totals are reported whichever filter was asked for.</b> The reader looking at the
    /// comments tab still sees how many history rows exist — that number is what the other tab
    /// is labelled with, and fetching it would otherwise cost a second request.
    /// </para>
    /// </remarks>
    int CommentCount,

    /// <summary>Every history row on this ticket.</summary>
    int HistoryCount);
