using Wasl.Application.Common.Messaging;
using Wasl.Domain.Audit;
using Wasl.Domain.Communications;

namespace Wasl.Application.Features.Communications.SendMessage;

/// <summary>
/// <c>POST /api/tickets/{ticketId}/messages</c>. US-012, FR-3. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>No recipient field, and no <c>expectedVersion</c>.</b> Both absences are load-bearing.
/// The address is resolved from the ticket's customer and snapshotted (spec A-5) — an agent who
/// could type a recipient would be a whole validation and authorization surface this feature does
/// not have, and the one place in this product where a support user could send data to an
/// arbitrary address. And nothing on the ticket is mutated, so there is no version to check: the
/// interaction is a new row, and two concurrent sends are two messages, which is what the user
/// asked for both times.
/// </para>
/// <para>
/// <b>An <c>IAuditableCommand</c></b>, so `003`'s pipeline opens the transaction and writes the
/// BR-9.3 row inside it. The interaction row and the audit row land together or not at all —
/// AC-8 asserts the second half by failing a request after the provider call and finding no row.
/// </para>
/// <para>
/// <b>NOT idempotent, and deliberately without an <c>Idempotency-Key</c></b> unlike
/// `036`'s <c>POST /api/tickets</c>. Two identical submissions are two messages and two `201`s.
/// Deduplicating an outbound message means guessing whether the user meant to send it twice, and
/// a swallowed second message is worse than a duplicate one — the customer sees neither the
/// duplicate nor the absence, but the agent believes they sent it. The client disables submit
/// while the request is in flight (AC-22), which is the honest mitigation.
/// </para>
/// </remarks>
/// <param name="TicketId">
/// From the route. A malformed one never reaches here — the <c>{ticketId:guid}</c> constraint
/// fails the route match and `002b` answers `404`.
/// </param>
/// <param name="Channel">
/// Must be a <see cref="CommunicationChannel"/> value <b>and</b> be registered in the provider
/// registry. Both are validation, not a conflict: sendability is a property of the request value
/// rather than of ticket state (AC-3).
/// </param>
/// <param name="Body">
/// 1 to 4000 characters after trimming. Stored and sent verbatim, never translated (BR-8.10).
/// </param>
public sealed record SendMessageCommand(
    Guid TicketId,
    CommunicationChannel Channel,
    string Body) : IAuditableCommand<InteractionResponse>
{
    /// <summary>Matches the column and <c>TicketComment.BodyMaxLength</c>.</summary>
    public const int BodyMaxLength = Interaction.BodyMaxLength;

    /// <summary>BR-9.3. Prefixed <c>Communication.</c> so <c>LIKE 'Communication.%'</c> works.</summary>
    /// <remarks>
    /// One action string for both outcomes. `004`'s deviation D-2 settled this shape: a command
    /// carries one action and <c>Outcome</c> carries whether it worked, because
    /// <c>AuditBehaviour</c> reads the action without knowing which path ran. So a message the
    /// provider refused is <c>Communication.MessageSent</c> with a `Success` outcome — the
    /// *command* succeeded, and the delivery status is on the row it wrote.
    /// </remarks>
    public string AuditAction => "Communication.MessageSent";

    /// <summary>
    /// The <b>ticket</b>, not the interaction, and on both paths.
    /// </summary>
    /// <remarks>
    /// <para>
    /// A denial or a conflict writes a row before any interaction exists, so targeting the
    /// interaction would leave those rows naming nothing (`003` `research.md` R-8). The ticket id
    /// is on the command and is therefore always available.
    /// </para>
    /// <para>
    /// <b>The label is the interaction's id when there is one</b> — that is what makes an audit
    /// row traceable to the exact message, and AC-16 requires the interaction id in the row.
    /// </para>
    /// </remarks>
    public AuditTarget DescribeTarget(InteractionResponse? response) =>
        new("Ticket", TicketId, response?.Id.ToString());
}
