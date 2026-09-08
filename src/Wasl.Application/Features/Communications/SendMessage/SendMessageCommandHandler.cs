using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Common.Communications;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Communications.SendMessage;

/// <summary>
/// Resolves the recipient, routes to the provider, records the attempt. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Every refusal is decided BEFORE the provider is called, and the contract states it:</b>
/// *"`401`, `403`, `404`, and both `409`s are all decided before the provider is called, and none
/// of them writes an `Interactions` row. Nothing leaves the process for a request that was going
/// to be refused."* AC-11, AC-12 and AC-13 each assert it the same way — by finding the mock's
/// buffer empty afterwards, which is an observation about the provider rather than about the
/// response.
/// </para>
/// <code>
/// 400  validation, incl. a channel with no provider   the pipeline, before this runs
/// 401  no token                                       the fallback policy
/// 404  no such ticket                                 here
/// 403  an Agent on someone else's ticket              here  (Q-A)
/// 409  ticket-closed                                  here  (BR-5.2 mirrored)
/// 409  no-contact-for-channel                         here
/// ───────────────────────────────────────────────────  the provider is called below this line
/// 201  Accepted or Failed                             both write a row
/// </code>
/// <para>
/// <b>`404` before `403`, which is the opposite of `016`'s ordering — and both are right.</b>
/// `016` puts a Manager-only policy on the endpoint, so an Agent is refused before any lookup and
/// learns nothing about which ids exist. Here there is no policy to put it in: BR-2.2's shape
/// applies, an Agent legitimately sends on their own tickets, and Q-A's rule needs the ticket's
/// assignee — so the ticket has to be loaded first and a `404` is unavoidable. That is not a
/// disclosure regression: `GET /api/tickets/{id}` already returns the ticket to every support
/// user, so an id's existence is not a secret from an Agent. `016`'s endpoint is different
/// precisely because escalation is Manager-only.
/// </para>
/// <para>
/// <b>Q-A, ruled at the approval gate: sending is assignment-sensitive.</b> A Manager on any
/// ticket; an Agent on a ticket assigned to themselves or unassigned. BR-6 has no row for this
/// action, and the alternative — the comment rule, any support user on any ticket — was declined
/// because an outbound message is the only act in this system a *customer* sees. An internal note
/// read by the wrong colleague is untidy; a message sent to a customer by someone with no
/// business on the ticket is not recoverable.
/// </para>
/// <para>
/// <b>The permission check is here and not on the endpoint</b>, for BR-6's measured reason: it
/// needs the ticket's current assignee, which a policy cannot see, and a handler denial is
/// audited while a policy denial is not (`011`, `004` AC-18).
/// </para>
/// </remarks>
internal sealed class SendMessageCommandHandler(
    IApplicationDbContext context,
    CommunicationProviderRegistry registry,
    ICurrentUser currentUser,
    IRequestTimestamp timestamp) : IRequestHandler<SendMessageCommand, InteractionResponse>
{
    public async Task<InteractionResponse> Handle(
        SendMessageCommand request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        /* THE TICKET AND ITS CUSTOMER'S CONTACT DETAILS IN ONE QUERY.
         *
         * A projection rather than two round trips, and rather than loading the Customer entity:
         * what is needed is the status, the assignee, and the two address columns. Loading the
         * customer would bring a dozen columns to answer a question about two of them, and
         * `010` AC-12's counter is the tool that would eventually notice. */
        var target = await context.FirstOrDefaultAsync(
            context.Tickets
                .Where(candidate => candidate.Id == request.TicketId)
                .Select(candidate => new SendTarget(
                    candidate.Id,
                    candidate.Status,
                    candidate.AssignedToUserId,
                    context.Customers
                        .Where(customer => customer.Id == candidate.CustomerId)
                        .Select(customer => customer.Email)
                        .FirstOrDefault(),
                    context.Customers
                        .Where(customer => customer.Id == candidate.CustomerId)
                        .Select(customer => customer.PhoneE164)
                        .FirstOrDefault())),
            cancellationToken);

        if (target is null)
        {
            throw new NotFoundException("Error.Ticket.NotFound");
        }

        EnsurePermitted(target);

        // BR-5.2 mirrored. `Closed` is terminal project-wide, so there is no reopen-and-retry to
        // offer — and the check is here rather than in the entity because `Interaction` is a new
        // row, not a mutation of the ticket, so the ticket's own factory never sees this request.
        if (target.Status is TicketStatus.Closed)
        {
            throw new TicketClosedException();
        }

        var recipient = ResolveRecipient(request.Channel, target);

        /* THE PROVIDER, FROM THE REGISTRY, AND IT CANNOT BE NULL HERE.
         *
         * The validator refused an unregistered channel as a `400` before this handler ran
         * (AC-3), so this is the "no code path can reach a null provider" half of that criterion.
         * An exception rather than a graceful fallback: if this ever throws, the validator and the
         * registry have disagreed, and that is a defect in this codebase rather than something a
         * caller did. */
        var provider = registry.Find(request.Channel)
            ?? throw new InvalidOperationException(
                $"No communication provider is registered for {request.Channel}, and "
                + "SendMessageCommandValidator should have refused this request as a 400 before "
                + "the handler ran. The validator and the registry disagree.");

        var outcome = await provider.SendAsync(
            new OutboundMessage(request.Channel, recipient, request.Body.Trim()),
            cancellationToken);

        /* THE ROW IS WRITTEN FOR BOTH OUTCOMES — AC-7, and it is the feature's central decision.
         *
         * A failed send is a `201` carrying `deliveryStatus: "Failed"`, not a `5xx`. A `5xx` would
         * unwind this transaction and take the record of the attempt with it, leaving a support
         * agent nothing to show for a message they tried to send. The attempt is the resource
         * (`research.md` R-5), and the client branches on `deliveryStatus` rather than only on the
         * status code. */
        var interaction = Interaction.Send(
            ticketId: target.Id,
            channel: request.Channel,
            recipientAddress: recipient,
            body: request.Body,
            providerName: provider.Name,
            providerMessageId: outcome.ProviderMessageId,
            deliveryStatus: outcome.Status,
            failureCode: outcome.FailureCode,

            // From the token. Not null after `004` — the fallback policy is
            // RequireAuthenticatedUser — and the FK would refuse Guid.Empty loudly if it were.
            sentByUserId: currentUser.UserId
                ?? throw new InvalidOperationException(
                    "SendMessageCommandHandler ran with no authenticated user. The fallback "
                    + "authentication policy has to have been bypassed for this to happen."),

            // One scoped instant, like every other write in this product. Never DateTime.UtcNow.
            createdAtUtc: timestamp.UtcNow.UtcDateTime);

        context.Add(interaction);

        await context.SaveChangesAsync(cancellationToken);

        return InteractionResponse.From(interaction);
    }

    /// <summary>
    /// Q-A. A Manager on any ticket; an Agent on their own or an unassigned one.
    /// </summary>
    /// <remarks>
    /// <b>Deliberately the same shape as <c>AssignTicketCommandHandler.EnsurePermitted</c></b>, and
    /// not the same code: BR-2's version also constrains the *target* of an assignment, which has
    /// no analogue here. Two short rules that read alike beat one shared rule with a flag for
    /// which caller it is serving.
    /// </remarks>
    private void EnsurePermitted(SendTarget target)
    {
        // Read defensively even though `004`'s fallback policy makes null unreachable: the
        // alternative to throwing is a silent `false` on the comparison below, and a permission
        // rule failing open is the one outcome worse than failing loudly.
        var callerId = currentUser.UserId;

        if (callerId is null)
        {
            throw new ForbiddenException("Error.Communication.SendNotPermitted");
        }

        if (currentUser.IsManager())
        {
            return;
        }

        // An Agent may send on a ticket that is theirs, or on one nobody owns. `null` is not a
        // wildcard here — an unassigned ticket is genuinely unowned, and refusing it would stop an
        // Agent replying to a customer on a ticket they are actively triaging.
        if (target.AssignedToUserId is { } assignee && assignee != callerId)
        {
            throw new ForbiddenException("Error.Communication.SendNotPermitted");
        }
    }

    /// <summary>
    /// The channel → address map, in code, matching the one table in the contract.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Two message keys, and neither names the address the customer DOES have.</b> The remedy
    /// is "pick another channel or edit the customer"; enumerating contact details into an error
    /// body is a leak with no purpose (NFR-4), and the same restraint BR-4.7's `409` keeps.
    /// </para>
    /// <para>
    /// <b><c>LiveChat</c> and <c>WebForm</c> fall through to the same `409`</b> rather than
    /// getting a case, and they are unreachable anyway — the validator refuses them as `400`
    /// because no provider is registered. The <c>default</c> arm exists so that registering a
    /// provider for one of them produces a comprehensible `409` rather than an empty recipient
    /// reaching the database, which is what <c>RecipientAddress NOT NULL</c> would then refuse as
    /// a `500`.
    /// </para>
    /// </remarks>
    private static string ResolveRecipient(CommunicationChannel channel, SendTarget target) =>
        channel switch
        {
            CommunicationChannel.Email => Require(
                target.CustomerEmail, "Error.Communication.NoEmailForChannel"),

            CommunicationChannel.WhatsApp or CommunicationChannel.Sms => Require(
                target.CustomerPhone, "Error.Communication.NoPhoneForChannel"),

            _ => throw new NoContactForChannelException("Error.Communication.NoAddressForChannel"),
        };

    private static string Require(string? address, string messageKey) =>
        string.IsNullOrWhiteSpace(address)
            ? throw new NoContactForChannelException(messageKey)
            : address;

    /// <summary>
    /// What the one query projects: the ticket facts the rules need, and the two addresses.
    /// </summary>
    /// <remarks>
    /// A local record rather than a shared DTO. Nothing outside this handler wants "a ticket plus
    /// its customer's two contact columns", and a shared type would invite a second consumer to
    /// widen it.
    /// </remarks>
    private sealed record SendTarget(
        Guid Id,
        TicketStatus Status,
        Guid? AssignedToUserId,
        string? CustomerEmail,
        string? CustomerPhone);
}
