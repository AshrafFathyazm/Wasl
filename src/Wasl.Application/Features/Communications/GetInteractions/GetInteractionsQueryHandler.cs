using MediatR;
using Wasl.Application.Common;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Application.Features.Communications.GetInteractions;

/// <summary>
/// The record of what was sent on one ticket, oldest first. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>The ticket's existence is checked, and that is what makes `404` distinguishable from an
/// empty list.</b> Without it, an unknown ticket id and a ticket with no messages would both
/// return <c>items: []</c> — and a client showing "no messages yet" for a ticket that does not
/// exist is a bug that survives a demo. AC-15 wants the `404`; AC-20 wants the empty `200`. Two
/// criteria, and the only way to satisfy both is to ask.
/// </para>
/// <para>
/// <b>Three queries, and the count is not avoidable.</b> The existence check, the count, and the
/// page. `010`'s handler has the same shape for the same reason: the envelope carries
/// <c>totalCount</c>, which a page of rows cannot tell you. What matters is that none of them is
/// per-row — `010` AC-12's counter is the tool, and it asserts a small result and a large one
/// issue the *same* number of commands.
/// </para>
/// </remarks>
internal sealed class GetInteractionsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetInteractionsQuery, PagedResult<InteractionResponse>>
{
    public async Task<PagedResult<InteractionResponse>> Handle(
        GetInteractionsQuery request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var ticketExists = await context.FirstOrDefaultAsync(
            context.Tickets
                .Where(candidate => candidate.Id == request.TicketId)
                .Select(candidate => (Guid?)candidate.Id),
            cancellationToken);

        if (ticketExists is null)
        {
            throw new NotFoundException("Error.Ticket.NotFound");
        }

        var page = Paging.ClampPage(request.Page);
        var pageSize = Paging.ClampPageSize(request.PageSize);

        var matching = context.Interactions
            .Where(interaction => interaction.TicketId == request.TicketId);

        var totalCount = await context.CountAsync(matching, cancellationToken);

        /* ORDERED BY (CreatedAtUtc, Id), AND THE SECOND KEY IS THE TIE-BREAK.
         *
         * `datetime2(3)` means two messages sent in the same millisecond tie — improbable by hand
         * and trivial for a test or a script. Without a tie-break SQL Server may return them in
         * either order on either page, so one can appear twice across two pages while another
         * never appears. `013` shipped exactly that defect on a cursor and `010` recorded its own
         * stable-sort guard as unproven; this is the cheap version of both lessons.
         *
         * `Id` is `Guid.CreateVersion7()` — time-ordered — so it agrees with `CreatedAtUtc`
         * rather than fighting it, and the pair is a total order. */
        var items = await context.ToListAsync(
            matching
                .OrderBy(interaction => interaction.CreatedAtUtc)
                .ThenBy(interaction => interaction.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(interaction => new InteractionResponse(
                    interaction.Id,
                    interaction.TicketId,
                    interaction.Direction,
                    interaction.Channel,
                    interaction.RecipientAddress,
                    interaction.Body,
                    interaction.ProviderName,
                    interaction.ProviderMessageId,
                    interaction.DeliveryStatus,
                    interaction.FailureCode,
                    interaction.SentByUserId,
                    interaction.CreatedAtUtc)),
            cancellationToken);

        return new PagedResult<InteractionResponse>(items, page, pageSize, totalCount);
    }
}
