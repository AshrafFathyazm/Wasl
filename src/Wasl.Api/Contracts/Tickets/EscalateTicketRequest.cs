namespace Wasl.Api.Contracts.Tickets;

/// <summary>
/// The body of <c>POST /api/tickets/{id}/escalate</c>. `016`.
/// </summary>
/// <remarks>
/// <para>
/// <b>No <c>isEscalated</c> field, and that is BR-3.9 rather than an omission.</b> A body that
/// could carry <c>isEscalated: false</c> would make de-escalation expressible, and the whole
/// reason this is a <c>POST</c> on a sub-resource rather than a field on a generic <c>PUT</c> is
/// that escalation is one-way.
/// </para>
/// <para>
/// <b>No <c>priority</c> field either.</b> BR-3.6's floor is the server's to apply — a client that
/// could send a priority alongside an escalation could set it BELOW the floor, and the contract is
/// explicit that <c>priority</c> is a field to read and never to compute.
/// </para>
/// <para>
/// Both members are non-nullable, so `002c`'s
/// <c>SuppressImplicitRequiredAttributeForNonNullableReferenceTypes</c> sends a missing one to
/// FluentValidation rather than to the model binder — which is what gets the caller a catalogue
/// message naming the field instead of the framework's English sentence.
/// <c>RequiredMemberCoverageTests</c> requires a validator rule for each, and there is one.
/// </para>
/// </remarks>
/// <param name="Reason">
/// 1 to 500 characters, measured AFTER trimming (BR-3.5). Stored verbatim and never translated.
/// </param>
/// <param name="ExpectedVersion">
/// The base64 <c>rowversion</c> from the ticket read. Required, exactly as on <c>/status</c> and
/// <c>/assignee</c>.
/// </param>
public sealed record EscalateTicketRequest(string Reason, string ExpectedVersion);
