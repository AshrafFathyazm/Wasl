using System.Text.Json.Serialization;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Dashboard.GetDashboard;

/// <summary>
/// Which slice of the data the caller is looking at. `contracts/dashboard-api.md`.
/// </summary>
/// <remarks>
/// <b>An identifier, not a label.</b> The client renders "Manager view" / "My view" from its own
/// catalogue (BR-8.7); this value is what it branches on, and it is the same string in every
/// language.
/// </remarks>
public enum DashboardScope
{
    /// <summary>An <c>Agent</c>. Every count filtered to the caller — with two documented
    /// exceptions, both on <see cref="DashboardAttention"/>.</summary>
    Mine,

    /// <summary>A <c>Manager</c>. No assignee predicate, and <c>teamLoad</c> is present.</summary>
    Team,
}

/// <summary>
/// The whole screen, in one response. AC-1.
/// </summary>
/// <remarks>
/// <para>
/// <b>One request, not seven.</b> The numbers on this screen are read against each other — "63
/// open" beside "12 unassigned" beside a fortnight of bars — and seven requests would let them be
/// taken seconds apart, so a reader could see a total no single moment ever produced. There is one
/// authorization check and one batch of commands behind this object.
/// </para>
/// <para>
/// <b>No caching, by decision</b> (`research.md` R-10). The controller sets
/// <c>Cache-Control: no-store</c>, and AC-22 asserts that two calls a second apart with a ticket
/// created between them differ — so a later "optimisation" fails a test rather than quietly
/// changing what the screen means.
/// </para>
/// </remarks>
/// <param name="Range">Echoed, never inferred by the client (AC-15).</param>
/// <param name="Scope">Selected by the role on the token, never by a query parameter.</param>
/// <param name="TimeZoneId">
/// The IANA id every <c>localDate</c> in this document is expressed in. Rendered in the header, so
/// the buckets are never ambiguous (AC-6).
/// </param>
/// <param name="FromLocalDate">Inclusive. A bare <c>yyyy-MM-dd</c> — see <see cref="DashboardDay"/>.</param>
/// <param name="ToLocalDate">Inclusive. Today, in <paramref name="TimeZoneId"/>.</param>
/// <param name="GeneratedAtUtc">
/// When the server produced this. The client renders "updated a minute ago" from it rather than
/// from its own mount time, which is a different fact.
/// </param>
public sealed record DashboardSnapshot(
    string Range,
    DashboardScope Scope,
    string TimeZoneId,
    string FromLocalDate,
    string ToLocalDate,
    DateTime GeneratedAtUtc,
    DashboardAttention Attention,
    IReadOnlyList<DashboardDay> DailySeries,
    IReadOnlyList<DashboardStatusCount> OpenByStatus,
    DashboardMedians Medians,
    IReadOnlyList<DashboardChannelCount> ChannelMix,
    IReadOnlyList<DashboardAttentionItem> NeedsAttention,

    /// <summary>
    /// Assigned-and-open per support user. <see cref="DashboardScope.Team"/> only.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Absent from the JSON document for an Agent — not <c>null</c>, not <c>[]</c></b> (AC-4,
    /// AC-18). An empty array says "the team holds nothing"; an absent property says "you were not
    /// shown this", and those are different claims. The command that produces it is not executed
    /// at all (AC-17), which is what the command count asserts.
    /// </para>
    /// <para>
    /// <b>This is not a leaderboard.</b> US-016 excludes a ranking by tickets closed deliberately:
    /// the fastest way up such a board is closing things that should have stayed open.
    /// </para>
    /// </remarks>
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    IReadOnlyList<DashboardTeamMember>? TeamLoad);

/// <summary>
/// The four tiles the screen opens with. Every count is already scoped and never null.
/// </summary>
/// <remarks>
/// <b>Lead with what needs action, not with totals</b> (`11-dashboard.md`). The test for a tile is
/// whether someone does something differently when the number changes.
/// </remarks>
/// <param name="UnassignedCount">
/// <c>AssignedToUserId IS NULL</c> and <c>Status</c> not <c>Closed</c>. <b>Global in both
/// scopes</b>, and it reads as a bug otherwise: an unassigned ticket has no owner, so there is no
/// "mine" version of it, and scoping it would show every Agent <c>0</c> forever while being the
/// most actionable number on the screen (`spec.md` A-3).
/// </param>
/// <param name="EscalatedOpenCount">
/// <c>IsEscalated = 1</c> and <c>Status</c> neither <c>Resolved</c> nor <c>Closed</c> — BR-3.3
/// makes those two the non-actionable ones.
/// </param>
/// <param name="EscalatedOverdueCount">
/// How many of <paramref name="EscalatedOpenCount"/> are older than 24 hours.
/// <b>Added 2026-09-07 as a contract change</b>, because the design's tile carries the sentence
/// "2 older than 24h" and nothing in the frozen response could produce it: <c>needsAttention</c>
/// holds at most ten rows of two mixed kinds, so a client counting them would answer a different
/// question and be silently wrong from the eleventh escalation onward. See `plan.md`
/// § Contract changes.
/// </param>
/// <param name="WaitingOnCustomerCount">
/// <c>Status = 'PendingCustomer'</c>. Shown so it can be <i>excluded</i> from judgement — that
/// clock is not ours (BR-1.4).
/// </param>
/// <param name="AssignedToMeCount">
/// Assigned to the caller and not <c>Closed</c>. Present in both scopes: a Manager's own assigned
/// count is harmless and keeps one shape.
/// </param>
/// <param name="OldestUntouched">
/// The oldest ticket with <b>no assignee and no comment</b>, not <c>Closed</c>. The one that
/// becomes an embarrassment. <c>null</c> when none exists — never a zero-aged placeholder.
/// </param>
/// <param name="MyOldest">The oldest ticket assigned to the caller, not <c>Closed</c>.</param>
public sealed record DashboardAttention(
    int UnassignedCount,
    int EscalatedOpenCount,
    int EscalatedOverdueCount,
    int WaitingOnCustomerCount,
    int AssignedToMeCount,
    DashboardTicketRef? OldestUntouched,
    DashboardTicketRef? MyOldest,

    /// <summary>
    /// How many tickets are in the attention SET, not how many rows were returned.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Added 2026-09-07 with the revised canvas</b>, which puts "View all 15 →" in the card's
    /// header. <c>needsAttention</c> is capped at ten, so the client cannot count the set — and a
    /// link reading "View all 10" beside ten rows says nothing at all.
    /// </para>
    /// <para>
    /// <b>It costs no extra command.</b> The count is a sixth scalar subquery in the attention
    /// statement, over the same predicate the list uses, so AC-17's seven-for-a-Manager still
    /// holds. A separate <c>COUNT</c> would have been an eighth.
    /// </para>
    /// </remarks>
    int NeedsAttentionTotal);

/// <summary>
/// A ticket named on a tile: enough to render it and to link to it, and nothing more.
/// </summary>
/// <param name="AgeHours">
/// Whole hours, computed server-side from the injected <c>TimeProvider</c> — so client-clock skew
/// cannot change the number the screen shows.
/// </param>
public sealed record DashboardTicketRef(
    Guid TicketId,
    string TicketNumber,
    string Subject,
    DateTime CreatedAtUtc,
    int AgeHours);

/// <summary>
/// One local day of the created-versus-resolved trend.
/// </summary>
/// <param name="LocalDate">
/// A <b>bare calendar date</b> — <c>"2026-08-10"</c>, carrying no time and no offset (AC-16).
/// <b>Typed as a string on purpose.</b> A client west of the organisation's timezone that puts
/// <c>2026-08-10T00:00:00Z</c> through <c>new Date(...)</c> renders 9 August and the whole chart
/// shifts one column, with nothing throwing and the shape still looking like a plausible week. A
/// <c>DateOnly</c> serialises correctly only while a converter stays configured; a string cannot
/// acquire a time component through a change made somewhere else.
/// </param>
/// <param name="Created">Tickets whose <c>CreatedAtUtc</c> falls inside that <b>local</b> day.</param>
/// <param name="Resolved">
/// Tickets whose <b>first</b> entry into <c>Resolved</c> falls inside that local day — from
/// <c>dbo.TicketHistory</c>, never from <c>ClosedAtUtc</c> (AC-19). Resolved on Monday and closed
/// on Thursday counts on Monday; resolved, reopened per BR-1.6, and resolved again counts once.
/// </param>
public sealed record DashboardDay(string LocalDate, int Created, int Resolved);

/// <summary>
/// How many open tickets sit in one status. Every status except <c>Closed</c>, zeros included.
/// </summary>
/// <remarks>
/// <b>Ordered by the state machine's natural order, not by count</b>, so the bars do not reorder
/// between refreshes. A status with no tickets is returned with <c>0</c> rather than omitted — the
/// client never has to know the enum's full membership to draw an axis, which is `009`'s
/// hand-written-enum-list defect waiting to happen on a screen.
/// </remarks>
public sealed record DashboardStatusCount(TicketStatus Status, int Count);

/// <summary>How many tickets in the range arrived through one channel. All five, zeros included.</summary>
public sealed record DashboardChannelCount(CommunicationChannel Channel, int Count);

/// <summary>
/// The two duration medians, with the size of the population behind each.
/// </summary>
/// <remarks>
/// <para>
/// <b>Median, never mean</b> (AC-7). One ticket left open over a holiday moves a mean by hours and
/// a median by minutes; support-time distributions have long tails by nature, so the mean
/// describes the tail and the median describes the day.
/// </para>
/// <para>
/// <b><c>null</c> is not <c>0</c>.</b> No data is not zero minutes, and a dashboard rendering
/// "0m to first reply" for an empty system is stating something false. The sample size is what the
/// client branches on.
/// </para>
/// </remarks>
/// <param name="FirstReplyMinutes">
/// Median minutes from <c>CreatedAtUtc</c> to the ticket's <b>first</b> comment, over tickets
/// created in the range that have at least one.
/// </param>
/// <param name="ResolutionMinutes">
/// Median minutes from <c>CreatedAtUtc</c> to the <b>first</b> entry into <c>Resolved</c>, over
/// tickets created in the range that reached it.
/// </param>
public sealed record DashboardMedians(
    int? FirstReplyMinutes,
    int FirstReplySampleSize,
    int? ResolutionMinutes,
    int ResolutionSampleSize,

    /// <summary>
    /// The organisation's first-reply target, in minutes. Configuration, not data.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Added 2026-09-07: the revised canvas prints "target 2h" beside the median and shades the
    /// bar amber when the median is over it.</b> The two numbers are the canvas's own — 2 hours and
    /// 1 day — and they are configuration (<c>Wasl:Targets:*</c>) rather than a hard-coded literal,
    /// because a target is a business decision that will change without a deployment.
    /// </para>
    /// <para>
    /// <b>THIS IS NOT AN SLA, AND THE DISTINCTION IS DELIBERATE.</b> An SLA is a per-ticket
    /// commitment with a deadline, a countdown and breach semantics; `027` left every SLA region of
    /// the ticket screen UNBUILT for the reason `CLAUDE.md` records — a countdown drawn from
    /// nothing looks exactly like a working one. This is one org-wide number compared against one
    /// aggregate that the endpoint already computes. Nothing here says anything about an individual
    /// ticket, and nothing downstream should start.
    /// </para>
    /// </remarks>
    int FirstReplyTargetMinutes,

    /// <summary>The organisation's resolution target, in minutes. As above.</summary>
    int ResolutionTargetMinutes);

/// <summary>
/// One row of the attention list: oldest first, at most ten.
/// </summary>
/// <remarks>
/// <b>Not paginated.</b> This is a top-ten prompt, and "see all" is a link into the ticket list. An
/// empty list is <c>[]</c> with a `200`, never a `404` (BR-7.6).
/// </remarks>
/// <param name="CustomerName">
/// Projected in the <b>same</b> command as the row. There is no per-row lookup — that is what
/// AC-17's command count protects, and it is the specific failure `013` AC-14 was written against.
/// </param>
/// <param name="IsEscalated">One of the two membership reasons. Both can be true.</param>
/// <param name="IsUnassigned">The other.</param>
public sealed record DashboardAttentionItem(
    Guid TicketId,
    string TicketNumber,
    string Subject,
    string CustomerName,
    TicketStatus Status,
    TicketPriority Priority,
    bool IsEscalated,
    bool IsUnassigned,
    DateTime CreatedAtUtc,
    int AgeHours);

/// <summary>
/// One support user's open load. <see cref="DashboardScope.Team"/> only.
/// </summary>
/// <param name="IsActive">
/// A deactivated user still appears <b>while holding open tickets</b>. Dropping them hides work
/// that exists, which is the opposite of what this block is for.
/// </param>
/// <param name="AssignedOpenCount">
/// Not <c>Closed</c>. Zero for an active user with nothing assigned — the row comes from a
/// <c>LEFT JOIN</c>, so the person a Manager should hand work to is visible at the bottom of the
/// list rather than absent from it.
/// </param>
public sealed record DashboardTeamMember(
    Guid UserId,
    string FullName,
    bool IsActive,
    int AssignedOpenCount,

    /// <summary>
    /// How many of this person's open tickets are escalated.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Added 2026-09-07 with the revised canvas</b>, whose agent card reads "3 escalated" under
    /// the bar. A conditional aggregate in the same <c>LEFT JOIN</c>, so the command count is
    /// unchanged.
    /// </para>
    /// <para>
    /// <b>The canvas's second footnote — "2 breaching" — is NOT here and is not omitted by
    /// accident.</b> Breaching requires an SLA per ticket, and this product has none: `027` left
    /// the SLA pill, the rail block and the breach banner unbuilt on purpose, because a breach
    /// count computed from nothing is indistinguishable from a working one. Raised rather than
    /// invented.
    /// </para>
    /// </remarks>
    int EscalatedOpenCount);
