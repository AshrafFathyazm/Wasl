using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Application.Features.Dashboard.GetDashboard;

namespace Wasl.Api.Controllers;

/// <summary>
/// <c>/api/dashboard</c>. US-016.
/// </summary>
/// <remarks>
/// <para>
/// Binds, authorises, dispatches, maps — nothing else. The scope is not a parameter here and
/// cannot be: the role on the token selects it inside the handler, so there is no query string a
/// caller could send to widen what they see.
/// </para>
/// <para>
/// <b>No <c>ManagerOnly</c> policy, and that is deliberate.</b> Both roles read this endpoint;
/// what differs is the predicate. A role gate here would refuse every Agent — the same reasoning
/// BR-2 records for the assignee endpoint, where `011` measured it.
/// </para>
/// </remarks>
[ApiController]
[Route("api/dashboard")]
[Authorize]
public sealed class DashboardController(ISender sender) : ControllerBase
{
    /// <summary>Every block of the dashboard for the caller's scope. AC-1.</summary>
    /// <remarks>
    /// <para>
    /// <b><c>range</c> binds as a nullable string ARRAY, not as an enum and not as a single
    /// string</b> — two separate reasons, and both were measured.
    /// </para>
    /// <para>
    /// Not an enum, for the reason `002c` measured: a strongly-typed parameter is checked by the
    /// model binder, which refuses BEFORE the MediatR pipeline runs — so
    /// <c>ValidationBehaviour</c> never executes and the client gets the framework's English
    /// sentence instead of the catalogue message naming the three accepted values.
    /// </para>
    /// <para>
    /// Not a single string, because the contract says sending <c>range</c> TWICE is a `400` rather
    /// than first-wins — and as a <c>string?</c> it was first-wins:
    /// <c>?range=7d&amp;range=30d</c> answered `200` with a seven-day body, measured against the
    /// running API on 2026-09-07. MVC hands a repeated parameter's first value to a scalar and
    /// discards the rest, so nothing downstream could see the second one. A collection makes the
    /// repetition visible to <c>GetDashboardQueryValidator</c>.
    /// </para>
    /// <para>
    /// <b><c>Cache-Control: no-store</c> is written here rather than left to a
    /// <c>[ResponseCache]</c> attribute</b>, whose emitted directives depend on the interaction
    /// between <c>NoStore</c> and <c>Location</c>. The header is the thing TEST-020-14 asserts, so
    /// the code sets the header. No caching anywhere in this path is a decision (`research.md`
    /// R-10): two calls a second apart with a ticket created between them must differ, and AC-22
    /// asserts it so a later optimisation fails a test instead of quietly changing what the screen
    /// means.
    /// </para>
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(DashboardSnapshot), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Get(
        [FromQuery(Name = "range")] string[]? range,
        CancellationToken cancellationToken)
    {
        var snapshot = await sender.Send(new GetDashboardQuery(range), cancellationToken);

        Response.Headers.CacheControl = "no-store";

        return Ok(snapshot);
    }
}
