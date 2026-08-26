using Wasl.Application.Common.Messaging;
using Wasl.Domain.Audit;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.CreateTicket;

/// <summary>
/// Create a ticket against an existing customer. US-005, FR-2.1.
/// </summary>
/// <remarks>
/// <para>
/// <b>The first production <c>IAuditableCommand</c> in the system.</b> Until now `003`'s NFR-10
/// scanner ran over an empty population; from this type on it has something to check, and a
/// command added later without an audit action fails the build.
/// </para>
/// <para>
/// <c>Priority</c> is nullable so the validator can tell "omitted" from "sent as Low" and apply
/// AC-8's default. A non-nullable enum would default to <c>Low</c> silently — the first member —
/// and an omitted priority would quietly become the lowest one instead of <c>Normal</c>.
/// </para>
/// <para>
/// There is <b>no</b> <c>CreatedByUserId</c> field, and that is AC-12. A value in the body is
/// not ignored by the handler; it has nowhere to arrive. That property holds whether or not
/// authentication exists, which is why `009` can satisfy the half of AC-12 that matters while
/// the token half waits for `004`.
/// </para>
/// </remarks>
public sealed record CreateTicketCommand(
    Guid CustomerId,
    string Subject,
    string Description,
    TicketCategory Category,
    CommunicationChannel Channel,
    TicketPriority? Priority = null) : IAuditableCommand<CreateTicketResult>
{
    /// <summary>From the naming table in `docs/sdd/04-business-rules.md`.</summary>
    public string AuditAction => "Ticket.Created";

    /// <summary>
    /// The audit row's target: the new ticket's id and its number as the readable handle.
    /// </summary>
    /// <remarks>
    /// Reads the response on success and falls back to what the command itself knows on failure
    /// — where there is no ticket id yet, so the customer is the most specific thing that can be
    /// named. A row saying "a ticket creation for customer X failed" is worth more than one
    /// saying nothing failed for nobody.
    /// </remarks>
    public AuditTarget DescribeTarget(CreateTicketResult? response) =>
        response is null
            ? new AuditTarget("Customer", CustomerId, null)
            : new AuditTarget("Ticket", response.Id, response.TicketNumber);
}

