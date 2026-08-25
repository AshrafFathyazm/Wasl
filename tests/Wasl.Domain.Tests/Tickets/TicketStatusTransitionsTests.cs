using FluentAssertions;
using Wasl.Domain.Tickets;

namespace Wasl.Domain.Tests.Tickets;

/// <summary>
/// BR-1, all 36 cells, both assignee states. Moved here from `012` because `009` returns
/// <c>allowedTransitions</c> and a rules table half of which is verified is not a rules table.
/// </summary>
/// <remarks>
/// <para>
/// The expectation is written as a table, transcribed from `CLAUDE.md` and BR-1 — not derived
/// from the implementation. A test that computes its expectation the way the code does asserts
/// only that the code is self-consistent.
/// </para>
/// <para>
/// <b>Every cell is asserted, including the 22 that are forbidden.</b> The permitted ones are
/// the cheap half: a map that allows too much is caught the first time someone presses a
/// button, while a map that forbids too much presents as a missing feature nobody reports.
/// </para>
/// </remarks>
public sealed class TicketStatusTransitionsTests
{
    /// <summary>
    /// The BR-1 matrix as `CLAUDE.md` states it, before the conditions.
    /// </summary>
    /// <remarks>
    /// | From ↓ / To → | New | Open | InProgress | PendingCustomer | Resolved | Closed |
    /// | New             | –   | yes | no  | no  | no  | yes |
    /// | Open            | no  | –   | yes | no  | no  | yes |
    /// | InProgress      | no  | yes | –   | yes | yes | no  |
    /// | PendingCustomer | no  | no  | yes | –   | no  | no  |
    /// | Resolved        | no  | no  | yes | no  | –   | yes |
    /// | Closed          | no  | no  | no  | no  | no  | –   |
    /// </remarks>
    private static readonly Dictionary<TicketStatus, TicketStatus[]> Expected = new()
    {
        [TicketStatus.New] = [TicketStatus.Open, TicketStatus.Closed],
        [TicketStatus.Open] = [TicketStatus.InProgress, TicketStatus.Closed],
        [TicketStatus.InProgress] = [TicketStatus.Open, TicketStatus.PendingCustomer, TicketStatus.Resolved],
        [TicketStatus.PendingCustomer] = [TicketStatus.InProgress],
        [TicketStatus.Resolved] = [TicketStatus.InProgress, TicketStatus.Closed],
        [TicketStatus.Closed] = [],
    };

    public static TheoryData<TicketStatus, TicketStatus> AllCells()
    {
        var cells = new TheoryData<TicketStatus, TicketStatus>();

        foreach (var from in TicketStatusTransitions.All)
        {
            foreach (var to in TicketStatusTransitions.All)
            {
                cells.Add(from, to);
            }
        }

        return cells;
    }

    /// <summary>
    /// All 36 cells, for a ticket <b>with</b> an assignee — where the raw matrix applies in full.
    /// </summary>
    [Theory]
    [MemberData(nameof(AllCells))]
    public void Every_cell_of_the_matrix_holds_for_an_assigned_ticket(TicketStatus from, TicketStatus to)
    {
        var permitted = TicketStatusTransitions.IsPermitted(from, to, hasAssignee: true);

        permitted.Should().Be(Expected[from].Contains(to),
            $"BR-1 says {from} -> {to} is {(Expected[from].Contains(to) ? "permitted" : "forbidden")} "
            + "for a ticket that has an assignee");
    }

    /// <summary>
    /// All 36 cells again, <b>without</b> an assignee. Three answers change.
    /// </summary>
    /// <remarks>
    /// This is the theory that would have been missing had the map shipped without its
    /// conditions: <c>InProgress</c> requires an assignee, so every cell targeting it flips to
    /// forbidden. The defect it prevents is a rendered button that returns `409`.
    /// </remarks>
    [Theory]
    [MemberData(nameof(AllCells))]
    public void Every_cell_of_the_matrix_holds_for_an_unassigned_ticket(TicketStatus from, TicketStatus to)
    {
        var permitted = TicketStatusTransitions.IsPermitted(from, to, hasAssignee: false);

        var expected = Expected[from].Contains(to) && to is not TicketStatus.InProgress;

        permitted.Should().Be(expected,
            "InProgress requires an assignee (BR-1), so an unassigned ticket can never move "
            + "into it however the raw matrix reads");
    }

    /// <summary>
    /// The diagonal. A same-status transition is a `409`, not a no-op `200`.
    /// </summary>
    [Theory]
    [InlineData(TicketStatus.New)]
    [InlineData(TicketStatus.Open)]
    [InlineData(TicketStatus.InProgress)]
    [InlineData(TicketStatus.PendingCustomer)]
    [InlineData(TicketStatus.Resolved)]
    [InlineData(TicketStatus.Closed)]
    public void A_status_never_permits_itself(TicketStatus status)
    {
        TicketStatusTransitions.IsPermitted(status, status, hasAssignee: true).Should().BeFalse();
        TicketStatusTransitions.AllowedFrom(status, hasAssignee: true).Should().NotContain(status,
            "a same-status transition must never appear in allowedTransitions, or the client "
            + "renders a button whose only outcome is 409");
    }

    /// <summary>BR-1.5. Closed is terminal — no reopen, by any route.</summary>
    [Fact]
    public void Closed_is_terminal_for_both_assignee_states()
    {
        TicketStatusTransitions.AllowedFrom(TicketStatus.Closed, hasAssignee: true).Should().BeEmpty();
        TicketStatusTransitions.AllowedFrom(TicketStatus.Closed, hasAssignee: false).Should().BeEmpty(
            "BR-1.5. An assignee does not make a closed ticket reopenable");
    }

    /// <summary>
    /// BR-1: `PendingCustomer` cannot go straight to `Resolved`. Named because it is the one
    /// forbidden transition a reader is most likely to assume is allowed.
    /// </summary>
    [Fact]
    public void PendingCustomer_cannot_resolve_directly()
    {
        TicketStatusTransitions.IsPermitted(
            TicketStatus.PendingCustomer, TicketStatus.Resolved, hasAssignee: true)
            .Should().BeFalse("the work has to resume before it can be finished");
    }

    /// <summary>
    /// The exact case decision 2 was about: `Open` with nobody assigned.
    /// </summary>
    [Fact]
    public void An_unassigned_open_ticket_offers_only_close()
    {
        TicketStatusTransitions.AllowedFrom(TicketStatus.Open, hasAssignee: false)
            .Should().Equal([TicketStatus.Closed],
                "InProgress needs an assignee. A caller reading the raw matrix would offer it, "
                + "and this is the assertion that says why AllowedFrom takes the parameter");
    }

    /// <summary>AC-10. What `009`'s create response must contain.</summary>
    [Fact]
    public void A_new_ticket_offers_open_and_closed_in_that_order()
    {
        TicketStatusTransitions.AllowedFrom(TicketStatus.New, hasAssignee: false)
            .Should().Equal([TicketStatus.Open, TicketStatus.Closed],
                "AC-10, and the order is asserted so the contract's example stays byte-accurate");
    }

    /// <summary>
    /// The count, as a guard against the matrix silently losing a row.
    /// </summary>
    /// <remarks>
    /// Six statuses, so 36 cells. If someone adds a seventh status, the theories above still
    /// pass — they iterate whatever exists — while `Expected` would throw on the missing key.
    /// This asserts the shape rather than relying on that.
    /// </remarks>
    [Fact]
    public void The_matrix_covers_every_status_exactly_once()
    {
        TicketStatusTransitions.All.Should().HaveCount(6);
        Expected.Keys.Should().BeEquivalentTo(TicketStatusTransitions.All,
            "a status with no row in the map would throw at runtime the first time a ticket "
            + "reached it, in whichever feature happened to get there first");
    }
}
