using Wasl.Domain.Common.Exceptions;

namespace Wasl.Domain.Tickets;

/// <summary>
/// `034` AC-3. A comment recorded as being <b>from</b> the customer was also marked internal.
/// </summary>
/// <remarks>
/// <para>
/// <b>The two flags contradict each other, and the contradiction is not cosmetic.</b>
/// <c>IsInternal</c> means <i>hidden from the customer</i> (BR-5.4). A comment the customer wrote,
/// hidden from the customer, describes nothing that can happen — and if a customer-facing view is
/// ever built, that row would be invisible to the only person who already knows its contents.
/// </para>
/// <para>
/// <b>Refused in the entity, not in the validator.</b> A validator is the boundary's rule and
/// only the API passes through it; `--seed`, a future channel ingester, and any test that
/// constructs a comment directly all bypass it. This pairing must be impossible to construct,
/// which is the same argument <c>CLAUDE.md</c> uses to justify <c>Customer</c> having one factory
/// and private setters.
/// </para>
/// <para>
/// It still carries a field error so the API renders a <c>400</c> the client can place, following
/// <see cref="AssigneeInactiveException"/>: the request is what is wrong, not the ticket.
/// </para>
/// </remarks>
public sealed class CustomerCommentCannotBeInternalException()
    : DomainException(DomainErrorCodes.Validation, "Validation.Ticket.CustomerCommentInternal")
{
    public override IReadOnlyDictionary<string, string[]> FieldErrors { get; } =
        new Dictionary<string, string[]>
        {
            ["isInternal"] = ["Validation.Ticket.CustomerCommentInternal"],
        };
}

/// <summary>
/// `034` AC-5. A comment recorded as being from the customer named no channel.
/// </summary>
/// <remarks>
/// <para>
/// <b>The customer reached us somehow.</b> <see cref="TicketComment.Channel"/> is nullable
/// because an agent typing into the application came through no channel at all — that null is a
/// fact. A customer message with a null channel is a missing fact wearing the same shape, and the
/// two would be indistinguishable in every later query.
/// </para>
/// <para>
/// Defaulting to <c>Email</c> instead would be inventing where it came from, which the property's
/// own remarks already forbid for the agent case.
/// </para>
/// </remarks>
public sealed class CustomerCommentRequiresChannelException()
    : DomainException(DomainErrorCodes.Validation, "Validation.Ticket.CustomerCommentChannel")
{
    public override IReadOnlyDictionary<string, string[]> FieldErrors { get; } =
        new Dictionary<string, string[]>
        {
            ["channel"] = ["Validation.Ticket.CustomerCommentChannel"],
        };
}

/// <summary>
/// `034` AC-4. The customer named as the comment's author is not this ticket's customer.
/// </summary>
/// <remarks>
/// <para>
/// <b>Raised by <see cref="Ticket.AcceptComment"/>, because the ticket is the only thing that
/// knows its own customer.</b> Putting it in the handler would work and would be the wrong home:
/// the aggregate owns the fact, and a second write path would have to remember the check. This is
/// the mirror of the assignment rules, which live in the handler for the opposite reason — "is
/// this user active" is a row in another table and the entity must not reach for it.
/// </para>
/// <para>
/// <b>It names neither customer.</b> Echoing the ticket's real customer back would turn a
/// malformed request into a lookup — hand it any ticket id with any customer id and it tells you
/// who the customer is. BR-4.4 forbids exactly that shape of disclosure for customers, and the
/// reason travels: the distinction is an enumeration oracle regardless of which resource leaks it.
/// </para>
/// </remarks>
public sealed class CommentCustomerMismatchException()
    : DomainException(DomainErrorCodes.Validation, "Validation.Ticket.CommentCustomerMismatch")
{
    public override IReadOnlyDictionary<string, string[]> FieldErrors { get; } =
        new Dictionary<string, string[]>
        {
            ["authorCustomerId"] = ["Validation.Ticket.CommentCustomerMismatch"],
        };
}
