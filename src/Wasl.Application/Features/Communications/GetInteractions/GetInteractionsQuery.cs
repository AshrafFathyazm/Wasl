using MediatR;
using Wasl.Application.Common;

namespace Wasl.Application.Features.Communications.GetInteractions;

/// <summary>
/// <c>GET /api/tickets/{ticketId}/interactions</c>. `021`, AC-19, AC-20.
/// </summary>
/// <remarks>
/// <para>
/// <b>This endpoint exists so the seam is observable to a person rather than only to a
/// <c>SELECT</c>.</b> A feature that writes rows nobody can read is a feature a reviewer has to
/// take on trust, and `021`'s whole justification is demonstrability.
/// </para>
/// <para>
/// <b>The ENVELOPE, not a cursor</b> — `CLAUDE.md` records both shapes as deliberate and gives
/// the test: a list grows at the end the reader is *not* looking at, a feed grows at the end they
/// *are*. `013`'s timeline is a cursor because a new comment appears where the reader is; a
/// ticket's message history is short, bounded, and read from the top, so page 2 stays page 2.
/// </para>
/// <para>
/// <b>Reading is NOT assignment-sensitive</b>, unlike sending (Q-A). BR-6 lets every support user
/// see every ticket, and interactions are part of a ticket. The asymmetry is intentional: sending
/// creates something a customer sees, reading does not.
/// </para>
/// <para>
/// <b>No filters and no sort parameter</b> (`research.md` R-13). Order is <c>CreatedAtUtc</c>
/// ascending — the reading order of a conversation, and the same order BR-5.7 uses for the
/// timeline. A <c>?dir=</c> on a conversation is a control nobody wants and a second code path to
/// test.
/// </para>
/// </remarks>
/// <param name="Page">1-based. Below 1 clamps to 1 (BR-7.2), never rejected.</param>
/// <param name="PageSize">
/// Above 100 clamps to 100. Below 1 becomes the default of 20 — a client sending <c>0</c> means
/// "I did not set this", and answering with one row would look like a working page of one.
/// </param>
public sealed record GetInteractionsQuery(Guid TicketId, int? Page, int? PageSize)
    : IRequest<PagedResult<InteractionResponse>>;
