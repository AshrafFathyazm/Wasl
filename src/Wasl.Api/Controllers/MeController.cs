using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Application.Features.Users.ChangeMyLanguage;

namespace Wasl.Api.Controllers;

/// <summary>
/// The signed-in user's own settings. `014`.
/// </summary>
/// <remarks>
/// <b><c>me</c> is the subject of the bearer token.</b> There is no path parameter and no field
/// naming a user, so one user cannot write another's preference — which is a stronger guarantee
/// than a check, because there is nothing to check.
/// </remarks>
[ApiController]
[Route("api/me")]
[Authorize]
public sealed class MeController(ISender sender) : ControllerBase
{
    /// <summary>
    /// Stores the interface language this user reads in. FR-5.5.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The <c>Content-Language</c> on this response names the locale applied to THIS request —
    /// the one in use BEFORE the switch.</b> The culture was resolved from the claim that was
    /// current when the request arrived, long before this action ran. A client reading the header
    /// to confirm the switch will conclude it failed.
    /// </para>
    /// <para>
    /// The frozen contract calls this *"the single most confusing thing about this endpoint"* and
    /// says plainly that it is behaviour rather than a defect. It is repeated here because the
    /// next person to meet it will be reading this file, not that one.
    /// </para>
    /// <para>
    /// <b>And the token still carries the old language until the next sign-in</b>, because a token
    /// is signed and immutable. So the preference takes effect on the next token, not the next
    /// request. Changing that means either re-issuing credentials from a write endpoint or reading
    /// the preference from the database on every request — both larger decisions than this
    /// endpoint, and neither taken.
    /// </para>
    /// </remarks>
    [HttpPut("language")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest, Type = typeof(ProblemDetails))]
    [ProducesResponseType(StatusCodes.Status401Unauthorized, Type = typeof(ProblemDetails))]
    public async Task<IActionResult> ChangeLanguage(
        ChangeMyLanguageCommand command,
        CancellationToken cancellationToken)
    {
        await sender.Send(command, cancellationToken);

        return NoContent();
    }
}
