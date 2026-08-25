using MediatR;
using Wasl.Application.Common.Behaviours;
using Wasl.Infrastructure;

namespace Wasl.Api.Common;

/// <summary>
/// The <b>one</b> place the MediatR behaviour order is declared. AC-15 asserts against
/// <see cref="DeclaredOrder"/>.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why one list instead of each project registering its own.</b> MediatR orders behaviours
/// by registration order, and <c>Program.cs</c> calls <c>AddInfrastructure</c> before
/// <c>AddApplication</c>. With each project registering its own, the resulting order was
/// observed to be <c>Transaction → Audit → Validation</c> — validation last (`003`
/// `research.md` R-15). A `400` would then open a transaction and write an audit row for every
/// mistyped form, breaking `spec.md` Q-3, and <b>nothing would throw</b>.
/// </para>
/// <para>
/// <b>The cheaper fix was rejected.</b> Swapping the two <c>Add*</c> calls in
/// <c>Program.cs</c> is two lines and it works — and it makes execution order depend on the
/// relative position of two calls that look independent, so the next person to tidy
/// <c>Program.cs</c> alphabetically reintroduces the defect silently. Reordering
/// <see cref="DeclaredOrder"/> is instead a deliberate act, and the test that reads it fails
/// when someone commits one.
/// </para>
/// </remarks>
internal static class WaslPipeline
{
    /// <summary>
    /// Outermost first. This sequence is the specification, not a consequence of where each
    /// type happens to live.
    /// </summary>
    /// <remarks>
    /// <list type="number">
    /// <item><b>Validation</b> — reject before anything else happens. Outside the transaction,
    /// so an invalid request never opens one, and outside the audit behaviour, so a `400`
    /// writes no row (`spec.md` Q-3).</item>
    /// <item><b>Transaction</b> — one per <c>ICommand</c> request. Queries do not implement
    /// <c>ICommand</c>, so the constraint keeps them out rather than an <c>if</c> (AC-16).</item>
    /// <item><b>Audit</b> — inside the transaction, so BR-9.3 holds: the audit row is absent
    /// when the change rolls back. The failure path deliberately writes on a second
    /// connection so its row survives instead (BR-9.4).</item>
    /// </list>
    /// </remarks>
    public static readonly IReadOnlyList<Type> DeclaredOrder =
    [
        typeof(ValidationBehaviour<,>),
        WaslPipelineBehaviours.Transaction,
        WaslPipelineBehaviours.Audit,
    ];

    /// <summary>
    /// Registers <see cref="DeclaredOrder"/> with MediatR, in that order.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Iterates the list rather than naming each type again. Two places that must agree on an
    /// order eventually do not, and the one a test reads is not always the one the container
    /// used — which would make AC-15 pass while the pipeline was wrong.
    /// </para>
    /// <para>
    /// <b>Registered directly, not through a second <c>AddMediatR</c> call.</b> The first
    /// version wrapped this in <c>AddMediatR(c =&gt; c.AddOpenBehavior(...))</c> and threw at
    /// startup: <c>"No assemblies found to scan. Supply at least one assembly to scan for
    /// handlers."</c> — MediatR requires an assembly per call, and this call has no handlers to
    /// contribute. Supplying one anyway would re-scan an assembly <c>AddApplication</c> has
    /// already scanned, to satisfy a validation rather than a need.
    /// </para>
    /// <para>
    /// This is what <c>AddOpenBehavior</c> does internally: an open-generic
    /// <c>IPipelineBehavior&lt;,&gt;</c> registration, transient, resolved in registration
    /// order. MediatR asks the container for <c>IEnumerable&lt;IPipelineBehavior&lt;TRequest,
    /// TResponse&gt;&gt;</c> and wraps them outermost-first, so the ordering guarantee is the
    /// container's and is unchanged.
    /// </para>
    /// </remarks>
    public static IServiceCollection AddWaslPipeline(this IServiceCollection services)
    {
        foreach (var behaviour in DeclaredOrder)
        {
            services.AddTransient(typeof(IPipelineBehavior<,>), behaviour);
        }

        return services;
    }
}
