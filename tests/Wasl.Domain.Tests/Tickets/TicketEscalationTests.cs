using FluentAssertions;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Domain.Tests.Tickets;

/// <summary>
/// <c>Ticket.Escalate</c> — BR-3.3, BR-3.4, BR-3.6, BR-3.7 and BR-3.8's rows. `016`.
/// </summary>
/// <remarks>
/// <para>
/// No database and no HTTP. <b>BR-3.2 is absent from these tests because it is absent from the
/// entity</b> — it needs the caller's role, which the ticket does not know and must not learn.
/// The endpoint's <c>ManagerOnly</c> policy owns it and the integration suite asserts it.
/// </para>
/// <para>
/// <b>BR-3.6 is the reason this feature is its own story, and TEST-016-02 is the named test for
/// it.</b> An escalation that writes <c>Priority = High</c> instead of raising to a floor of
/// <c>High</c> silently DOWNGRADES a <c>Critical</c> ticket: the request succeeds, nothing is
/// logged, and the ticket that most needed attention becomes less visible <i>because</i> somebody
/// escalated it. <c>docs/sdd/testing/test-strategy.md</c> names it the rule most likely to be
/// implemented wrongly.
/// </para>
/// </remarks>
public sealed class TicketEscalationTests
{
    private static readonly DateTime Now = new(2026, 9, 8, 10, 0, 0, DateTimeKind.Utc);

    private static readonly Guid Manager = Guid.CreateVersion7();

    private static Ticket New(TicketPriority priority = TicketPriority.Normal) => Ticket.Create(
        customerId: Guid.CreateVersion7(),
        ticketNumber: "TCK-2026-000001",
        subject: "Escalation",
        description: "A ticket to escalate.",
        category: TicketCategory.Technical,
        channel: CommunicationChannel.Email,
        priority: priority);

    /// <summary>
    /// Walks BR-1 to <paramref name="target"/> the way a real caller would.
    /// </summary>
    /// <remarks>
    /// <b>Never sets <c>Status</c> by reflection.</b> `CLAUDE.md` records three defects that came
    /// from writing an entity from outside its real path — a ticket forced into <c>Resolved</c>
    /// without an assignee would be a state BR-1.3 makes unreachable, and a test asserting a
    /// refusal against an impossible state proves nothing about the product.
    /// </remarks>
    private static Ticket At(TicketStatus target, TicketPriority priority = TicketPriority.Normal)
    {
        var ticket = New(priority);

        ticket.ChangeStatus(TicketStatus.Open, Now);
        ticket.Assign(Guid.CreateVersion7(), Now);
        ticket.ChangeStatus(TicketStatus.InProgress, Now);

        if (target is TicketStatus.InProgress)
        {
            return ticket;
        }

        ticket.ChangeStatus(TicketStatus.Resolved, Now);

        if (target is TicketStatus.Closed)
        {
            ticket.ChangeStatus(TicketStatus.Closed, Now);
        }

        ticket.Status.Should().Be(target, "the walk must actually arrive where the test asked");

        return ticket;
    }

    // ── BR-3.7 — every field set ────────────────────────────────────────────────

    [Fact]
    public void Escalating_sets_all_four_fields()
    {
        var ticket = New();

        ticket.Escalate("Customer threatened to cancel.", Manager, Now);

        ticket.IsEscalated.Should().BeTrue();
        ticket.EscalatedAtUtc.Should().Be(Now);
        ticket.EscalatedByUserId.Should().Be(Manager);
        ticket.EscalationReason.Should().Be("Customer threatened to cancel.");
    }

    [Fact]
    public void The_reason_is_trimmed_and_otherwise_stored_verbatim()
    {
        var ticket = New();

        ticket.Escalate("  العميل غاضب جدًا  ", Manager, Now);

        ticket.EscalationReason.Should().Be(
            "العميل غاضب جدًا",
            "the reason is the manager's own words — trimmed, never normalised, never translated");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\r\n")]
    public void An_empty_or_whitespace_reason_is_refused(string reason)
    {
        var ticket = New();

        var escalate = () => ticket.Escalate(reason, Manager, Now);

        escalate.Should().Throw<ArgumentException>(
            "the entity refuses it as well as the validator. The validator produces the readable "
            + "`400`; this is what stops a second caller reaching the same field with nothing in "
            + "it, and the reason column is the only record of WHY a ticket was escalated");

        ticket.IsEscalated.Should().BeFalse("a refused escalation must leave nothing behind");
    }

    // ── BR-3.6 — a FLOOR, not an assignment ─────────────────────────────────────

    /// <summary>TEST-016-02. The one test the task list calls not droppable.</summary>
    [Fact]
    public void Escalate_WhenPriorityIsCritical_LeavesPriorityUnchanged()
    {
        var ticket = New(TicketPriority.Critical);

        var history = ticket.Escalate("Data loss reported.", Manager, Now);

        ticket.Priority.Should().Be(
            TicketPriority.Critical,
            "BR-3.6 is a floor. `Priority = High` here would DOWNGRADE the most urgent ticket in "
            + "the system, succeed, and log nothing");

        history.Should().ContainSingle(
            "and no PriorityChanged row either — a history row saying Critical → High would be a "
            + "false record of a change that did not happen, which is worse than a missing one");
    }

    [Theory]
    [InlineData(TicketPriority.Low)]
    [InlineData(TicketPriority.Normal)]
    public void A_priority_below_the_floor_is_raised_to_it(TicketPriority starting)
    {
        var ticket = New(starting);

        var history = ticket.Escalate("Third time this week.", Manager, Now);

        ticket.Priority.Should().Be(TicketPriority.High);

        var row = history.Should()
            .HaveCount(2, "the Escalated row and the PriorityChanged row")
            .And.Subject.Single(entry => entry.EventType == TicketHistoryEventType.PriorityChanged);

        row.OldValue.Should().Be(starting.ToString());
        row.NewValue.Should().Be(nameof(TicketPriority.High));
        row.PerformedByUserId.Should().Be(Manager);
        row.PerformedAtUtc.Should().Be(Now);
    }

    [Fact]
    public void A_priority_already_at_the_floor_is_left_alone()
    {
        var ticket = New(TicketPriority.High);

        var history = ticket.Escalate("Escalating for visibility.", Manager, Now);

        ticket.Priority.Should().Be(TicketPriority.High);
        history.Should().ContainSingle(
            "High is not below the floor, so nothing moved and there is nothing to record");
    }

    /// <summary>
    /// TEST-016-03. The rank order, asserted against separately written literals.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This is what makes the floor's implementation safe to write as a comparison.</b>
    /// <c>Ticket.Escalate</c> uses <c>Priority &lt; EscalationPriorityFloor</c> rather than an
    /// explicit rank map — <c>tasks.md</c> BE-016-02 asked for the map, and the deviation is
    /// recorded in `summary.md` — which is correct only while <c>TicketPriority</c> is declared
    /// in ascending order of urgency.
    /// </para>
    /// <para>
    /// Reordering the enum would therefore change a business rule with a green build, and the
    /// declaration is not somewhere anyone would think to look. The numbers below are written out
    /// rather than read from the enum, because <c>((int)TicketPriority.Low).Should().Be(
    /// (int)TicketPriority.Low)</c> is a tautology that passes after any reorder.
    /// </para>
    /// <para>
    /// The ordinals are also safe to pin because `009` stores this column as a STRING
    /// (<c>HasConversion&lt;string&gt;()</c>). If it were an <c>int</c> these values would be
    /// load-bearing for every existing row and this test would be asserting a storage format
    /// instead of a rule.
    /// </para>
    /// </remarks>
    [Theory]
    [InlineData(TicketPriority.Low, 0)]
    [InlineData(TicketPriority.Normal, 1)]
    [InlineData(TicketPriority.High, 2)]
    [InlineData(TicketPriority.Critical, 3)]
    public void The_priority_rank_is_ascending_by_urgency(TicketPriority priority, int expectedRank)
    {
        ((int)priority).Should().Be(
            expectedRank,
            "BR-3.6's floor is a `<` comparison against TicketPriority.High. Reorder this enum "
            + "and escalation starts downgrading tickets, or stops raising them, with nothing red");
    }

    [Fact]
    public void The_floor_is_High()
    {
        Ticket.EscalationPriorityFloor.Should().Be(
            TicketPriority.High,
            "BR-3.6 names High. Critical as the floor would make every escalation the most urgent "
            + "thing in the system, which is the same as having no priority at all");
    }

    // ── BR-3.8 — the history rows ───────────────────────────────────────────────

    [Fact]
    public void The_escalated_row_carries_the_reason_and_no_values()
    {
        var ticket = New(TicketPriority.High);

        var history = ticket.Escalate("Breached the response window.", Manager, Now);

        var row = history.Single();

        row.TicketId.Should().Be(ticket.Id);
        row.EventType.Should().Be(TicketHistoryEventType.Escalated);
        row.Note.Should().Be("Breached the response window.");
        row.OldValue.Should().BeNull("escalation is one-way (BR-3.9), so there is no previous value");
        row.NewValue.Should().BeNull();
        row.PerformedByUserId.Should().Be(
            Manager,
            "`011` found PerformedByUserId NULL on every history row ever written, and the "
            + "timeline would have said \"someone\" for every event");
        row.PerformedAtUtc.Should().Be(Now);
    }

    /// <summary>
    /// The returned LIST is cause then consequence.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This is a statement about the list, and the first version of it claimed something about
    /// the SCREEN that is false.</b> It said "the reader should see the cause above its
    /// consequence" — and the reader does not: `027`'s feed is labelled «الأحدث أولاً» and
    /// reverses each page, so with both rows sharing one instant `013`'s tie-break puts
    /// <c>PriorityChanged</c> ABOVE <c>Escalated</c>. Measured in a browser on 2026-09-08, on a
    /// real escalation of a `Low` ticket.
    /// </para>
    /// <para>
    /// The order here still matters and is still worth asserting — it is the order the rows are
    /// added to the change tracker, so it is the order their ids are minted in, which is what
    /// `013`'s tie-break sorts by when the timestamps tie. It just does not decide the reading
    /// order on its own, and a comment saying it does would send the next person to the wrong
    /// file when the feed looks wrong.
    /// </para>
    /// </remarks>
    [Fact]
    public void The_escalated_row_comes_before_the_priority_row_in_the_returned_list()
    {
        var ticket = New(TicketPriority.Low);

        var history = ticket.Escalate("Repeat failure.", Manager, Now);

        history.Select(entry => entry.EventType).Should().Equal(
            [TicketHistoryEventType.Escalated, TicketHistoryEventType.PriorityChanged],
            "the cause is added before the consequence, which fixes the id order the timeline's "
            + "tie-break falls back to when two rows share one instant");
    }

    [Fact]
    public void Both_rows_share_one_instant()
    {
        var ticket = New(TicketPriority.Normal);

        var history = ticket.Escalate("One request, one instant.", Manager, Now);

        history.Select(entry => entry.PerformedAtUtc).Distinct().Should().ContainSingle(
            "one IRequestTimestamp per request. Two instants here would put the priority change "
            + "before or after the escalation that caused it");
    }

    // ── BR-3.3 — not escalatable ────────────────────────────────────────────────

    [Theory]
    [InlineData(TicketStatus.Resolved)]
    [InlineData(TicketStatus.Closed)]
    public void A_resolved_or_closed_ticket_cannot_be_escalated(TicketStatus status)
    {
        var ticket = At(status);

        var escalate = () => ticket.Escalate("Too late.", Manager, Now);

        escalate.Should().Throw<TicketNotEscalatableException>()
            .Which.ErrorCode.Should().Be(
                "ticket-not-escalatable",
                "NOT `ticket-closed`. BR-3.3 refuses Resolved as well, and a manager told \"this "
                + "ticket is closed\" about a resolved one goes looking for the wrong thing");

        ticket.IsEscalated.Should().BeFalse();
        ticket.EscalationReason.Should().BeNull("a refused escalation writes nothing");
    }

    [Theory]
    [InlineData(TicketStatus.New)]
    [InlineData(TicketStatus.Open)]
    [InlineData(TicketStatus.InProgress)]
    public void Every_other_status_can_be_escalated(TicketStatus status)
    {
        var ticket = status switch
        {
            TicketStatus.New => New(),
            TicketStatus.Open => Open(),
            _ => At(TicketStatus.InProgress),
        };

        ticket.Status.Should().Be(status);
        ticket.IsEscalatable.Should().BeTrue();

        ticket.Escalate("Escalating.", Manager, Now);

        ticket.IsEscalated.Should().BeTrue();
    }

    /// <summary>
    /// <c>PendingCustomer</c> is escalatable, and it is worth its own test.
    /// </summary>
    /// <remarks>
    /// It reads like a state where nothing is owed — the ball is with the customer — so it is the
    /// status somebody would plausibly add to BR-3.3's refusal list. BR-3.3 names two statuses and
    /// this is not one of them: a customer who has stopped replying is a common reason to escalate.
    /// </remarks>
    [Fact]
    public void A_ticket_waiting_on_the_customer_can_be_escalated()
    {
        var ticket = At(TicketStatus.InProgress);
        ticket.ChangeStatus(TicketStatus.PendingCustomer, Now);

        ticket.IsEscalatable.Should().BeTrue();

        ticket.Escalate("No reply in two weeks.", Manager, Now);

        ticket.IsEscalated.Should().BeTrue();
    }

    // ── BR-3.4 — already escalated ──────────────────────────────────────────────

    [Fact]
    public void An_escalated_ticket_cannot_be_escalated_again()
    {
        var ticket = New();
        ticket.Escalate("First.", Manager, Now);

        var again = () => ticket.Escalate("Second.", Guid.CreateVersion7(), Now.AddHours(1));

        again.Should().Throw<TicketAlreadyEscalatedException>()
            .Which.ErrorCode.Should().Be("already-escalated");

        ticket.EscalationReason.Should().Be(
            "First.", "the first escalation's record is not overwritten by a refused second");
        ticket.EscalatedAtUtc.Should().Be(Now);
        ticket.EscalatedByUserId.Should().Be(Manager);
    }

    /// <summary>
    /// The refusal order, when both apply. AC-3 before AC-4.
    /// </summary>
    /// <remarks>
    /// <b>A closed AND escalated ticket answers `ticket-not-escalatable`</b>, per the frozen
    /// contract. Only a test on a ticket in both states can tell the two orderings apart — every
    /// other test passes either way, which is why this one exists rather than being covered by the
    /// two above.
    /// </remarks>
    [Fact]
    public void When_both_refusals_apply_the_status_one_wins()
    {
        var ticket = At(TicketStatus.InProgress);
        ticket.Escalate("Escalated while in progress.", Manager, Now);
        ticket.ChangeStatus(TicketStatus.Resolved, Now);
        ticket.ChangeStatus(TicketStatus.Closed, Now);

        ticket.IsEscalated.Should().BeTrue("the ticket really is in both states");
        ticket.Status.Should().Be(TicketStatus.Closed);

        var escalate = () => ticket.Escalate("Again.", Manager, Now);

        escalate.Should().Throw<TicketNotEscalatableException>(
            "the contract fixes BR-3.3 ahead of BR-3.4. A client branching on the first failure it "
            + "was shown gets a different answer on a retry if the order is not fixed");
    }

    // ── IsEscalatable, the read-shape half ──────────────────────────────────────

    [Fact]
    public void IsEscalatable_is_false_once_escalated_even_on_an_open_ticket()
    {
        var ticket = New();

        ticket.IsEscalatable.Should().BeTrue();

        ticket.Escalate("Done.", Manager, Now);

        ticket.IsEscalatable.Should().BeFalse(
            "which is what makes `canEscalate` false in the very response that reports the "
            + "success — the client never offers the action twice");
    }

    /// <summary>
    /// <c>IsEscalatable</c> knows nothing about roles, and that is deliberate.
    /// </summary>
    /// <remarks>
    /// BR-3.2's other half is the caller's, and the entity has no caller. Splitting it this way is
    /// what lets <c>canEscalate</c> be computed in one place from two independent facts, instead of
    /// the ticket growing a <c>CanBeEscalatedBy(user)</c> method that would need a role string it
    /// has no business holding.
    /// </remarks>
    [Fact]
    public void IsEscalatable_is_a_fact_about_the_ticket_only()
    {
        typeof(Ticket)
            .GetProperty(nameof(Ticket.IsEscalatable))!
            .GetMethod!
            .GetParameters()
            .Should().BeEmpty("a role parameter here would put BR-3.2 inside the entity");
    }

    private static Ticket Open()
    {
        var ticket = New();
        ticket.ChangeStatus(TicketStatus.Open, Now);

        return ticket;
    }
}
