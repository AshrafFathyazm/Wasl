using Wasl.Application.Common.Messaging;
using Wasl.Domain.Audit;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.AddComment;

/// <summary>
/// <c>POST /api/tickets/{id}/comments</c>. US-010, BR-5.
/// </summary>
/// <remarks>
/// <para>
/// <b>There is no <c>AuthorUserId</c> on this command, and that is AC-15.</b> A field here would
/// be a field a client could set, and mass assignment on an author is how a comment ends up
/// attributed to someone who did not write it. The author is stamped in
/// <c>WaslDbContext.SaveChangesAsync</c> from <c>ICurrentUser</c>, the same place the history
/// row's actor is stamped, so no handler has to remember it and no request can supply it.
/// </para>
/// <para>
/// <b>And no <c>CreatedAtUtc</c>.</b> Same reason, plus a second one: the instant comes from
/// <c>IRequestTimestamp</c> so the comment and its <c>CommentAdded</c> history row share it
/// exactly. That shared instant is what makes AC-10's tie-break a condition of every comment
/// rather than something a test has to contrive.
/// </para>
/// </remarks>
/// <param name="AuthorCustomerId">
/// Set to record a reply that came <b>from the customer</b> through a channel (`034`).
/// <para>
/// The customer never signs in — there is no customer authentication and it is out of scope — so
/// a support user records their message. This is who it is <i>from</i>; the support user the
/// token names is who recorded it, and both end up on the row.
/// </para>
/// <para>
/// It is a request field rather than something derived from the ticket, because "record the
/// customer's reply" and "add my own note" are two different actions on one endpoint and the
/// server must not guess which one was meant.
/// </para>
/// </param>
public sealed record AddTicketCommentCommand(
    Guid TicketId,
    string Body,
    bool IsInternal = false,
    CommunicationChannel? Channel = null,
    Guid? AuthorCustomerId = null) : IAuditableCommand<TicketCommentResult>
{
    /// <summary>
    /// <c>Ticket.CommentAdded</c> — from the naming table in `docs/sdd/04-business-rules.md`.
    /// </summary>
    /// <remarks>
    /// The entity is the <b>ticket</b>, not the comment, and that is the choice `003`'s
    /// <c>research.md</c> R-8 predicted this feature would face: a comment write touches
    /// <c>TicketComments</c>, <c>TicketHistory</c> and — through the audit diff — nothing else,
    /// and only one of them is what the action was <i>about</i>. An investigation asks "what
    /// happened to this ticket", so the ticket is the target and a reader can follow one entity id
    /// through creation, assignment, status changes and comments alike.
    /// </remarks>
    public string AuditAction => "Ticket.CommentAdded";

    /// <summary>
    /// The ticket, on both paths. <b>Never the body</b> — BR-5.5 and BR-9.7.
    /// </summary>
    /// <remarks>
    /// <c>EntityLabel</c> carries the ticket number, not an excerpt of the comment. The audit trail
    /// records <b>that</b> a comment was added, never its text: `003` registered
    /// <c>TicketComment.Body</c> in <c>AuditRedaction</c> for the diff path, and this method is the
    /// other path a body could have leaked through. AC-18 searches every column of the row for the
    /// text rather than trusting either.
    /// </remarks>
    public AuditTarget DescribeTarget(TicketCommentResult? response) =>
        new("Ticket", TicketId, response?.TicketNumber);
}

/// <summary>The `201` body, as `contracts/timeline-api.md` freezes it.</summary>
/// <remarks>
/// <c>TicketNumber</c> is carried so <see cref="AddTicketCommentCommand.DescribeTarget"/> can label
/// the audit row without a second query, and so the client can show a confirmation naming the
/// ticket. It is the only field here that is not the comment's own.
/// </remarks>
/// <param name="Author">
/// Who the comment is <b>from</b> — the support user who wrote it, or the customer it was
/// recorded from.
/// </param>
/// <param name="AuthorKind">
/// <b>Explicit, so the client never infers it.</b> A reader deciding "customer or agent" from
/// whether <see cref="TimelineActor.Role"/> happens to be null is one refactor away from being
/// wrong, and the badge it drives is the difference between the customer's words and ours.
/// </param>
/// <param name="RecordedBy">
/// The support user who recorded a customer's reply. <b>Null when the author is the agent</b>,
/// because there the author and the recorder are the same person and repeating them says
/// nothing.
/// </param>
public sealed record TicketCommentResult(
    Guid Id,
    Guid TicketId,
    string TicketNumber,
    string Body,
    bool IsInternal,
    CommunicationChannel? Channel,
    TimelineActor Author,
    CommentAuthorKind AuthorKind,
    TimelineActor? RecordedBy,
    DateTime CreatedAtUtc);

/// <summary>
/// Who wrote a comment, or performed a history event. `013`.
/// </summary>
/// <remarks>
/// <para>
/// The nested-object shape `011` established for an assignee, for the same reason: the client must
/// not have to look a name up to render one row.
/// </para>
/// <para>
/// <b><see cref="Id"/> is nullable and <see cref="FullName"/> is not.</b> A history row can have no
/// actor — <c>--seed</c> writes rows with a null <c>PerformedByUserId</c>, because seeding is not
/// something a person did — and the timeline meets those on day one in the demo database. So the
/// query supplies a name for the absent case rather than leaving the client to render a blank
/// where a person should be.
/// </para>
/// </remarks>
public sealed record TimelineActor(Guid? Id, string FullName, string? Role);
