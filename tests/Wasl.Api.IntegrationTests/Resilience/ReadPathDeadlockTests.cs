using System.Collections.Concurrent;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Api.IntegrationTests.Audit.Probe;
using Wasl.Domain.Audit;
using Wasl.Domain.Common.Exceptions;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Resilience;

/// <summary>
/// `036b` — a deadlock whose victim is a <c>SELECT</c>. AC-1 to AC-5.
/// </summary>
/// <remarks>
/// <para>
/// <b>Driven through the real MediatR pipeline, not over HTTP.</b> What is under test is a
/// pipeline behaviour, and the two halves of a deadlock have to be coordinated by a barrier they
/// share — which two HTTP requests cannot do without a probe endpoint that exists only to hold
/// one. Sending through <c>ISender</c> from two scopes runs
/// <c>TransientFailure → Validation → Transaction → Audit</c> exactly as a request does.
/// </para>
/// <para>
/// Every assertion is scoped to customers this class created. The suite shares one database.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class ReadPathDeadlockTests(WaslApiFactory factory)
{
    /// <summary>
    /// Runs two probes in opposite order and returns whatever each one threw.
    /// </summary>
    private async Task<ConcurrentBag<Exception>> ContendAsync(Guid first, Guid second)
    {
        var failures = new ConcurrentBag<Exception>();

        using var barrier = new Barrier(2);
        ReadDeadlockProbeHandler.BothHoldOne = barrier;

        try
        {
            async Task Send(Guid mine, Guid theirs)
            {
                using var scope = factory.Services.CreateScope();
                var sender = scope.ServiceProvider.GetRequiredService<ISender>();

                try
                {
                    await sender.Send(new ReadDeadlockProbeCommand(mine, theirs));
                }
                catch (Exception exception)
                {
                    failures.Add(exception);
                }
            }

            await Task.WhenAll(Send(first, second), Send(second, first));
        }
        finally
        {
            // Always cleared. A barrier left behind would block the next run of this class rather
            // than fail it, which is the worst way for a test to break.
            ReadDeadlockProbeHandler.BothHoldOne = null;
        }

        return failures;
    }

    // ---- AC-1 -------------------------------------------------------------------------------

    /// <summary>
    /// The victim of a read-side deadlock is a <c>TransientConflictException</c>, not a `500`.
    /// </summary>
    /// <remarks>
    /// <b>Before `036b` this was an unmapped exception.</b> `036` translates at
    /// <c>SaveChangesAsync</c>, and this deadlock is resolved on the <c>SELECT</c> that follows
    /// it — so the same engine condition produced `503` or `500` depending on which statement the
    /// engine chose to kill.
    /// </remarks>
    [Fact]
    public async Task A_deadlock_resolved_on_a_read_is_a_transient_conflict()
    {
        var first = await AuditFixture.SeedCustomerAsync(factory);
        var second = await AuditFixture.SeedCustomerAsync(factory);

        var failures = await ContendAsync(first, second);

        // If nothing was refused there was no deadlock and this test proved nothing. Said out
        // loud — a green run on a race that never happened is the worst outcome available.
        failures.Should().NotBeEmpty("the two probes must actually deadlock");

        failures.Should().ContainItemsAssignableTo<TransientConflictException>();
    }

    // ---- AC-2 and AC-3 ----------------------------------------------------------------------

    /// <summary>
    /// It is the same exception `036`'s write-path deadlock produces, carrying the same wait.
    /// </summary>
    /// <remarks>
    /// <b>The client must not be able to tell which statement lost.</b> Two `503`s that differ in
    /// <c>Retry-After</c> or in message key would make the engine's private choice observable —
    /// and a client cannot act on it, because it cannot influence which statement the engine
    /// kills.
    /// </remarks>
    [Fact]
    public async Task The_read_side_refusal_carries_the_same_code_and_retry_hint_as_the_write_side()
    {
        var first = await AuditFixture.SeedCustomerAsync(factory);
        var second = await AuditFixture.SeedCustomerAsync(factory);

        var failures = await ContendAsync(first, second);

        var victim = failures.OfType<TransientConflictException>().FirstOrDefault();
        victim.Should().NotBeNull("the two probes must actually deadlock");

        victim!.ErrorCode.Should().Be(DomainErrorCodes.TransientConflict);
        victim.MessageKey.Should().Be("Error.TransientConflict");

        // AC-3. Never zero — a Retry-After of 0 invites the immediate retry the hint exists to
        // prevent (`004b`'s rule, inherited through IRetryAfterHint).
        victim.RetryAfterSeconds.Should().BeGreaterThanOrEqualTo(1);
    }

    // ---- AC-5 · THE GUARD ON WHERE THE BEHAVIOUR IS REGISTERED -------------------------------

    /// <summary>
    /// BR-9 is unchanged: the failure row records what <c>AuditBehaviour</c> classified.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This was written as a guard on the behaviour's PLACEMENT, and measurement disproved
    /// that.</b> The claim was that registering <c>TransientFailureBehaviour</c> inside
    /// <c>AuditBehaviour</c> would make BR-9's failure row record <c>transient-conflict</c>
    /// instead of the fault. The control was run — this behaviour moved to innermost — and this
    /// test **stayed green**, because <c>AuditOutcomeClassifier</c> maps any non-denial
    /// <c>DomainException</c> to <c>Failed</c> exactly as it maps the raw engine exception.
    /// </para>
    /// <para>
    /// <b>It is kept, because what it actually asserts is worth asserting:</b> a new outermost
    /// behaviour must not swallow a failure, skip the audit path, or change BR-9's outcome. That
    /// is a real regression guard on a real risk. It is simply not the placement guard the
    /// comment claimed — and `036b` `tests.md` §4.2 records that no such guard exists.
    /// </para>
    /// <para>
    /// Scoped to this class's action name, never a <c>COUNT</c> over <c>dbo.AuditLog</c> — the
    /// suite shares one database and a whole-table count is right today and wrong depending on
    /// which tests ran first.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task The_deadlocked_command_still_writes_its_failure_audit_row()
    {
        var first = await AuditFixture.SeedCustomerAsync(factory);
        var second = await AuditFixture.SeedCustomerAsync(factory);

        var failures = await ContendAsync(first, second);
        failures.Should().NotBeEmpty("the two probes must actually deadlock");

        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var rows = await context.Set<AuditEntry>()
            .Where(entry => entry.Action == "Customer.ProbeReadDeadlock"
                && (entry.EntityId == first || entry.EntityId == second))
            .ToListAsync();

        // BR-9.4: the failure row is written on a second connection, so it survives the rollback
        // of the transaction it describes. That is `003`'s behaviour and `036b` must not change it.
        rows.Should().NotBeEmpty("a deadlocked command is still an audited command");

        rows.Should().Contain(entry => entry.Outcome == AuditOutcome.Failed,
            "AuditBehaviour classifies the RAW engine failure, because TransientFailureBehaviour "
            + "is registered outside it. Registered inside, the row would describe the "
            + "translation instead of the fault");
    }
}
