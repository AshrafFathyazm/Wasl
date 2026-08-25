using FluentAssertions;
using Wasl.Application.Common.Messaging;
using Wasl.Domain.Audit;

namespace Wasl.Application.Tests.Architecture;

/// <summary>
/// AC-14. <b>Two tests, and at this phase the second one is the load-bearing one.</b>
/// </summary>
/// <remarks>
/// <para>
/// The rule test has an empty population today — `001` ships <c>/health</c>, `002` ships error
/// mapping, and the first production command is `004`'s sign-in. So it passes by iterating
/// nothing, and would keep passing if the scanner looked at the wrong assembly, the wrong
/// interface, or missed generic variants. That is discovered at `007` or later, when the
/// retrofit this feature exists to prevent is already needed.
/// </para>
/// <para>
/// `002` shipped a guard that was a <b>false negative</b> until someone tried to break it. This
/// is the same lesson applied before rather than after.
/// </para>
/// </remarks>
public sealed class CommandsAreAuditableTests
{
    /// <summary>
    /// AC-14a — the rule. Population is 0 today, 1+ from `004`.
    /// </summary>
    [Fact]
    public void Every_command_in_the_application_layer_declares_an_audit_action()
    {
        var offenders = CommandAuditScanner.FindUnauditableCommands(
            typeof(ICommand).Assembly);

        offenders.Should().BeEmpty(
            "NFR-10: an audit gap is a build failure, not a review finding. A command that "
            + "changes state without declaring an action produces a row nobody can interpret — "
            + "or no row at all");
    }

    /// <summary>
    /// AC-14b — the scanner. Without this, AC-14a proves nothing at Phase 0.
    /// </summary>
    [Fact]
    public void The_scanner_reports_a_command_that_does_not_declare_an_audit_action()
    {
        var offenders = CommandAuditScanner.FindUnauditableCommands(
            typeof(DeliberatelyUnauditableCommand).Assembly);

        offenders.Should().Contain(typeof(DeliberatelyUnauditableCommand),
            "this is the test that proves the rule test above can fail at all. If the scanner "
            + "cannot see a violator sitting in front of it, an empty result from the real "
            + "assembly means nothing");
    }

    /// <summary>
    /// The other half of the self-test: the scanner must not report a compliant command.
    /// </summary>
    /// <remarks>
    /// A scanner that reported everything would pass the test above and fail the build on every
    /// real command from `004` onward. Both directions, or neither is verified.
    /// </remarks>
    [Fact]
    public void The_scanner_does_not_report_a_command_that_does_declare_one()
    {
        var offenders = CommandAuditScanner.FindUnauditableCommands(
            typeof(DeliberatelyAuditableCommand).Assembly);

        offenders.Should().NotContain(typeof(DeliberatelyAuditableCommand),
            "a scanner that flags compliant commands is a scanner that gets disabled");
    }

    /// <summary>
    /// Implements <see cref="ICommand"/> and nothing else. Exists only to be found.
    /// </summary>
    private sealed class DeliberatelyUnauditableCommand : ICommand;

    /// <summary>
    /// The compliant shape, for the negative case.
    /// </summary>
    private sealed class DeliberatelyAuditableCommand : IAuditableCommand<string>
    {
        public string AuditAction => "Probe.Compliant";

        public AuditTarget DescribeTarget(string? response) => AuditTarget.None;
    }
}
