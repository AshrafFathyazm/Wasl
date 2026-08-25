using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Wasl.Api.IntegrationTests.Audit.Probe;

/// <summary>
/// Test-host-only routes that dispatch `003`'s probe commands through the <b>real</b> pipeline.
/// </summary>
/// <remarks>
/// Mapped through an <c>IStartupFilter</c>, the same mechanism `002` used, so these sit behind
/// the real <c>UseExceptionHandler</c>, the real behaviour list, and the real interceptor. A
/// second <c>WebApplication</c> would assert a copy of the pipeline rather than the pipeline —
/// and for a feature whose entire subject is pipeline ordering, that distinction is the test.
/// </remarks>
internal static class AuditProbeEndpoints
{
    public const string SucceedPath = "/__probe/audit/succeed";
    public const string FailPath = "/__probe/audit/fail";
    public const string DenyPath = "/__probe/audit/deny";
    public const string NoOpPath = "/__probe/audit/no-op";
    public const string TwicePath = "/__probe/audit/twice";
    public const string QueryPath = "/__probe/audit/query";

    public static void Map(IEndpointRouteBuilder routes)
    {
        routes.MapPost(SucceedPath, async (
            Guid customerId, string company, ISender sender, CancellationToken token) =>
            Results.Ok(await sender.Send(new SucceedingProbeCommand(customerId, company), token)));

        routes.MapPost(FailPath, async (Guid customerId, ISender sender, CancellationToken token) =>
            Results.Ok(await sender.Send(new FailingProbeCommand(customerId), token)));

        routes.MapPost(DenyPath, async (Guid customerId, ISender sender, CancellationToken token) =>
            Results.Ok(await sender.Send(new DeniedProbeCommand(customerId), token)));

        routes.MapPost(NoOpPath, async (Guid customerId, ISender sender, CancellationToken token) =>
            Results.Ok(await sender.Send(new NoOpProbeCommand(customerId), token)));

        routes.MapPost(TwicePath, async (Guid customerId, ISender sender, CancellationToken token) =>
            Results.Ok(await sender.Send(new TwiceSavingProbeCommand(customerId), token)));

        routes.MapGet(QueryPath, async (ISender sender, CancellationToken token) =>
            Results.Ok(await sender.Send(new ProbeQuery(), token)));
    }
}

/// <summary>
/// Maps <see cref="AuditProbeEndpoints"/> into the real application pipeline.
/// </summary>
internal sealed class AuditProbeStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) =>
        app =>
        {
            next(app);
            app.UseEndpoints(AuditProbeEndpoints.Map);
        };
}
