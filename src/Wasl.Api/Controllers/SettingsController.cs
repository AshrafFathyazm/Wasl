using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Api.Common.Auth;
using Wasl.Api.Contracts.Settings;
using Wasl.Application.Features.Settings;
using Wasl.Application.Features.Settings.GetBranding;
using Wasl.Application.Features.Settings.UpdateBranding;

namespace Wasl.Api.Controllers;

/// <summary>
/// The organisation's settings. `022`, ADR-012.
/// </summary>
/// <remarks>
/// <b>Two actions with different policies on one controller</b>, which is the shape BR-6
/// prescribes: the read is any authenticated support user, the write is <c>ManagerOnly</c>. The
/// controller-level <c>[Authorize]</c> closes both, and the action-level policy narrows one.
/// </remarks>
[ApiController]
[Route("api/settings")]
[Authorize]
public sealed class SettingsController(ISender sender) : ControllerBase
{
    /// <summary>
    /// The organisation's branding. `022` AC-1.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Any authenticated support user reads it</b> — every screen is painted with it, so
    /// restricting the read to Managers would leave Agents on the default theme.
    /// </para>
    /// <para>
    /// <b>Never <c>404</c>.</b> The row is seeded by the migration, so a clean database answers
    /// <c>200</c> with the product default (AC-1). There is no "not configured" state to branch
    /// on anywhere, including in the pre-paint script where a branch costs a frame.
    /// </para>
    /// <para>
    /// <b><c>Cache-Control: no-store</c> is deliberate.</b> A stale theme is the exact defect
    /// this feature exists to remove — the client's own <c>localStorage</c> copy is the cache,
    /// and it is corrected by this response rather than by another copy of it in a proxy.
    /// </para>
    /// </remarks>
    [HttpGet("branding")]
    [ProducesResponseType(typeof(BrandingResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetBranding(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        return Ok(await sender.Send(new GetBrandingQuery(), cancellationToken));
    }

    /// <summary>
    /// Changes the branding. Manager only. `022` AC-4 … AC-8.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b><c>ManagerOnly</c> on the endpoint, because the check is role-only</b> (BR-6). It is
    /// the policy's second production consumer after `016`'s escalate. A policy denial answers
    /// `403` before any handler runs, with an enveloped body and an <c>Auth.Forbidden</c> audit
    /// row (`004b`) — and it discloses nothing, because there is nothing to enumerate here.
    /// </para>
    /// <para>
    /// <b><c>200</c> rather than <c>204</c>.</b> <c>onBrand</c> and <c>version</c> are both
    /// computed server-side and the client needs both immediately — the foreground to paint and
    /// the version for its next write. A <c>204</c> would force a follow-up read to learn the
    /// value this write just produced.
    /// </para>
    /// <para>
    /// <b>No <c>Idempotency-Key</c>, and none is needed.</b> This <c>PUT</c> is idempotent by
    /// construction: the same body applied twice leaves the same row, and the second application
    /// is refused by the stale <c>expectedVersion</c> anyway.
    /// </para>
    /// </remarks>
    [HttpPut("branding")]
    [Authorize(Policy = WaslPolicies.ManagerOnly)]
    [ProducesResponseType(typeof(BrandingResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateBranding(
        [FromBody] UpdateBrandingRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await sender.Send(
            new UpdateBrandingCommand(
                request.BrandColor,
                request.SidebarMode,
                request.ExpectedVersion),
            cancellationToken);

        return Ok(result);
    }
}
