namespace Wasl.Infrastructure;

/// <summary>
/// The open-generic behaviour types this layer contributes, exposed so <c>Wasl.Api</c> can
/// register them in one ordered list without the behaviours themselves becoming public.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why a type list rather than an <c>AddX()</c> extension method.</b> An extension method
/// would register them here, and registering them here is precisely the defect
/// `research.md` R-15 found: <c>Program.cs</c> calls <c>AddInfrastructure</c> before
/// <c>AddApplication</c>, so anything registered inside <c>AddInfrastructure</c> runs
/// <i>before</i> `002`'s validation behaviour. Handing out the types instead means the
/// ordering decision lives in exactly one place, which is what AC-15 asserts against.
/// </para>
/// <para>
/// The behaviours stay <c>internal</c>. Composition needs their <see cref="Type"/>, not their
/// API — MediatR closes the generic by reflection — so nothing is gained by making the classes
/// public and something is lost: an <c>internal</c> behaviour cannot be resolved or invoked
/// directly by another project, which keeps the pipeline the only way in.
/// </para>
/// </remarks>
public static class WaslPipelineBehaviours
{
    /// <summary>
    /// Translates a deadlock victim raised anywhere beneath it. `036b`.
    /// </summary>
    /// <remarks>
    /// <b>Unconstrained, and outermost in <c>WaslPipeline.DeclaredOrder</c>.</b> Both are
    /// load-bearing and neither is a default — see the behaviour's own remarks. It runs for
    /// queries as well as commands, which is the difference from <see cref="Transaction"/>.
    /// </remarks>
    public static Type TransientFailure => typeof(Persistence.Behaviours.TransientFailureBehaviour<,>);

    /// <summary>
    /// One transaction per <c>ICommand</c> request. BR-9.3.
    /// </summary>
    public static Type Transaction => typeof(Persistence.Behaviours.TransactionBehaviour<,>);

    /// <summary>
    /// One audit row per <c>IAuditableCommand</c>, both paths. BR-9.1, BR-9.4.
    /// </summary>
    public static Type Audit => typeof(Persistence.Behaviours.AuditBehaviour<,>);
}
