using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Api.Common.Auth;
using Wasl.Application.Features.Auth.IssueToken;

namespace Wasl.Api.Controllers;

/// <summary>
/// <c>/api/auth</c>. `004`.
/// </summary>
[ApiController]
[Route("api/auth")]
public sealed class AuthController(ISender sender) : ControllerBase
{
    /// <summary>Exchanges an email and password for an access token. AC-1.</summary>
    /// <remarks>
    /// <para>
    /// <b><c>[AllowAnonymous]</c> and it must be.</b> The fallback policy requires an
    /// authenticated user on every endpoint, which is what makes a forgotten
    /// <c>[Authorize]</c> impossible — and it would otherwise make signing in require being
    /// signed in. That is the one endpoint where the exception is correct, and AC-10 asserts every
    /// other endpoint carries authorization metadata or this attribute deliberately.
    /// </para>
    /// <para>
    /// A wrong password, an unknown email and a deactivated user all return the same `401` body.
    /// The handler explains why, and it is not a shortcut: telling them apart turns a login form
    /// into a directory.
    /// </para>
    /// </remarks>
    [AllowAnonymous]

    // `004b` AC-35. On this action alone: the ruling limits the token endpoint and not the API,
    // because a rate limit on a working application is a different feature with different numbers.
    [ServiceFilter<SignInThrottleFilter>]
    [HttpPost("token")]
    [ProducesResponseType(typeof(IssueTokenResult), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Token(
        [FromBody] IssueTokenCommand command,
        CancellationToken cancellationToken) =>
        Ok(await sender.Send(command, cancellationToken));
}
