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

        /* THE ORDER OF THE TWO CALLS BELOW DECIDES WHICH ERROR A BAD REQUEST GETS.
         *
         * `Create` raises the two shape rules — a customer reply cannot be internal, and it
         * needs a channel. `AcceptComment` then raises the closed rule and the wrong-customer
         * rule, in that order, because its status check is its first line.
         *
         * So a request that is BOTH on a closed ticket AND names the wrong customer answers
         * "closed". That is the honest one: it tells the caller no retry can succeed, where
         * "wrong customer" invites one. `011` measured the same class of thing on assignment —
         * a stale version answered before a denial — and it was only provable because the
         * ordering was written down rather than left to the reading order. */
        var comment = TicketComment.Create(
            request.TicketId,
            request.Body,
            now,
            request.IsInternal,
            request.Channel,
            request.AuthorCustomerId);

        // BR-5.2 lives in the entity, so a seeder or an importer cannot comment on closed work
        // either. It throws before anything is added, so nothing is left half-written.
        //
        // `034`: the customer id goes in here too, because the ticket is the only thing that
        // knows whose ticket it is.
        var history = ticket.AcceptComment(comment.Id, now, request.AuthorCustomerId);

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
        var recorder = await context.FirstOrDefaultAsync(
            context.SupportUsers
                .Where(user => user.Id == comment.AuthorUserId)
                .Select(user => new TimelineActor(user.Id, user.FullName, user.Role.ToString())),
            cancellationToken)
            ?? new TimelineActor(comment.AuthorUserId, string.Empty, null);

        /* WHO THE COMMENT IS FROM, WHICH IS NOT ALWAYS WHO WROTE THE ROW.
         *
         * For an agent's note the two are one person and `RecordedBy` stays null — repeating
         * them would say nothing. For a customer's reply the author is the customer and the
         * recorder is the support user, and BOTH go on the wire, because the screen shows the
         * customer's name and the audit trail has to be answerable about who typed it.
         *
         * `Role` is left NULL for a customer rather than filled with "Customer". Role carries
         * SupportUserRole values — Agent, Manager — and putting a third, differently-sourced
         * value in the same field is how a client ends up switching on a string that means two
         * things. `AuthorKind` is the field that answers this, explicitly. */
        var author = recorder;

        if (comment.AuthorCustomerId is { } customerId)
        {
            author = await context.FirstOrDefaultAsync(
                context.Customers
                    .Where(customer => customer.Id == customerId)
                    .Select(customer => new TimelineActor(customer.Id, customer.FullName, null)),
                cancellationToken)
                ?? new TimelineActor(customerId, string.Empty, null);
        }

        return new TicketCommentResult(
            Id: comment.Id,
            TicketId: ticket.Id,
            TicketNumber: ticket.TicketNumber,
            Body: comment.Body,
            IsInternal: comment.IsInternal,
            Channel: comment.Channel,
            Author: author,
            AuthorKind: comment.AuthorKind,
            RecordedBy: comment.AuthorKind is CommentAuthorKind.Customer ? recorder : null,
            CreatedAtUtc: comment.CreatedAtUtc);
    }
}
