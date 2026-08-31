using MediatR;
using Wasl.Application.Common;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.GetTickets;

/// <summary>
/// One page, newest first, with the customer name joined in the same query.
/// </summary>
internal sealed class GetTicketsQueryHandler(IApplicationDbContext context, ICurrentUser currentUser)
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
        var tickets = Filter(context, currentUser, request);

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

    /// <summary>
    /// The seven filters and the search, composed. `015` AC-4 to AC-9.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>AND across keys, OR within a key</b> — BR-7.3 and BR-7.4. Each <c>Where</c> is a separate
    /// call, which is the AND; the OR is <c>Contains</c> over the parsed list, which the provider
    /// turns into an <c>IN</c>. Composed on <c>IQueryable</c> so nothing is enumerated here: the
    /// count and the page below both read this one expression, so they cannot disagree about what
    /// is being counted.
    /// </para>
    /// <para>
    /// <b>An empty parsed list adds no <c>Where</c> at all</b>, which is `spec.md` Q-4: <c>?status=</c>
    /// means no filter, not <c>WHERE Status IN ()</c>. The second returns nothing to a user who
    /// filtered nothing, and it is the kind of empty result that reads as missing data.
    /// </para>
    /// <para>
    /// <b><c>Contains</c> for the search, with no hand-rolled escaping — inherited from `008`, where
    /// it was MEASURED.</b> `015` AC-24 was written on the assumption that <c>%</c> and <c>_</c>
    /// need escaping by hand on SQL Server. `008` measured otherwise: EF Core 10 builds the pattern
    /// and escapes the term itself, emitting <c>LIKE @p ESCAPE N'\'</c>, and a search for <c>%</c>
    /// returned 0 rows rather than all of them. A hand-written escaper on top of that
    /// double-escapes, and a ticket whose subject contains a backslash or a bracket becomes
    /// unfindable — a defect the obvious test would not catch, because it only checks that
    /// <c>100%</c> matches nothing. So the assertion pins the PROVIDER's behaviour, which is the
    /// thing an upgrade could change.
    /// </para>
    /// <para>
    /// <b>Case-insensitivity comes from the columns, not from a <c>ToLower()</c>.</b> Same ruling as
    /// `008` AC-16: an explicit CI collation on the searched columns keeps the predicate sargable,
    /// and a <c>ToLower()</c> here would be correct, slower, and would hide that the schema is what
    /// guarantees it.
    /// </para>
    /// <para>
    /// <b><c>assignee=me</c> is resolved from <c>ICurrentUser</c>, never from the URL</b> (AC-8).
    /// A user with no token cannot reach this at all — the fallback policy answers <c>401</c> first
    /// (`010` AC-16) — so <c>UserId</c> is non-null here in every served request. It is still
    /// treated as nullable rather than asserted: a null actor filtering to "my tickets" should
    /// return nothing, not everything, and <c>everything</c> is what a dropped filter would give.
    /// </para>
    /// </remarks>
    private static IQueryable<Ticket> Filter(
        IApplicationDbContext context,
        ICurrentUser currentUser,
        GetTicketsQuery request)
    {
        var tickets = context.Tickets;

        if (request.CustomerId is { } customerId)
        {
            tickets = tickets.Where(ticket => ticket.CustomerId == customerId);
        }

        if (request.EffectiveStatus is { Count: > 0 } statuses)
        {
            tickets = tickets.Where(ticket => statuses.Contains(ticket.Status));
        }

        if (request.EffectivePriority is { Count: > 0 } priorities)
        {
            tickets = tickets.Where(ticket => priorities.Contains(ticket.Priority));
        }

        if (request.EffectiveCategory is { Count: > 0 } categories)
        {
            tickets = tickets.Where(ticket => categories.Contains(ticket.Category));
        }

        if (request.EffectiveChannel is { Count: > 0 } channels)
        {
            tickets = tickets.Where(ticket => channels.Contains(ticket.Channel));
        }

        switch (request.AssigneeKind)
        {
            case AssigneeFilterKind.Unassigned:
                tickets = tickets.Where(ticket => ticket.AssignedToUserId == null);
                break;

            case AssigneeFilterKind.Me:
                // Null-safe on purpose: see the remarks. A comparison against a null Guid? matches
                // the unassigned rows rather than every row, which is the safe direction.
                var me = currentUser.UserId;
                tickets = tickets.Where(ticket => ticket.AssignedToUserId == me);
                break;

            case AssigneeFilterKind.User:
                var assignee = request.AssigneeUserId;
                tickets = tickets.Where(ticket => ticket.AssignedToUserId == assignee);
                break;

            case AssigneeFilterKind.Any:
            default:
                break;
        }

        if (request.Escalated is { } escalated)
        {
            tickets = tickets.Where(ticket => ticket.IsEscalated == escalated);
        }

        if (request.EffectiveSearch is { } search)
        {
            // BR-7.5. Number, subject, and customer name — the three things people quote to each
            // other. The customer name is a correlated EXISTS rather than a join, so a ticket is
            // returned once however the match was found; a join would duplicate rows the moment a
            // second matching column existed.
            tickets = tickets.Where(ticket =>
                ticket.TicketNumber.Contains(search)
                || ticket.Subject.Contains(search)
                || context.Customers.Any(customer =>
                    customer.Id == ticket.CustomerId && customer.FullName.Contains(search)));
        }

        return tickets;
    }
}
