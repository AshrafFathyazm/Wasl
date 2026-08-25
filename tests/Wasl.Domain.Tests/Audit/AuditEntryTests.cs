using System.Reflection;
using FluentAssertions;
using Wasl.Domain.Audit;

namespace Wasl.Domain.Tests.Audit;

/// <summary>
/// The factory's invariants, and the absences AC-5 asserts.
/// </summary>
public sealed class AuditEntryTests
{
    private static AuditEntry Valid(string? userAgent = null) => AuditEntry.For(
        occurredAtUtc: new DateTime(2026, 8, 25, 9, 30, 0, DateTimeKind.Utc),
        action: "Customer.Created",
        outcome: AuditOutcome.Success,
        traceId: "00-4f132d7d6f1af9c93ea8e4c53e419599-135b23b6dd6dcf76-00",
        userAgent: userAgent);

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void An_action_is_required(string? action)
    {
        var act = () => AuditEntry.For(
            DateTime.UnixEpoch, action!, AuditOutcome.Success, "trace-1");

        act.Should().Throw<ArgumentException>(
            "a row whose Action is empty cannot be read by anyone. The column is NOT NULL "
            + "and the factory is where that becomes a C# guarantee too");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void A_trace_id_is_required(string? traceId)
    {
        var act = () => AuditEntry.For(
            DateTime.UnixEpoch, "Customer.Created", AuditOutcome.Success, traceId!);

        act.Should().Throw<ArgumentException>(
            "BR-9.9. A row that cannot be correlated with a response and a log line is a row "
            + "nobody can act on — better to fail the write loudly than to store an empty string");
    }

    /// <summary>
    /// AC edge case: truncated, never thrown.
    /// </summary>
    [Fact]
    public void An_over_long_user_agent_is_truncated_rather_than_rejected()
    {
        var entry = Valid(userAgent: new string('x', 500));

        entry.UserAgent.Should().HaveLength(AuditEntry.UserAgentMaxLength,
            "an audit write that throws on its own input fails the mutation it exists to "
            + "record — and the header length is the client's choice, not ours");
    }

    [Fact]
    public void A_user_agent_at_the_limit_is_kept_whole()
    {
        var exact = new string('x', AuditEntry.UserAgentMaxLength);

        Valid(userAgent: exact).UserAgent.Should().Be(exact,
            "an off-by-one here silently shortens every long user agent by a character");
    }

    [Fact]
    public void A_null_user_agent_stays_null()
    {
        Valid().UserAgent.Should().BeNull("absent is not the same as empty");
    }

    [Fact]
    public void The_target_is_copied_onto_the_row()
    {
        var id = Guid.NewGuid();

        var entry = AuditEntry.For(
            DateTime.UnixEpoch, "Ticket.StatusChanged", AuditOutcome.Success, "trace-1",
            target: new AuditTarget("Ticket", id, "TCK-2026-000042"));

        entry.EntityType.Should().Be("Ticket");
        entry.EntityId.Should().Be(id);
        entry.EntityLabel.Should().Be("TCK-2026-000042");
    }

    [Fact]
    public void An_absent_target_leaves_all_three_columns_null()
    {
        var entry = Valid();

        entry.EntityType.Should().BeNull();
        entry.EntityId.Should().BeNull();
        entry.EntityLabel.Should().BeNull(
            "BR-9.2's auth events have no entity, which is why the columns are nullable");
    }

    [Fact]
    public void An_anonymous_write_is_legal()
    {
        var entry = Valid();

        entry.ActorUserId.Should().BeNull();
        entry.ActorEmail.Should().BeNull();
        entry.ActorRole.Should().BeNull(
            "every row written before 004 lands is anonymous, and that is the designed shape "
            + "rather than a gap waiting to be filled");
    }

    /// <summary>
    /// AC-5, first half. Asserted by reflection because the point is that the property does
    /// not exist — there is nothing to read.
    /// </summary>
    [Fact]
    public void The_entity_has_no_concurrency_token_and_no_updated_timestamp()
    {
        var names = typeof(AuditEntry)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(property => property.Name)
            .ToArray();

        names.Should().NotContain("RowVersion",
            "append-only: there is no second writer to conflict with (research.md R-10)");
        names.Should().NotContain("UpdatedAtUtc",
            "nothing updates a row, and a column for it would be an invitation");
    }

    /// <summary>
    /// AC-5, second half. Immutability is the first line behind `003b`'s DENY.
    /// </summary>
    [Fact]
    public void No_property_can_be_set_from_outside_the_entity()
    {
        var settable = typeof(AuditEntry)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(property => property.SetMethod is { IsPublic: true })
            .Select(property => property.Name)
            .ToArray();

        settable.Should().BeEmpty(
            "EF Core cannot update what the code cannot change. Until 003b adds DENY, this is "
            + "the only thing making the table append-only");
    }

    [Fact]
    public void There_is_no_public_constructor()
    {
        typeof(AuditEntry)
            .GetConstructors(BindingFlags.Public | BindingFlags.Instance)
            .Should().BeEmpty("AuditEntry.For is the only way in");
    }
}
