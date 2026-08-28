using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Application.Features.SupportUsers.GetActiveSupportUsers;

namespace Wasl.Api.Controllers;

/// <summary>
/// <c>/api/support-users</c> — the assignee picker's source. `011`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Read-only, and there is no write half anywhere.</b> Creating, editing and deactivating
/// support users is out of the release: the two rows are seeded by `004` (ADR-005). This
/// controller exists because the picker needs names, and a client cannot render an assignee
/// dropdown from ids.
/// </para>
/// <para>
/// <b>Any authenticated role may call it, not just a Manager.</b> BR-2.2 lets an Agent self-assign,
/// so an Agent needs to see the list they are choosing from — and the list is colleagues' names
/// and roles, which every support user already knows. <c>ManagerOnly</c> here would make the
/// Agent's own legitimate action impossible to perform from a UI.
/// </para>
/// </remarks>
[ApiController]
[Route("api/support-users")]
[Authorize]
public sealed class SupportUsersController(ISender sender) : ControllerBase
{
    /// <summary>Every active support user, both roles. `011` AC-13.</summary>
    /// <remarks>
    /// Returns a bare array rather than the paged envelope. `010`'s envelope exists because a
    /// ticket list is unbounded; this one is seeded and single-digit (`spec.md` A-4), and wrapping
    /// it would promise paging that does not exist. If user management ever ships, this becomes
    /// paged — a breaking change, recorded as a known limitation rather than pre-empted with
    /// ceremony.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<SupportUserOption>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetActive(CancellationToken cancellationToken) =>
        Ok(await sender.Send(new GetActiveSupportUsersQuery(), cancellationToken));
}
