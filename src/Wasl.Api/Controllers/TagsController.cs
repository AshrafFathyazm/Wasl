using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Application.Features.Tickets.Tags;

namespace Wasl.Api.Controllers;

/// <summary>
/// <c>/api/tags</c> — the tag vocabulary. `034`'s read half, added 2026-08-31.
/// </summary>
/// <remarks>
/// <para>
/// <b>Read-only, and there is no write half by ruling.</b> `034` Q-3 chose *"a managed set,
/// seeded, with no admin UI this feature"*: free text becomes forty spellings of one tag, and a
/// managed set needs an admin screen nobody has specified. Adding a tag is a database action, and
/// that limitation is stated rather than hidden.
/// </para>
/// <para>
/// <b>This endpoint exists because `034` shipped without it.</b> It built
/// <c>PUT</c>/<c>DELETE /api/tickets/{id}/tags/{tagId}</c> — the writes — and nothing that
/// returns the set a client attaches FROM, and nothing that returns the tags a ticket already
/// carries. A UI could therefore change tags it could neither list nor display. The second half
/// is <c>tags</c> on the ticket response.
/// </para>
/// <para>
/// <b>Any authenticated role.</b> The tag names are the vocabulary every support user works in,
/// and `034` Q-4 already ruled that detaching is open to the assignee and any Manager — a role
/// gate on merely READING the list would refuse the Agent who is allowed to attach.
/// </para>
/// <para>
/// A separate controller rather than a route on <c>TicketsController</c>: the vocabulary is not a
/// sub-resource of a ticket. <c>/api/tickets/{id}/tags</c> would read as "this ticket's tags",
/// which is the ticket response's job.
/// </para>
/// </remarks>
[ApiController]
[Authorize]
[Route("api/tags")]
public sealed class TagsController(ISender sender) : ControllerBase
{
    /// <summary>Every active tag, ordered by name under the database collation.</summary>
    /// <remarks>
    /// A bare array rather than the paged envelope, for the reason `011` gave
    /// <c>GET /api/support-users</c>: the set is seeded and single-digit, and wrapping it would
    /// promise paging that does not exist.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<TagSummary>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken) =>
        Ok(await sender.Send(new GetTagsQuery(), cancellationToken));
}
