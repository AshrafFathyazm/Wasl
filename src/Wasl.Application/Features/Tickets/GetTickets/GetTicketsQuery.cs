using MediatR;
using Wasl.Application.Common;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.GetTickets;

/// <summary>
/// <c>GET /api/tickets</c> — one page of the list, newest first. US-006 (read half), BR-7.
/// </summary>
/// <remarks>
/// <para>
/// Not an <c>ICommand</c>, so `003`'s constrained behaviours never wrap it: no transaction, no
/// audit row (`003` AC-16, `spec.md` Q-2 — reads are not audited).
/// </para>
/// <para>
/// <b>No filters and no search</b>, and that is `015`'s scope rather than an omission. The seven
/// filters, the OR-within-a-key rule, and the escaping of <c>%</c> and <c>_</c> in a search term
/// are a feature of their own; shipping half of them would leave a query surface that looks
/// complete and rejects the combinations BR-7.3 promises.
/// </para>
/// <para>
/// Both parameters are nullable so "not supplied" is distinguishable from "supplied as 0" —
/// <see cref="Paging"/> then applies BR-7.2's clamping, which is why they are not defaulted here.
/// </para>
/// </remarks>
/// <param name="CustomerId">
/// Return only this customer's tickets. `034`.
/// </param>
/// <remarks>
/// <para>
/// <b>A parameter on the existing list, not a sub-resource.</b> The v3 ticket-detail design
/// shows the customer's other tickets in the rail, and <c>/api/customers/{id}/tickets</c> was the
/// obvious shape — it would also be a second list endpoint with its own paging, its own clamping,
/// and its own copy of the projection, which `015` would then have to reconcile when it adds the
/// rest of the filters to the first one.
/// </para>
/// <para>
/// <b>`015` owns filters</b>, and this is one of them arriving early because one screen needs it.
/// It clamps through the same <c>Paging</c> helpers as everything else, so BR-7.2 holds without a
/// second implementation.
/// </para>
/// </remarks>
/// <param name="Status">Repeated. OR within the key, AND against the other filters (BR-7.3, BR-7.4).</param>
/// <param name="Priority">Repeated. As <paramref name="Status"/>.</param>
/// <param name="Category">Repeated. As <paramref name="Status"/>.</param>
/// <param name="Channel">Repeated. As <paramref name="Status"/>.</param>
/// <param name="Assignee">
/// <c>me</c>, <c>unassigned</c>, or a user id. `015` AC-8 and AC-9 — <c>me</c> is resolved from the
/// token by the handler, never by the client.
/// </param>
/// <param name="Escalated">
/// <c>true</c> or <c>false</c>. **Absent means "any", and <c>false</c> means "not escalated"** —
/// nullable so the two are distinguishable, which `spec.md` calls out because a non-nullable bool
/// would make an unfiltered request look like a request for non-escalated tickets.
/// </param>
/// <param name="Search">
/// Case-insensitive substring over ticket number, subject, and customer name (BR-7.5, AC-6).
/// Trimmed; whitespace-only is absent, never a match-nothing filter.
/// </param>
public sealed record GetTicketsQuery(
    int? Page = null,
    int? PageSize = null,
    Guid? CustomerId = null,
    IReadOnlyList<string>? Status = null,
    IReadOnlyList<string>? Priority = null,
    IReadOnlyList<string>? Category = null,
    IReadOnlyList<string>? Channel = null,
    string? Assignee = null,
    bool? Escalated = null,
    string? Search = null)
    : IRequest<PagedResult<TicketListItem>>
{
    /// <summary><c>?assignee=me</c>, spelled the way the contract spells it.</summary>
    internal const string MeToken = "me";

    /// <summary><c>?assignee=unassigned</c>.</summary>
    internal const string UnassignedToken = "unassigned";

    /// <summary>The parsed, de-duplicated, clamped filter values. `015` AC-4, AC-5.</summary>
    /// <remarks>
    /// <b>Computed here rather than in the handler</b>, following <c>GetCustomersQuery</c>'s
    /// <c>Effective*</c> convention: the rule lives with the shape it applies to, and a test can
    /// assert the clamp without a database. Invalid values are absent from these lists and
    /// <c>GetTicketsQueryValidator</c> is what turns them into a <c>400</c> — so in a served
    /// request these are total, and out of one they are merely safe.
    /// </remarks>
    internal IReadOnlyList<TicketStatus> EffectiveStatus => TicketFilters.Parse<TicketStatus>(Status);

    /// <inheritdoc cref="EffectiveStatus"/>
    internal IReadOnlyList<TicketPriority> EffectivePriority =>
        TicketFilters.Parse<TicketPriority>(Priority);

    /// <inheritdoc cref="EffectiveStatus"/>
    internal IReadOnlyList<TicketCategory> EffectiveCategory =>
        TicketFilters.Parse<TicketCategory>(Category);

    /// <inheritdoc cref="EffectiveStatus"/>
    internal IReadOnlyList<CommunicationChannel> EffectiveChannel =>
        TicketFilters.Parse<CommunicationChannel>(Channel);

    /// <summary>The trimmed term, or null when there is effectively no search.</summary>
    /// <remarks>
    /// Identical rule to <c>GetCustomersQuery.EffectiveSearch</c> — whitespace-only is absent.
    /// A client that sends <c>?search=%20</c> after clearing a box is not asking for the tickets
    /// whose subject is a space.
    /// </remarks>
    internal string? EffectiveSearch => string.IsNullOrWhiteSpace(Search) ? null : Search.Trim();

    /// <summary>Which of the three meanings <c>?assignee=</c> carries. `015` AC-8, AC-9.</summary>
    internal AssigneeFilterKind AssigneeKind =>
        string.IsNullOrWhiteSpace(Assignee) ? AssigneeFilterKind.Any
        : Assignee.Trim().Equals(MeToken, StringComparison.OrdinalIgnoreCase) ? AssigneeFilterKind.Me
        : Assignee.Trim().Equals(UnassignedToken, StringComparison.OrdinalIgnoreCase)
            ? AssigneeFilterKind.Unassigned
        : Guid.TryParse(Assignee.Trim(), out _) ? AssigneeFilterKind.User
        : AssigneeFilterKind.Any;

    /// <summary>The explicit id, when <c>?assignee=</c> was one. Null for every other kind.</summary>
    internal Guid? AssigneeUserId =>
        AssigneeKind == AssigneeFilterKind.User && Guid.TryParse(Assignee!.Trim(), out var id)
            ? id
            : null;

    /// <summary>
    /// True when <c>?assignee=</c> was supplied and is none of the three accepted forms — which is
    /// a <c>400</c>, not a silently ignored filter.
    /// </summary>
    /// <remarks>
    /// <see cref="AssigneeKind"/> answers <c>Any</c> for an unparseable value so nothing downstream
    /// has to handle a fourth case, and this property is what stops that being a silent drop.
    /// <b>Dropping an unrecognised filter answers a different question from the one asked</b> —
    /// `spec.md` says so for <c>?status=</c> and the reasoning is identical here.
    /// </remarks>
    internal bool AssigneeIsUnrecognised =>
        !string.IsNullOrWhiteSpace(Assignee) && AssigneeKind == AssigneeFilterKind.Any;
}
