using Wasl.Application.Common.Messaging;
using Wasl.Domain.Audit;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.Tags;

/// <summary>One tag as the client sees it. `034`.</summary>
public sealed record TagSummary(Guid Id, string Name);

/// <summary>
/// Attach a tag to a ticket. `034` AC-13.
/// </summary>
/// <remarks>
/// <b>Auditable</b>, like every other state-changing command — BR-9. The row is written in the
/// same transaction as the attachment, so it is absent when that transaction rolls back.
/// </remarks>
public sealed record AttachTicketTagCommand(Guid TicketId, Guid TagId)
    : IAuditableCommand<TicketTagsResult>
{
    public string AuditAction => "Ticket.TagAttached";

    public AuditTarget DescribeTarget(TicketTagsResult? response) =>
        new("Ticket", TicketId, response?.TicketNumber);
}

/// <summary>Detach a tag from a ticket. `034` AC-13.</summary>
public sealed record DetachTicketTagCommand(Guid TicketId, Guid TagId)
    : IAuditableCommand<TicketTagsResult>
{
    public string AuditAction => "Ticket.TagDetached";

    public AuditTarget DescribeTarget(TicketTagsResult? response) =>
        new("Ticket", TicketId, response?.TicketNumber);
}

/// <summary>
/// The ticket's tags after the change.
/// </summary>
/// <remarks>
/// <b>The whole set, not the one that moved.</b> The client renders a row of tags, so returning
/// the set it should now show costs one query here and saves a refetch there — and it removes the
/// question of what to do when two people tag the same ticket at once, because the answer is
/// whatever the server just read.
/// </remarks>
public sealed record TicketTagsResult(
    Guid TicketId,
    string TicketNumber,
    IReadOnlyList<TagSummary> Tags);
