using FluentAssertions;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Domain.Tests.Tickets;

/// <summary>
/// A comment recorded on the customer's behalf. `034` AC-1, AC-3, AC-4, AC-5.
/// </summary>
/// <remarks>
/// <para>
/// No database and no HTTP. Every rule below is an invariant of the entity, and that placement is
/// the thing being asserted as much as the rules themselves: a validator would leave `--seed`, a
/// future channel ingester, and every direct constructor free to build the contradiction.
/// </para>
/// <para>
/// <b>The customer never signs in.</b> There is no customer authentication in this product and it
/// is out of scope, so a customer's message reaches us through a channel and a support user
/// records it — which is why every one of these rows has two people on it.
/// </para>
/// </remarks>
public sealed class CustomerAuthoredCommentTests
{
    private static readonly DateTime Now = new(2026, 8, 31, 10, 0, 0, DateTimeKind.Utc);

    private static readonly Guid TheCustomer = Guid.CreateVersion7();

    private static Ticket New() => Ticket.Create(
        customerId: TheCustomer,
        ticketNumber: "TCK-2026-000042",
        subject: "Duplicate charge",
        description: "Charged twice for one purchase.",
        category: TicketCategory.Billing,
        channel: CommunicationChannel.Email,
        priority: TicketPriority.High);

    // ---- AC-1 · the shape of the row -------------------------------------------------------

    [Fact]
    public void A_comment_with_no_customer_is_from_the_agent()
    {
        var comment = TicketComment.Create(Guid.CreateVersion7(), "Called the customer.", Now);

        comment.AuthorKind.Should().Be(CommentAuthorKind.Agent);
        comment.AuthorCustomerId.Should().BeNull();
        comment.Channel.Should().BeNull("an agent typing into the application came through no channel");
    }

    [Fact]
    public void Naming_a_customer_makes_it_a_customer_comment()
    {
        var comment = TicketComment.Create(
            Guid.CreateVersion7(),
            "I called again to ask for a written confirmation.",
            Now,
            channel: CommunicationChannel.Email,
            authorCustomerId: TheCustomer);

        comment.AuthorKind.Should().Be(CommentAuthorKind.Customer);
        comment.AuthorCustomerId.Should().Be(TheCustomer);
    }

    [Fact]
    public void The_kind_and_the_customer_id_can_never_disagree()
    {
        /* THE DISCRIMINATOR IS SET FROM THE ID, IN ONE PLACE, SO THE PAIR CANNOT DRIFT.
         *
         * Asserting both directions rather than one: a factory that always wrote `Customer`
         * would pass the test above, and a factory that always wrote `Agent` would pass the
         * first one. Only the pair catches either. */
        var fromAgent = TicketComment.Create(Guid.CreateVersion7(), "Note.", Now);
        var fromCustomer = TicketComment.Create(
            Guid.CreateVersion7(),
            "Reply.",
            Now,
            channel: CommunicationChannel.WhatsApp,
            authorCustomerId: TheCustomer);

        (fromAgent.AuthorKind is CommentAuthorKind.Customer)
            .Should().Be(fromAgent.AuthorCustomerId is not null);
        (fromCustomer.AuthorKind is CommentAuthorKind.Customer)
            .Should().Be(fromCustomer.AuthorCustomerId is not null);
    }

    // ---- AC-3 · a customer comment can never be internal --------------------------------------

    [Fact]
    public void A_customer_comment_cannot_be_internal()
    {
        var act = () => TicketComment.Create(
            Guid.CreateVersion7(),
            "Reply.",
            Now,
            isInternal: true,
            channel: CommunicationChannel.Email,
            authorCustomerId: TheCustomer);

        act.Should().Throw<CustomerCommentCannotBeInternalException>()
            .Which.FieldErrors.Should().ContainKey("isInternal",
                "the client has to know which control to put the message on");
    }

    [Fact]
    public void An_agent_comment_may_still_be_internal()
    {
        /* The negative half. Without it, a `Create` that refused EVERY internal comment would
         * pass the test above while removing BR-5.4 from the product. */
        var comment = TicketComment.Create(
            Guid.CreateVersion7(),
            "Ask billing to review the retry.",
            Now,
            isInternal: true);

        comment.IsInternal.Should().BeTrue();
        comment.AuthorKind.Should().Be(CommentAuthorKind.Agent);
    }

    // ---- AC-5 · a customer comment needs a channel --------------------------------------------

    [Fact]
    public void A_customer_comment_without_a_channel_is_refused()
    {
        var act = () => TicketComment.Create(
            Guid.CreateVersion7(),
            "Reply.",
            Now,
            authorCustomerId: TheCustomer);

        act.Should().Throw<CustomerCommentRequiresChannelException>()
            .Which.FieldErrors.Should().ContainKey("channel");
    }

    [Fact]
    public void An_agent_comment_without_a_channel_is_accepted()
    {
        // The null is a FACT for an agent and a MISSING fact for a customer. Same shape, and
        // this pair is what stops the rule being applied to both.
        var act = () => TicketComment.Create(Guid.CreateVersion7(), "Note.", Now);

        act.Should().NotThrow();
    }

    // ---- AC-4 · the customer must be this ticket's customer -----------------------------------

    [Fact]
    public void A_reply_from_this_tickets_customer_is_accepted()
    {
        var ticket = New();

        var act = () => ticket.AcceptComment(Guid.CreateVersion7(), Now, TheCustomer);

        act.Should().NotThrow();
    }

    [Fact]
    public void A_reply_from_a_different_customer_is_refused()
    {
        var ticket = New();
        var somebodyElse = Guid.CreateVersion7();

        var act = () => ticket.AcceptComment(Guid.CreateVersion7(), Now, somebodyElse);

        act.Should().Throw<CommentCustomerMismatchException>();
    }

    [Fact]
    public void The_refusal_names_neither_customer()
    {
        /* AN ENUMERATION ORACLE IS THE DEFECT HERE, NOT AN UNHELPFUL MESSAGE.
         *
         * If the exception echoed the ticket's real customer, any ticket id plus any customer id
         * would answer "who is this ticket's customer". BR-4.4 forbids exactly that shape for
         * customers, and the reason travels to whichever resource leaks it. */
        var ticket = New();
        var somebodyElse = Guid.CreateVersion7();

        var thrown = Record.Exception(
            () => ticket.AcceptComment(Guid.CreateVersion7(), Now, somebodyElse))!;

        var rendered = thrown.Message
            + string.Join(' ', ((CommentCustomerMismatchException)thrown).FieldErrors
                .SelectMany(pair => pair.Value.Append(pair.Key)));

        rendered.Should().NotContain(TheCustomer.ToString());
        rendered.Should().NotContain(somebodyElse.ToString());
    }

    [Fact]
    public void An_agent_comment_does_not_go_through_the_customer_check()
    {
        var ticket = New();

        var act = () => ticket.AcceptComment(Guid.CreateVersion7(), Now);

        act.Should().NotThrow();
    }

    // ---- AC-16 · closed is terminal for both kinds --------------------------------------------

    [Fact]
    public void A_closed_ticket_refuses_a_customer_reply_too()
    {
        /* BR-1.5 and BR-5.2. The status check runs BEFORE the customer check, and the order is
         * asserted rather than assumed: a closed ticket must answer "closed", not "wrong
         * customer", because only one of those tells the caller that no retry can succeed. */
        var ticket = New();
        // Closing requires a note — BR-1's own rule, and the reason this line is not a bare
        // ChangeStatus call.
        ticket.ChangeStatus(TicketStatus.Closed, Now, "Resolved with the customer by phone.");

        var act = () => ticket.AcceptComment(Guid.CreateVersion7(), Now, Guid.CreateVersion7());

        act.Should().Throw<TicketClosedException>();
    }
}
