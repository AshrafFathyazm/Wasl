using FluentAssertions;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Domain.Tests.Tickets;

/// <summary>
/// `012`. BR-1 enforced, and the **order** the frozen contract fixes.
/// </summary>
/// <remarks>
/// The 36-cell matrix is asserted in <c>TicketStatusTransitionsTests</c>; this class asserts what
/// the entity does with it — which exception, in which order, and what the history row records.
/// The ordering tests are the ones that matter: a request can break several rules at once, and a
/// client must never have to guess which answer it gets.
/// </remarks>
public sealed class ChangeStatusTests
{
    private static readonly DateTime Now = new(2026, 8, 26, 11, 0, 0, DateTimeKind.Utc);

    private static Ticket At(TicketStatus status, bool assigned = false)
    {
        var ticket = Ticket.Create(
            Guid.NewGuid(), "TCK-2026-000042", "s", "d",
            TicketCategory.Technical, TicketPriority.Normal, CommunicationChannel.Email);

        // Walk the real transitions rather than reflecting a status in. A test that forces an
        // impossible state proves the rule against a ticket the system cannot produce.
        if (assigned)
        {
            typeof(Ticket).GetProperty(nameof(Ticket.AssignedToUserId))!
                .SetValue(ticket, Guid.NewGuid());
        }

        switch (status)
        {
            case TicketStatus.New:
                break;
            case TicketStatus.Open:
                ticket.ChangeStatus(TicketStatus.Open, Now);
                break;
            case TicketStatus.InProgress:
                ticket.ChangeStatus(TicketStatus.Open, Now);
                ticket.ChangeStatus(TicketStatus.InProgress, Now);
                break;
            case TicketStatus.PendingCustomer:
                ticket.ChangeStatus(TicketStatus.Open, Now);
                ticket.ChangeStatus(TicketStatus.InProgress, Now);
                ticket.ChangeStatus(TicketStatus.PendingCustomer, Now);
                break;
            case TicketStatus.Resolved:
                ticket.ChangeStatus(TicketStatus.Open, Now);
                ticket.ChangeStatus(TicketStatus.InProgress, Now);
                ticket.ChangeStatus(TicketStatus.Resolved, Now);
                break;
            case TicketStatus.Closed:
                ticket.ChangeStatus(TicketStatus.Closed, Now, "closing for the test");
                break;
        }

        return ticket;
    }

    /// <summary>AC-1, AC-11.</summary>
    [Fact]
    public void A_permitted_transition_moves_the_status_and_returns_a_history_row()
    {
        var ticket = At(TicketStatus.New);

        var history = ticket.ChangeStatus(TicketStatus.Open, Now);

        ticket.Status.Should().Be(TicketStatus.Open);
        history.EventType.Should().Be(TicketHistoryEventType.StatusChanged);
        history.OldValue.Should().Be("New");
        history.NewValue.Should().Be("Open",
            "both values, because a timeline reading 'moved to Open' is far less useful than "
            + "'moved from New to Open' — and the previous value cannot be recovered afterwards");
        history.PerformedAtUtc.Should().Be(Now);
        history.TicketId.Should().Be(ticket.Id);
    }

    /// <summary>AC-2, AC-7. BR-1.4 is the one a reader most often assumes is allowed.</summary>
    [Fact]
    public void A_forbidden_transition_names_the_current_status_and_what_is_permitted()
    {
        var ticket = At(TicketStatus.PendingCustomer, assigned: true);

        var act = () => ticket.ChangeStatus(TicketStatus.Resolved, Now);

        var thrown = act.Should().Throw<InvalidStatusTransitionException>().Which;

        thrown.CurrentStatus.Should().Be(TicketStatus.PendingCustomer);
        thrown.Allowed.Should().Equal([TicketStatus.InProgress],
            "AC-3 — the client needs a real alternative, not a dead end");
        ticket.Status.Should().Be(TicketStatus.PendingCustomer, "a refused transition changes nothing");
    }

    /// <summary>AC-4, BR-1.3.</summary>
    [Fact]
    public void Moving_to_in_progress_without_an_assignee_is_refused_with_its_own_code()
    {
        var ticket = At(TicketStatus.Open);

        var act = () => ticket.ChangeStatus(TicketStatus.InProgress, Now);

        act.Should().Throw<AssigneeRequiredException>()
            .Which.ErrorCode.Should().Be(DomainErrorCodes.AssigneeRequired,
                "its own code, because the client's reaction is to offer Assign — not to offer a "
                + "different transition (spec.md Q-3)");
    }

    [Fact]
    public void Moving_to_in_progress_with_an_assignee_succeeds()
    {
        var ticket = At(TicketStatus.Open, assigned: true);

        ticket.ChangeStatus(TicketStatus.InProgress, Now);

        ticket.Status.Should().Be(TicketStatus.InProgress);
    }

    /// <summary>AC-13, BR-1.9.</summary>
    [Fact]
    public void A_same_status_transition_is_refused_with_its_own_code()
    {
        var ticket = At(TicketStatus.Open);

        var act = () => ticket.ChangeStatus(TicketStatus.Open, Now);

        act.Should().Throw<SameStatusTransitionException>()
            .Which.ErrorCode.Should().Be(DomainErrorCodes.SameStatusTransition,
                "not a no-op 200: that would tell the client its request was applied when "
                + "nothing happened. And its own code, because the reaction is to refetch quietly "
                + "— the user double-clicked and did nothing wrong");
    }

    /// <summary>AC-8, BR-1.5. Closed is terminal from every direction.</summary>
    [Theory]
    [InlineData(TicketStatus.New)]
    [InlineData(TicketStatus.Open)]
    [InlineData(TicketStatus.InProgress)]
    [InlineData(TicketStatus.PendingCustomer)]
    [InlineData(TicketStatus.Resolved)]
    public void No_transition_out_of_closed_is_accepted(TicketStatus target)
    {
        var ticket = At(TicketStatus.Closed);

        var act = () => ticket.ChangeStatus(target, Now);

        act.Should().Throw<TicketClosedException>();
        ticket.Status.Should().Be(TicketStatus.Closed);
    }

    /// <summary>
    /// **The ordering decision.** `Closed → Closed` is `ticket-closed`, not
    /// `same-status-transition`.
    /// </summary>
    /// <remarks>
    /// Two rules match and the contract fixes which answer wins. "This ticket is finished" is
    /// more useful than "you sent the value it already has", and no amount of reloading changes
    /// it. Get the order backwards and a client is told to refetch a ticket that will never move.
    /// </remarks>
    [Fact]
    public void Closed_to_closed_reports_the_terminal_state_not_the_same_status()
    {
        var ticket = At(TicketStatus.Closed);

        var act = () => ticket.ChangeStatus(TicketStatus.Closed, Now);

        act.Should().Throw<TicketClosedException>(
            "step 5 runs before step 7 — the terminal check wins");
    }

    /// <summary>
    /// The other ordering decision: a forbidden **cell** reports the transition rule, not the
    /// assignee precondition.
    /// </summary>
    /// <remarks>
    /// `New → InProgress` is not in the matrix at all, and the ticket also has no assignee. Both
    /// rules match. Reporting `assignee-required` would send the client to assign someone, after
    /// which the transition would still be refused.
    /// </remarks>
    [Fact]
    public void A_cell_outside_the_matrix_reports_the_transition_rule_not_the_precondition()
    {
        var ticket = At(TicketStatus.New);

        var act = () => ticket.ChangeStatus(TicketStatus.InProgress, Now);

        act.Should().Throw<InvalidStatusTransitionException>(
            "step 8 before step 9. Assigning someone would not make New -> InProgress legal");
    }

    /// <summary>AC-5, BR-1.2.</summary>
    [Theory]
    [InlineData(TicketStatus.New)]
    [InlineData(TicketStatus.Open)]
    public void Closing_unworked_work_without_a_note_is_a_field_error(TicketStatus from)
    {
        var ticket = At(from);

        var act = () => ticket.ChangeStatus(TicketStatus.Closed, Now);

        var thrown = act.Should().Throw<NoteRequiredException>().Which;

        thrown.ErrorCode.Should().Be(DomainErrorCodes.Validation, "a 400, not a 409");
        thrown.FieldErrors.Should().ContainKey("note",
            "so a form highlights the field the user has to fill rather than showing a banner");
        ticket.Status.Should().Be(from);
    }

    /// <summary>AC-6, AC-10.</summary>
    [Fact]
    public void Closing_with_a_note_succeeds_stores_the_note_and_sets_closed_at()
    {
        var ticket = At(TicketStatus.Open);

        var history = ticket.ChangeStatus(TicketStatus.Closed, Now, "Duplicate of TCK-2026-000041.");

        ticket.Status.Should().Be(TicketStatus.Closed);
        ticket.ClosedAtUtc.Should().Be(Now, "BR-1.7");
        history.Note.Should().Be("Duplicate of TCK-2026-000041.");
    }

    /// <summary>`spec.md` Q-1. Resolved is the normal end of the flow.</summary>
    [Fact]
    public void Closing_from_resolved_needs_no_note()
    {
        var ticket = At(TicketStatus.Resolved, assigned: true);

        ticket.ChangeStatus(TicketStatus.Closed, Now);

        ticket.Status.Should().Be(TicketStatus.Closed);
        ticket.ClosedAtUtc.Should().Be(Now);
    }

    /// <summary>Edge case: a volunteered note is kept.</summary>
    [Fact]
    public void A_note_on_a_transition_that_does_not_require_one_is_still_stored()
    {
        var ticket = At(TicketStatus.New);

        var history = ticket.ChangeStatus(TicketStatus.Open, Now, "Triaged by the morning shift.");

        history.Note.Should().Be("Triaged by the morning shift.",
            "discarding it because the rule did not demand it would lose the one thing a reader "
            + "of the timeline wants");
    }

    /// <summary>AC-9, BR-1.6. Resolved work can be reopened into progress.</summary>
    [Fact]
    public void Resolved_can_return_to_in_progress()
    {
        var ticket = At(TicketStatus.Resolved, assigned: true);

        ticket.ChangeStatus(TicketStatus.InProgress, Now);

        ticket.Status.Should().Be(TicketStatus.InProgress);
    }

    /// <summary>
    /// A transition never stamps <c>UpdatedAtUtc</c>. `SaveChangesAsync` does.
    /// </summary>
    [Fact]
    public void A_transition_does_not_touch_the_updated_stamp()
    {
        var ticket = At(TicketStatus.New);

        ticket.ChangeStatus(TicketStatus.Open, Now);

        ticket.UpdatedAtUtc.Should().Be(default,
            "the stamps belong to the DbContext (IAuditableEntity). ClosedAtUtc is different — "
            + "it is a fact about the ticket, not about the row, which is why ChangeStatus sets it");
    }

    /// <summary>
    /// A whitespace-only note does not satisfy BR-1.2, and is not stored as an empty string.
    /// </summary>
    [Fact]
    public void A_whitespace_note_neither_satisfies_the_rule_nor_is_stored()
    {
        var refused = () => At(TicketStatus.Open).ChangeStatus(TicketStatus.Closed, Now, "   ");
        refused.Should().Throw<NoteRequiredException>();

        var history = At(TicketStatus.New).ChangeStatus(TicketStatus.Open, Now, "   ");
        history.Note.Should().BeNull("an empty note is absent, not blank");
    }
}
