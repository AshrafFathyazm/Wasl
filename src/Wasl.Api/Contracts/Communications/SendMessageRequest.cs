using Wasl.Domain.Communications;

namespace Wasl.Api.Contracts.Communications;

/// <summary>
/// The body of <c>POST /api/tickets/{ticketId}/messages</c>. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>TWO FIELDS, AND THE TWO ABSENCES ARE THE INTERESTING PART.</b>
/// </para>
/// <para>
/// <b>No <c>recipientAddress</c>.</b> The address is resolved from the ticket's customer and
/// snapshotted onto the row (spec A-5). A recipient field would make this the one place in the
/// product where a support user can direct data to an arbitrary address — a whole validation and
/// authorization surface this feature does not have, and the kind of endpoint that turns into an
/// exfiltration path. AC-2 asserts the mock received the address the handler resolved.
/// </para>
/// <para>
/// <b>No <c>expectedVersion</c>.</b> Nothing on the ticket is mutated — an interaction is a new
/// row — so there is no token to be stale against, and the interaction table carries no
/// concurrency column. Two concurrent sends are two messages, which is what the user asked for
/// both times.
/// </para>
/// <para>
/// Both members are non-nullable, so `002c`'s
/// <c>SuppressImplicitRequiredAttributeForNonNullableReferenceTypes</c> sends a missing one to
/// FluentValidation rather than to the model binder — which is what gets the caller a catalogue
/// message naming the field instead of the framework's English sentence.
/// <c>RequiredMemberCoverageTests</c> requires a validator rule for each, and there is one.
/// </para>
/// </remarks>
/// <param name="Channel">
/// Must be a <see cref="CommunicationChannel"/> value <b>and</b> registered in the provider
/// registry. Both failures are `400` — sendability is a property of the request value, not of
/// ticket state, so it is never a `409` (AC-3).
/// </param>
/// <param name="Body">
/// 1 to 4000 characters after trimming. Stored and sent verbatim, never translated (BR-8.10).
/// </param>
public sealed record SendMessageRequest(CommunicationChannel Channel, string Body);
