using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.CreateTicket;

/// <summary>
/// The `201` body. The same shape <c>GET /api/tickets/{id}</c> returns — the contract says
/// "a `GET` on it returns the same resource", so one DTO serves both.
/// </summary>
/// <remarks>
/// <para>
/// <b><see cref="CreatedByUserId"/> is nullable and stays in the shape.</b> It is null until
/// `004`. Removing the field and adding it back later would be a breaking change for a client;
/// a null it handles from the first render is not.
/// </para>
/// <para>
/// <see cref="AllowedTransitions"/> is server-computed from the BR-1 map and its conditions
/// (ADR-004). The client renders it and never derives it.
/// </para>
/// </remarks>
public sealed record CreateTicketResult(
    Guid Id,
    string TicketNumber,
    TicketCustomerSummary Customer,
    string Subject,
    string Description,
    TicketCategory Category,
    TicketPriority Priority,
    CommunicationChannel Channel,
    TicketStatus Status,
    Guid? AssignedToUserId,
    bool IsEscalated,
    Guid? CreatedByUserId,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    IReadOnlyList<TicketStatus> AllowedTransitions,
    string Version);

/// <summary>
/// A summary, not the whole customer. The profile is `008`; embedding it here would be a second
/// read shape to keep in step.
/// </summary>
public sealed record TicketCustomerSummary(Guid Id, string FullName, string? Email);
