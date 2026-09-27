using MediatR;
using Microsoft.Extensions.Logging;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Application.Features.Settings.GetBranding;

/// <summary>
/// <c>GET /api/settings/branding</c>. `022`, AC-1.
/// </summary>
/// <remarks>
/// <b>Authenticated, per spec Q-A.</b> ADR-005 says every endpoint but <c>/health</c> and
/// <c>POST /api/auth/token</c> requires a token, and a planned design file marking this read
/// "Any" does not override a security rule. The consequence is accepted and stated: <b>the
/// sign-in screen is not branded</b> — it paints the product default, or a cached theme on a
/// device that has signed in before. One screen, against weakening a blanket auth rule for a
/// cosmetic gain.
/// </remarks>
public sealed record GetBrandingQuery : IRequest<BrandingResponse>;

/// <summary>
/// Reads the single settings row.
/// </summary>
internal sealed class GetBrandingQueryHandler(
    IApplicationDbContext context,
    ILogger<GetBrandingQueryHandler> logger)
    : IRequestHandler<GetBrandingQuery, BrandingResponse>
{
    public async Task<BrandingResponse> Handle(
        GetBrandingQuery request,
        CancellationToken cancellationToken)
    {
        /* NO `AsNoTracking()`, AND NOT BECAUSE IT WAS FORGOTTEN. It is an EF Core extension, and
         * `Wasl.Application` cannot see EF Core — which is the whole return on
         * `IApplicationDbContext` (ADR-002). A read in this layer gets the context's default
         * behaviour, and the cost here is one tracked entity per request for a single row. */
        var settings = await context.FirstOrDefaultAsync(
            context.OrganizationSettings,
            cancellationToken);

        if (settings is null)
        {
            /* AC-1 SAYS THERE IS NO "NOT CONFIGURED" STATE, AND THIS IS WHERE THAT CLAIM IS
             * KEPT HONEST RATHER THAN ASSUMED.
             *
             * The row is seeded by the migration and `CK_OrganizationSettings_SingleRow` stops a
             * second one existing — so a missing row means the migration did not run, which is a
             * deployment fault and not a request the caller got wrong. Answering `404` would
             * report it as "this organisation has no branding", which reads as a product state
             * and sends the reader looking at the settings screen.
             *
             * Loud, and a `500`: `021` shipped a feature whose migration was generated and never
             * applied, and both endpoints answered `500` in a browser while 591 integration tests
             * passed — because the fixture builds the schema from scratch every run. This log
             * line is what that morning needed. */
            logger.LogCritical(
                "dbo.OrganizationSettings has no row. It is seeded by the AddOrganizationSettings "
                + "migration, so this means the migration has not been applied to this database. "
                + "Run: dotnet run --project src/Wasl.Api -- --provision");

            throw new InvalidOperationException(
                "The organisation settings row is missing. The AddOrganizationSettings migration "
                + "has not been applied to this database.");
        }

        return BrandingResponse.From(settings);
    }
}
