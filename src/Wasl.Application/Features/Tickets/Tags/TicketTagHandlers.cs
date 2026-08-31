using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.Tags;

/// <summary>
/// Attach and detach, and the read they share. `034` AC-13.
/// </summary>
/// <remarks>
/// <para>
/// <b>No role policy on either action, and that absence is a decision.</b> `034` Q-4 ruled that
/// anyone who may act on the ticket may tag it. Putting a <c>ManagerOnly</c> policy on detach was
/// the alternative and it was turned down for the reason BR-6 records: a policy runs before any
/// handler, so a denial by policy writes no audit row — `011` measured that, and a tag removed
/// with no trace is worse than one anybody can remove.
/// </para>
/// <para>
/// <b>Closed tickets are not blocked here.</b> BR-1.5 makes <c>Closed</c> terminal for the
/// ticket's own state and for comments; a tag is filing, not work on the ticket, and a support
/// lead reclassifying last month's closed tickets is the reason the tag set exists. Stated
/// because the absence of the check next to `AcceptComment`'s reads as an oversight otherwise.
/// </para>
/// </remarks>
internal sealed class AttachTicketTagCommandHandler(
    IApplicationDbContext context,
    IRequestTimestamp timestamp) : IRequestHandler<AttachTicketTagCommand, TicketTagsResult>
{
    public async Task<TicketTagsResult> Handle(
        AttachTicketTagCommand request,
        CancellationToken cancellationToken)
    {
        var ticket = await context.FirstOrDefaultAsync(
            context.Tickets.Where(candidate => candidate.Id == request.TicketId),
            cancellationToken) ?? throw new NotFoundException("Error.Ticket.NotFound");

        // Unknown and retired answer identically — see TagNotAvailableException.
        var available = await context.AnyAsync(
            context.Tags.Where(tag => tag.Id == request.TagId && tag.IsActive),
            cancellationToken);
        if (!available)
        {
            throw new TagNotAvailableException();
        }

        /* THE PRE-CHECK IS NOT THE GUARANTEE. UX_TicketTags_Ticket_Tag is.
         *
         * Two parallel requests both pass this and only the unique index stops the second
         * insert — CLAUDE.md's first concurrency row, and the same shape `007` had to translate
         * for duplicate customers. This check exists to produce a clean 409 for the common case
         * (a double-click), not to make the index unnecessary. */
        var alreadyAttached = await context.AnyAsync(
            context.TicketTags.Where(link =>
                link.TicketId == request.TicketId && link.TagId == request.TagId),
            cancellationToken);
        if (alreadyAttached)
        {
            throw new TagUnchangedException();
        }

        context.Add(TicketTag.Create(
            request.TicketId, request.TagId, timestamp.UtcNow.UtcDateTime));

        await context.SaveChangesAsync(cancellationToken);

        return await TicketTagReader.ReadAsync(context, ticket, cancellationToken);
    }
}

internal sealed class DetachTicketTagCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DetachTicketTagCommand, TicketTagsResult>
{
    public async Task<TicketTagsResult> Handle(
        DetachTicketTagCommand request,
        CancellationToken cancellationToken)
    {
        var ticket = await context.FirstOrDefaultAsync(
            context.Tickets.Where(candidate => candidate.Id == request.TicketId),
            cancellationToken) ?? throw new NotFoundException("Error.Ticket.NotFound");

        // No availability check on detach: a RETIRED tag must still be removable, or a ticket
        // keeps a label nobody can take off it.
        var link = await context.FirstOrDefaultAsync(
            context.TicketTags.Where(candidate =>
                candidate.TicketId == request.TicketId && candidate.TagId == request.TagId),
            cancellationToken) ?? throw new TagUnchangedException();

        context.Remove(link);

        await context.SaveChangesAsync(cancellationToken);

        return await TicketTagReader.ReadAsync(context, ticket, cancellationToken);
    }
}

/// <summary>
/// The read both commands answer with. One place, so the two cannot drift.
/// </summary>
internal static class TicketTagReader
{
    public static async Task<TicketTagsResult> ReadAsync(
        IApplicationDbContext context,
        Ticket ticket,
        CancellationToken cancellationToken)
    {
        // ONE query, joined in the projection — never a fetch of links followed by a lookup per
        // link. `010` AC-12's counter is what proves it, and the shape is the same correlated
        // sub-select the ticket list uses for the customer name.
        var tags = await context.ToListAsync(
            from link in context.TicketTags
            join tag in context.Tags on link.TagId equals tag.Id
            where link.TicketId == ticket.Id
            orderby tag.Name
            select new TagSummary(tag.Id, tag.Name),
            cancellationToken);

        return new TicketTagsResult(ticket.Id, ticket.TicketNumber, tags);
    }
}
