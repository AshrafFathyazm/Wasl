using Wasl.Domain.Communications;

namespace Wasl.Api.Contracts.Tickets;

/// <summary>
/// The request body, exactly as `contracts/timeline-api.md` freezes it. `013`.
/// </summary>
/// <remarks>
/// <para>
/// <b>A separate type from the command, and the difference is what is missing.</b> The command
/// carries <c>TicketId</c>; this does not, so the route is the only source of it. And neither
/// carries <c>authorUserId</c> or <c>createdAtUtc</c> — <b>there is no field on this type through
/// which a client could name an author or backdate a comment</b>, which is AC-15 expressed as an
/// absence rather than as a check. Both are stamped in
/// <c>WaslDbContext.SaveChangesAsync</c> and <c>IRequestTimestamp</c> respectively.
/// </para>
/// <para>
/// <b>No <c>expectedVersion</c>.</b> Commenting does not modify the ticket, so its
/// <c>rowversion</c> does not move and two people commenting at once are not in conflict — a
/// version check here would refuse the second of two simultaneous comments for no reason.
/// </para>
/// </remarks>
/// <param name="Body">BR-5.1 — non-whitespace, at most 4000 characters.</param>
/// <param name="IsInternal">
/// BR-5.4. Defaults to <c>false</c>: a comment is customer-facing unless someone says otherwise,
/// because the failure of the wrong default runs the safe way — an internal note accidentally
/// marked public is visible to colleagues today and to nobody else, since no customer view exists,
/// whereas defaulting to internal would quietly mark the entire history as not-for-the-customer
/// before that distinction ever mattered.
/// </param>
/// <param name="Channel">
/// FR-3.3, and genuinely optional: a comment typed into the application arrived through no channel
/// at all, so a default here would invent a fact about where it came from.
/// </param>
/// <param name="AuthorCustomerId">
/// Set to record a reply that came FROM the customer through a channel (`034`).
/// <para>
/// Omit it for the agent's own note, which is the common case. When present it must be this
/// ticket's customer, it forces <c>Channel</c>, and it forbids <c>IsInternal</c> — all three
/// refused by the domain, not by this record.
/// </para>
/// <para>
/// A client cannot use this to attribute a comment to a support user it chose: the SUPPORT USER
/// on the row is still stamped from the token and there is no field here for it (AC-15). This
/// names a customer, and the only customer it will accept is the one already on the ticket.
/// </para>
/// </param>
public sealed record AddTicketCommentRequest(
    string Body,
    bool IsInternal = false,
    CommunicationChannel? Channel = null,
    Guid? AuthorCustomerId = null);
