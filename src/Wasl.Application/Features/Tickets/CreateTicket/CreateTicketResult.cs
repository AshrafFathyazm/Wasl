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

    /// <summary>
    /// The assignee as an object, or <c>null</c> when the ticket is unassigned. Added by `011`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Added, not substituted.</b> <c>011</c>'s frozen contract returns the assignee as a
    /// nested object so the client never has to look a name up; <c>009</c>'s and <c>010</c>'s
    /// frozen contracts return a bare <see cref="AssignedToUserId"/>. Adding a field is
    /// backward-compatible and replacing one is not, so both are here and the frontend lane's
    /// hand-written types keep working unchanged.
    /// </para>
    /// <para>
    /// <b>Why not a second DTO for <c>PUT /assignee</c>.</b> That was the obvious reading of the
    /// contract and it costs a seventeen-field duplicate plus a second mapper — the exact
    /// "second shape to keep in step" that <c>012</c> declined for the same reason. One record
    /// and one <c>Map</c> means <c>allowedTransitions</c>, <c>version</c> and this field are
    /// computed once for every endpoint that returns a ticket.
    /// </para>
    /// <para>
    /// <b>Known limitation, and it is a real one.</b> <see cref="AssignedToUserId"/> is now
    /// redundant with <c>Assignee.Id</c>. Removing it is a breaking change and belongs to
    /// <c>010</c>, which owns the read shape — recorded in <c>011</c>'s <c>plan.md</c> under
    /// *Contract changes* rather than left for someone to notice. <c>GET /api/tickets</c>, the
    /// paged list, still returns flat <c>assigneeId</c> + <c>assigneeName</c>: that is a list
    /// projection built in one SQL query and it is deliberately not this shape.
    /// </para>
    /// </remarks>
    TicketAssignee? Assignee,

    bool IsEscalated,
    Guid? CreatedByUserId,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,

    /// <summary>
    /// When the ticket was closed, or null while it is open. `034`.
    /// </summary>
    /// <remarks>
    /// <b>The key is always present and the value is null on an open ticket</b>, never omitted.
    /// An absent key deserialises to undefined, which renders as empty and passes every shape
    /// assertion — the same failure mode `027` recorded for a missing assignee, where the field
    /// looked fine and meant nothing.
    /// </remarks>
    DateTime? ClosedAtUtc,
    IReadOnlyList<TicketStatus> AllowedTransitions,
    string Version);

/// <summary>
/// A summary, not the whole customer. The profile is `008`; embedding it here would be a second
/// read shape to keep in step.
/// </summary>
/// <param name="CompanyName">
/// The organisation the customer belongs to, when they belong to one. `034`.
/// </param>
/// <remarks>
/// The column has existed on <c>Customer</c> since `007`; the v3 detail design is the first
/// screen that renders it, under the customer's name in the rail.
/// </remarks>
/// <remarks>
/// <b>CompanyName has NO default, deliberately.</b> It was added with one, and the code compiled
/// and shipped a column that was null on every response — because four projections still passed
/// three arguments and the default filled the fourth silently.
///
/// That is the defect `027` recorded as "one mapper, three call sites, one of them right", where
/// the assignee name went missing on both read paths for the same reason. Removing the default
/// turns the next occurrence into a compiler error instead of an empty field on a screen.
/// </remarks>
public sealed record TicketCustomerSummary(
    Guid Id,
    string FullName,
    string? Email,
    string? CompanyName);

/// <summary>
/// A ticket's assignee, as the client needs to render it. `011`.
/// </summary>
/// <remarks>
/// <c>Role</c> is the enum value as a string — <c>"Agent"</c> is <c>"Agent"</c> in Arabic too
/// (BR-8.7). It is here because the picker groups by role and the ticket strip shows it, and
/// because leaving it out would make the client fetch the user list to render one ticket.
/// </remarks>
public sealed record TicketAssignee(Guid Id, string FullName, string Role);
