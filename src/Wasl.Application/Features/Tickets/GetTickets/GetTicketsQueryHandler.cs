using MediatR;
using Wasl.Application.Common;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Application.Features.Tickets.GetTickets;

/// <summary>
/// One page, newest first, with the customer name joined in the same query.
/// </summary>
internal sealed class GetTicketsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetTicketsQuery, PagedResult<TicketListItem>>
{
    public async Task<PagedResult<TicketListItem>> Handle(
        GetTicketsQuery request,
        CancellationToken cancellationToken)
    {
        var page = Paging.ClampPage(request.Page);
        var pageSize = Paging.ClampPageSize(request.PageSize);

        /* ONE FILTERED SOURCE, READ BY BOTH THE COUNT AND THE PAGE (`034`).
         *
         * Filtering the page while counting the whole table is the defect this shape prevents:
         * the envelope would report every ticket in the product as the total for one customer's
         * list, and the pager would offer pages that come back empty. Both reads below use
         * `tickets`, so they cannot disagree about what is being counted. */
        var tickets = request.CustomerId is { } customerId
            ? context.Tickets.Where(ticket => ticket.CustomerId == customerId)
            : context.Tickets;

        // Counted on the UNPAGED query. Counting after Skip/Take would return at most the page
        // size and make totalPages permanently 1 — a defect that looks like a working pager
        // until someone reaches page 2.
        var totalCount = await context.CountAsync(tickets, cancellationToken);

        var rows = await context.ToListAsync(
            tickets
                // BR-7.1. Newest first — AND then by Id, which is AC-22 and not decoration.
                //
                // CreatedAtUtc is datetime2(3), so two tickets created in the same millisecond
                // tie. SQL Server gives no stable order for a tie, so the engine may place the
                // same row on page 1 and page 2, or on neither. The bug is invisible at small
                // data and non-deterministic when it appears: a row silently missing from a list.
                //
                // Id is a UUIDv7, so it is monotonic with creation time — the tie-break agrees
                // with the primary sort instead of fighting it.
                .OrderByDescending(ticket => ticket.CreatedAtUtc)
                .ThenByDescending(ticket => ticket.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)

                // AC-12. One query, names included. A join expressed as a correlated subquery in
                // the projection — the provider turns it into an OUTER APPLY, so an unassigned
                // ticket still returns its row (the contract calls it a left join).
                .Select(ticket => new TicketListItem(
                    ticket.Id,
                    ticket.TicketNumber,
                    ticket.Subject,
                    ticket.CustomerId,
                    context.Customers
                        .Where(customer => customer.Id == ticket.CustomerId)
                        .Select(customer => customer.FullName)
                        .FirstOrDefault() ?? string.Empty,
                    ticket.Status,
                    ticket.Priority,
                    ticket.Category,
                    ticket.Channel,
                    ticket.AssignedToUserId,

                    // Was `null`, and the comment beside it read "Null until `004` creates
                    // dbo.SupportUsers". `004` created it on 2026-08-27 and this stayed hard-coded
                    // for three days — a comment that went on explaining an absence whose cause
                    // had gone.
                    //
                    // The same correlated sub-select as the customer name above. A LEFT JOIN by
                    // construction: FirstOrDefault over no match yields null, which is exactly what
                    // `010`'s contract requires — "both null when unassigned. The row is still
                    // returned — the join is a left join." An inner join would drop unassigned
                    // tickets from the list, so the shape is load-bearing and the unassigned case
                    // is asserted next to the assigned one.
                    context.SupportUsers
                        .Where(user => user.Id == ticket.AssignedToUserId)
                        .Select(user => user.FullName)
                        .FirstOrDefault(),
                    ticket.IsEscalated,
                    ticket.CreatedAtUtc)),
            cancellationToken);

        return new PagedResult<TicketListItem>(rows, page, pageSize, totalCount);
    }
}
