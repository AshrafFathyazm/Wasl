using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.AddComment;

/// <summary>
/// Writes a comment and its history row in one transaction. `013` AC-1, AC-4, AC-8, AC-16.
/// </summary>
/// <remarks>
/// <para>
/// <b>Two tables, one <c>SaveChanges</c>, inside the transaction the pipeline opened.</b>
/// `CLAUDE.md`'s checklist asks it directly — *does anything write two tables without a
/// transaction?* — and the failure it names is precisely this shape: a comment with no history row
/// is invisible to the timeline and nothing failed.
/// </para>
/// <para>
/// <b>No <c>expectedVersion</c>, and that is not an omission.</b> Commenting does not modify the
/// ticket, so its <c>rowversion</c> does not move and two people commenting at once are not in
/// conflict — there is nothing for a version check to protect. The endpoint is a `201` on a
/// sub-collection rather than a `PUT` on the ticket for the same reason.
/// </para>
/// </remarks>
internal sealed class AddTicketCommentCommandHandler(
    IApplicationDbContext context,
    IRequestTimestamp timestamp) : IRequestHandler<AddTicketCommentCommand, TicketCommentResult>
{
    public async Task<TicketCommentResult> Handle(
        AddTicketCommentCommand request,
        CancellationToken cancellationToken)
    {
        var ticket = await context.FirstOrDefaultAsync(
            context.Tickets.Where(candidate => candidate.Id == request.TicketId),
            cancellationToken);

        // AC-16.
        if (ticket is null)
        {
            throw new NotFoundException("Error.Ticket.NotFound");
        }

        // ONE instant for both rows, read once. This is the line AC-10 rests on: IRequestTimestamp
        // memoizes GetUtcNow() per request, so the comment and its CommentAdded history row carry
        // a byte-identical timestamp and every comment therefore produces a tie in the timeline's
        // union. Reading the clock twice here would make the tie-break untestable in exactly the
        // way `010`'s was.
        var now = timestamp.UtcNow.UtcDateTime;

        var comment = TicketComment.Create(
            request.TicketId, request.Body, now, request.IsInternal, request.Channel);

        // BR-5.2 lives in the entity, so a seeder or an importer cannot comment on closed work
        // either. It throws before anything is added, so nothing is left half-written.
        var history = ticket.AcceptComment(comment.Id, now);

        context.Add(comment);
        context.Add(history);

        // AuthorUserId and PerformedByUserId are both assigned inside this call, from
        // ICurrentUser — AC-15. Nothing above sets either, and there is no field on the command
        // through which a client could.
        await context.SaveChangesAsync(cancellationToken);

        // Read back from the STAMPED id, not from ICurrentUser. The handler assumed nothing about
        // who the author is, so if the stamp ever stopped working this lookup finds no user and
        // the response is visibly wrong — rather than the handler echoing the value it would have
        // stamped and agreeing with itself.
        //
        // One extra query on a write, and it buys a 201 the client can render without a second
        // call. The alternative — returning a bare authorUserId — makes every caller fetch the
        // name it already had to have to display the form.
        var author = await context.FirstOrDefaultAsync(
            context.SupportUsers
                .Where(user => user.Id == comment.AuthorUserId)
                .Select(user => new TimelineActor(user.Id, user.FullName, user.Role.ToString())),
            cancellationToken)
            ?? new TimelineActor(comment.AuthorUserId, string.Empty, null);

        return new TicketCommentResult(
            Id: comment.Id,
            TicketId: ticket.Id,
            TicketNumber: ticket.TicketNumber,
            Body: comment.Body,
            IsInternal: comment.IsInternal,
            Channel: comment.Channel,

            Author: author,
            CreatedAtUtc: comment.CreatedAtUtc);
    }
}
