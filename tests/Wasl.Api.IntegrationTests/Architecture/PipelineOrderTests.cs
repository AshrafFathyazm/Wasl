using FluentAssertions;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit.Probe;

namespace Wasl.Api.IntegrationTests.Architecture;

/// <summary>
/// AC-15. The behaviour order the container actually produces, not the one that was intended.
/// </summary>
/// <remarks>
/// <para>
/// <b>Resolved from the real host, deliberately.</b> A hand-built <c>ServiceCollection</c> would
/// assert the order of a registration written for the test — and would additionally throw
/// <c>"MediatR requires ILoggerFactory to be registered"</c>, an exception naming logging rather
/// than the thing under test (`research.md` R-3). Resolving through <c>WaslApiFactory</c> reads
/// the composed application.
/// </para>
/// <para>
/// <b>This test exists because the defect it guards was observed.</b> With each project
/// registering its own behaviour, the resolved order came back
/// <c>Transaction → Audit → Validation</c> — validation last, so a `400` would open a
/// transaction and write an audit row for every mistyped form, with nothing thrown
/// (`research.md` R-15).
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class PipelineOrderTests(WaslApiFactory factory)
{
    /// <summary>
    /// The sequence, for a command that satisfies every constraint.
    /// </summary>
    [Fact]
    public void The_resolved_behaviour_order_is_validation_then_transaction_then_audit()
    {
        using var scope = factory.Services.CreateScope();

        var names = scope.ServiceProvider
            .GetServices<IPipelineBehavior<SucceedingProbeCommand, ProbeResult>>()
            .Select(behaviour => behaviour.GetType().Name.Split('`')[0])
            .ToArray();

        names.Should().Equal(
            ["TransientFailureBehaviour", "ValidationBehaviour", "TransactionBehaviour", "AuditBehaviour"],
            "outermost first. TransientFailure before the audit, or a deadlock is translated "
            + "before BR-9 classifies it and the failure row records the wrong outcome; "
            + "validation before the transaction, or an invalid request opens one; the "
            + "transaction before the audit, or BR-9.3 inverts and the audit row commits "
            + "while the change rolls back");
    }

    /// <summary>
    /// The order test above compares against a literal. This one compares the literal against
    /// the declared list, so the two cannot drift apart.
    /// </summary>
    /// <remarks>
    /// Without this, someone reordering <c>WaslPipeline.DeclaredOrder</c> would see the first
    /// test fail and could "fix" it by editing the expectation — which is the failure mode of
    /// every test that hard-codes what it is asserting.
    /// </remarks>
    [Fact]
    public void The_declared_order_in_source_matches_what_the_container_resolves()
    {
        using var scope = factory.Services.CreateScope();

        var resolved = scope.ServiceProvider
            .GetServices<IPipelineBehavior<SucceedingProbeCommand, ProbeResult>>()
            .Select(behaviour => behaviour.GetType().GetGenericTypeDefinition())
            .ToArray();

        var declared = typeof(Program).Assembly
            .GetType("Wasl.Api.Common.WaslPipeline")!
            .GetField("DeclaredOrder")!
            .GetValue(null) as IReadOnlyList<Type>;

        declared.Should().NotBeNull("AC-15 asserts against a single ordered list, so it must exist");
        resolved.Should().Equal(declared!,
            "the list a reader sees and the list the container used must be the same list");
    }

    /// <summary>
    /// AC-16, at the registration level: the constrained behaviours are absent for a query.
    /// </summary>
    /// <remarks>
    /// This is `research.md` R-3's finding asserted against the real container rather than the
    /// spike: a query implements neither <c>ICommand</c> nor <c>IAuditableCommand</c>, so
    /// neither constrained behaviour is even constructed for it. The runtime half — that no
    /// transaction is open inside the handler — is asserted separately.
    /// </remarks>
    [Fact]
    public void A_query_resolves_validation_only()
    {
        using var scope = factory.Services.CreateScope();

        var names = scope.ServiceProvider
            .GetServices<IPipelineBehavior<ProbeQuery, ProbeResult>>()
            .Select(behaviour => behaviour.GetType().Name.Split('`')[0])
            .ToArray();

        // `036b` added TransientFailureBehaviour and it is DELIBERATELY unconstrained, so it
        // appears here where the other two do not. A query can be a deadlock victim against a
        // concurrent write, and constraining it to ICommand would have left exactly the read path
        // `036b` exists to close.
        //
        // AC-7: the rest of the sentence below is unchanged, and still asserted. An unconstrained
        // behaviour must not drag a transaction in with it.
        names.Should().Equal(["TransientFailureBehaviour", "ValidationBehaviour"],
            "the constraints keep queries out of the transaction and out of the audit path — "
            + "not an `if` at the top of each behaviour, which is a thing that can be deleted");
    }
}
