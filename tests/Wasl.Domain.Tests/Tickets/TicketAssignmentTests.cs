using FluentAssertions;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Domain.Tests.Tickets;

/// <summary>
/// <c>Ticket.Assign</c> — the two BR-2 rules that are invariants of the entity. `011`.
/// </summary>
/// <remarks>
/// No database and no HTTP. BR-2.1 to BR-2.4 are absent from these tests because they are absent
/// from the entity: they need the caller's identity, the caller's role, and a row from another
/// table, and the handler owns them.
/// </remarks>
public sealed class TicketAssignmentTests
{
    private static readonly DateTime Now = new(2026, 8, 28, 10, 0, 0, DateTimeKind.Utc);

    private static Ticket New() => Ticket.Create(
        customerId: Guid.CreateVersion7(),
        ticketNumber: "TCK-2026-000001",
        subject: "Assignment",
        description: "A ticket to assign.",
        category: TicketCategory.Technical,
        channel: CommunicationChannel.Email,
        priority: TicketPriority.Normal);

    [Fact]
    public void Assigning_an_unassigned_ticket_sets_the_assignee_and_returns_an_assigned_row()
    {
        var ticket = New();
        var assignee = Guid.CreateVersion7();

        var history = ticket.Assign(assignee, Now);

        ticket.AssignedToUserId.Should().Be(assignee);
        history.EventType.Should().Be(TicketHistoryEventType.Assigned);
        history.OldValue.Should().BeNull("there was no previous assignee, and \"None\" would invent one");
        history.NewValue.Should().Be(assignee.ToString());
        history.PerformedAtUtc.Should().Be(Now);
    }

    [Fact]
    public void Reassigning_records_both_sides()
    {
        var ticket = New();
        var first = Guid.CreateVersion7();
        var second = Guid.CreateVersion7();

        ticket.Assign(first, Now);
        var history = ticket.Assign(second, Now);

        ticket.AssignedToUserId.Should().Be(second);
        history.OldValue.Should().Be(first.ToString(),
            "the previous value cannot be recovered afterwards — the column it came from has been "
            + "overwritten");
        history.NewValue.Should().Be(second.ToString());
    }

    [Fact]
    public void Unassigning_clears_the_column_and_returns_its_own_event_type()
    {
        var ticket = New();
        var assignee = Guid.CreateVersion7();

        ticket.Assign(assignee, Now);
        var history = ticket.Assign(null, Now);

        ticket.AssignedToUserId.Should().BeNull();
        history.EventType.Should().Be(TicketHistoryEventType.Unassigned,
            "BR-2.6 names both events. Handing work back is a different act from handing it over, "
            + "and collapsing them leaves the distinction recoverable only by testing NewValue "
            + "for null — a rule living in whatever renders the row");
        history.OldValue.Should().Be(assignee.ToString());
        history.NewValue.Should().BeNull();
    }

    /// <summary>AC-10, BR-2.7, ADR-004 — a test that asserts nothing happened.</summary>
    [Theory]
    [InlineData(TicketStatus.New)]
    [InlineData(TicketStatus.Open)]
    public void Assigning_never_changes_the_status(TicketStatus start)
    {
        var ticket = New();

        if (start is TicketStatus.Open)
        {
            ticket.ChangeStatus(TicketStatus.Open, Now);
        }

        ticket.Assign(Guid.CreateVersion7(), Now);

        ticket.Status.Should().Be(start,
            "triage and ownership are separate acts; coupling them hides one of them from the "
            + "history");
    }

    /// <summary>
    /// AC-16's domain half. The same status, a different permitted set.
    /// </summary>
    [Fact]
    public void Assigning_changes_the_allowed_transitions_it_does_not_change_the_status()
    {
        var ticket = New();
        ticket.ChangeStatus(TicketStatus.Open, Now);

        ticket.AllowedTransitions.Should().Equal([TicketStatus.Closed]);

        ticket.Assign(Guid.CreateVersion7(), Now);

        ticket.Status.Should().Be(TicketStatus.Open);
        ticket.AllowedTransitions.Should().Equal([TicketStatus.InProgress, TicketStatus.Closed],
            "BR-1.3 makes InProgress conditional on having an assignee, so the array is computed "
            + "from the ticket's state and never stored");
    }

    /// <summary>AC-11, both directions.</summary>
    [Fact]
    public void Assigning_the_current_assignee_is_refused()
    {
        var ticket = New();
        var assignee = Guid.CreateVersion7();
        ticket.Assign(assignee, Now);

        var act = () => ticket.Assign(assignee, Now);

        act.Should().Throw<AssigneeUnchangedException>(
            "a 200 would tell the client its request was applied when nothing happened — this is "
            + "what a double-click on the picker produces");
    }

    [Fact]
    public void Unassigning_an_already_unassigned_ticket_is_refused()
    {
        var ticket = New();

        var act = () => ticket.Assign(null, Now);

        act.Should().Throw<AssigneeUnchangedException>();
    }

    /// <summary>AC-8, BR-2.5, BR-1.5.</summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void A_closed_ticket_refuses_both_directions(bool assigning)
    {
        var ticket = New();
        var assignee = Guid.CreateVersion7();

        if (!assigning)
        {
            ticket.Assign(assignee, Now);
        }

        ticket.ChangeStatus(TicketStatus.Closed, Now, note: "closing");

        var act = () => ticket.Assign(assigning ? assignee : null, Now);

        act.Should().Throw<TicketClosedException>(
            "Closed is terminal — no reopen, reassign, escalate, or comment");
    }

    /// <summary>
    /// The refusals leave the ticket untouched.
    /// </summary>
    /// <remarks>
    /// A method that throws after mutating is the defect a "does it throw?" test cannot see: the
    /// exception reaches the client, the transaction rolls back, and the in-memory entity is
    /// wrong for the rest of the request. Asserted because <c>Assign</c> writes to a field.
    /// </remarks>
    [Fact]
    public void A_refused_assignment_mutates_nothing()
    {
        var ticket = New();
        var assignee = Guid.CreateVersion7();
        ticket.Assign(assignee, Now);

        var act = () => ticket.Assign(assignee, Now);
        act.Should().Throw<AssigneeUnchangedException>();

        ticket.AssignedToUserId.Should().Be(assignee, "unchanged, not cleared");
        ticket.Status.Should().Be(TicketStatus.New);
    }
}
