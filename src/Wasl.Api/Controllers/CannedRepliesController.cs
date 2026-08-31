using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Application.Features.CannedReplies.GetCannedReplies;
using Wasl.Domain.Tickets;

namespace Wasl.Api.Controllers;

/// <summary>
/// Reply templates. `034` AC-15.
/// </summary>
/// <remarks>
/// <para>
/// <b>Read-only, and there is no write endpoint by design.</b> `034` Q-3 keeps the template set
/// managed with no admin screen — <c>--seed</c> supplies them, and adding one is a database
/// action until a screen is specified. Stated here rather than left as an apparent omission.
/// </para>
/// <para>
/// <b><c>[Authorize]</c>, like everything else.</b> `004`'s fallback policy already closes an
/// endpoint that forgets it, but the attribute goes on anyway: <c>AuthorizationSurfaceTests</c>
/// enumerates endpoint METADATA, and a fallback policy is not metadata.
/// </para>
/// </remarks>
[ApiController]
[Authorize]
[Route("api/canned-replies")]
public sealed class CannedRepliesController(ISender sender) : ControllerBase
{
    /// <summary>The templates offered for a category.</summary>
    /// <remarks>
    /// The category is optional. Omitting it returns every active template, which is what a
    /// future management screen wants; a ticket's composer always passes its own category, and an
    /// uncategorised template comes back for every one of them.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<CannedReplySummary>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(
        [FromQuery] TicketCategory? category,
        CancellationToken cancellationToken) =>
        Ok(await sender.Send(new GetCannedRepliesQuery(category), cancellationToken));
}
