using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.CannedReplies.GetCannedReplies;

/// <summary>
/// The reply templates offered for a category. `034` AC-15.
/// </summary>
/// <remarks>
/// <b>Scoped, and the scope is the point.</b> The v3 design heads the menu «ردود جاهزة · الفاتورة»
/// — the templates on a billing ticket are the billing ones. A flat list of every template in the
/// product is a list nobody opens twice.
/// </remarks>
public sealed record GetCannedRepliesQuery(TicketCategory? Category = null)
    : IRequest<IReadOnlyList<CannedReplySummary>>;

public sealed record CannedReplySummary(
    Guid Id,
    string Title,
    string Body,
    TicketCategory? Category);

internal sealed class GetCannedRepliesQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetCannedRepliesQuery, IReadOnlyList<CannedReplySummary>>
{
    public async Task<IReadOnlyList<CannedReplySummary>> Handle(
        GetCannedRepliesQuery request,
        CancellationToken cancellationToken)
    {
        var replies = context.CannedReplies.Where(reply => reply.IsActive);

        /* A CATEGORY MATCH **OR** AN UNCATEGORISED TEMPLATE.
         *
         * `CannedReply.Category` is nullable and that null means "offered on every ticket" — an
         * acknowledgement or a closing notice does not need duplicating once per category. So
         * filtering on equality alone would silently drop exactly the templates meant to appear
         * everywhere.
         *
         * With no category asked for, every active template is returned: that is the picker a
         * future admin screen needs, not a ticket's menu. AC-15's other half — an UNKNOWN
         * category returns an empty list rather than everything — falls out of this, because an
         * unknown value still binds to a real enum member that simply matches nothing.
         */
        if (request.Category is { } category)
        {
            replies = replies.Where(
                reply => reply.Category == category || reply.Category == null);
        }

        return await context.ToListAsync(
            replies
                .OrderBy(reply => reply.Category == null)
                .ThenBy(reply => reply.Title)
                .Select(reply => new CannedReplySummary(
                    reply.Id, reply.Title, reply.Body, reply.Category)),
            cancellationToken);
    }
}
