using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Wasl.Api.IntegrationTests.Errors;

namespace Wasl.Api.IntegrationTests;

/// <summary>
/// Maps the error-contract probe routes into the real application pipeline.
/// </summary>
/// <remarks>
/// An <c>IStartupFilter</c> rather than a second <c>WebApplication</c>, so the probes sit
/// behind the <b>real</b> <c>UseExceptionHandler</c>, the real factory, and the real
/// behaviour pipeline. A separate host would assert a copy of the middleware rather than
/// the middleware.
/// </remarks>
internal sealed class ProbeRouteStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) =>
        app =>
        {
            next(app);
            app.UseEndpoints(ErrorContractProbe.Map);
        };
}
