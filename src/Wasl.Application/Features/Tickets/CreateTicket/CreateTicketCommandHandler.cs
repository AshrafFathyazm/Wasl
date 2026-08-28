using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.CreateTicket;

/// <summary>
/// Creates the ticket and its first history row. AC-1, AC-2, AC-8, AC-9.
/// </summary>
/// <remarks>
/// <para>
/// <b>No transaction here, and no audit write.</b> `003`'s pipeline wraps this — the transaction
/// is open before the handler runs and the audit row is written after it returns, both from
/// behaviours. A handler that opened its own would produce two transactions and, on the audit
/// path, two rows.
/// </para>
/// <para>
/// The history row is added through <see cref="IApplicationDbContext.Add"/> in the same
/// <c>SaveChanges</c> as the ticket, which is what makes AC-9's "same transaction" true without
/// this method knowing a transaction exists.
/// </para>
/// </remarks>
/// <remarks>
/// <b>No <c>TimeProvider</c> and no <c>ICurrentUser</c> here.</b> The ticket's four stamps are
/// applied by <c>WaslDbContext.SaveChangesAsync</c> (see <c>IAuditableEntity</c>). What this
/// handler still needs is <see cref="IRequestTimestamp"/> — not to stamp the ticket, but because
/// <c>TicketHistoryEntry.PerformedAtUtc</c> is <i>data</i> the caller states, and AC-9 requires
/// it to be the same instant the ticket got. One scoped value means the two are equal by
/// construction rather than by two components agreeing.
/// </remarks>
internal sealed class CreateTicketCommandHandler(
    IApplicationDbContext context,
    ITicketNumberGenerator ticketNumbers,
    IRequestTimestamp timestamp) : IRequestHandler<CreateTicketCommand, CreateTicketResult>
{
    public async Task<CreateTicketResult> Handle(
        CreateTicketCommand request,
        CancellationToken cancellationToken)
    {
        // AC-4. The customer must exist. Projected to the summary in one query rather than
        // loading the entity and mapping it — the response needs three fields and `008` owns
        // the profile.
        var customer = await context.FirstOrDefaultAsync(
            context.Customers
                .Where(candidate => candidate.Id == request.CustomerId)
                .Select(candidate => new TicketCustomerSummary(
                    candidate.Id, candidate.FullName, candidate.Email)),
            cancellationToken);

        if (customer is null)
        {
            // A domain exception, mapped to `404 errors/not-found` by `002`'s one factory. Not
            // a hand-built response — Principle IV, and it is why this handler names no status
            // code.
            //
            // Deliberately says nothing about the customer beyond that it was not found. BR-4.4
            // makes the same choice for duplicates: an endpoint that distinguishes "no such
            // customer" from "a customer you may not see" is an enumeration oracle.
            throw new NotFoundException("Error.Ticket.CustomerNotFound");
        }

        var ticket = Ticket.Create(
            customerId: request.CustomerId,
            ticketNumber: await ticketNumbers.NextAsync(cancellationToken),
            subject: request.Subject,
            description: request.Description,
            category: request.Category,

            // AC-8. The default lives here, once. A non-nullable enum on the command would have
            // made an omitted priority silently become Low — the first member — instead. It is
            // also why the column carries no DEFAULT: two sources for one default, and the
            // database's would have overwritten an explicit Low.
            priority: request.Priority ?? TicketPriority.Normal,
            channel: request.Channel);

        context.Add(ticket);

        // AC-9, BR-1.8. The same instant the DbContext is about to stamp onto the ticket,
        // because both read one scoped IRequestTimestamp — so the timeline's first entry cannot
        // appear to precede or follow the thing it records.
        //
        // PerformedByUserId is deliberately not passed: TicketHistoryEntry is not an
        // IAuditableEntity, so nothing stamps it, and there is no authenticated identity to
        // state until `004`. Null is the honest value, not a gap.
        context.Add(TicketHistoryEntry.Created(ticket.Id, timestamp.UtcNow.UtcDateTime));

        await context.SaveChangesAsync(cancellationToken);

        return Map(ticket, customer);
    }

    /// <summary>
    /// One mapping, shared with <c>GET /api/tickets/{id}</c>.
    /// </summary>
    /// <remarks>
    /// The contract says a `GET` on the `Location` "returns the same resource", so two mappings
    /// would be two shapes that have to be kept in step — and the one that drifts is the one
    /// with fewer tests.
    /// </remarks>
    /// <summary>
    /// The one mapping every endpoint that returns a ticket goes through.
    /// </summary>
    /// <remarks>
    /// <paramref name="assignee"/> is optional and defaults to null, added by `011`. A create
    /// never has one — BR-2.7 keeps assignment a separate act — and the read endpoints supply it
    /// when the ticket has one. Optional rather than required so `009`'s and `010`'s call sites
    /// did not have to change to pass a null they could not have.
    /// </remarks>
    internal static CreateTicketResult Map(
        Ticket ticket,
        TicketCustomerSummary customer,
        TicketAssignee? assignee = null) =>
        new(
            Id: ticket.Id,
            TicketNumber: ticket.TicketNumber,
            Customer: customer,
            Subject: ticket.Subject,
            Description: ticket.Description,
            Category: ticket.Category,
            Priority: ticket.Priority,
            Channel: ticket.Channel,
            Status: ticket.Status,
            AssignedToUserId: ticket.AssignedToUserId,

            // Never derived from ticket.AssignedToUserId: the id alone cannot produce a name, and
            // silently returning an object with a blank name would look like a rendering bug in
            // the client rather than a missing lookup here.
            Assignee: assignee,
            IsEscalated: ticket.IsEscalated,
            CreatedByUserId: ticket.CreatedByUserId,
            CreatedAtUtc: ticket.CreatedAtUtc,
            UpdatedAtUtc: ticket.UpdatedAtUtc,

            // Computed from the BR-1 map and its conditions, never stored (ADR-004).
            AllowedTransitions: ticket.AllowedTransitions,
            Version: Convert.ToBase64String(ticket.RowVersion));
}
