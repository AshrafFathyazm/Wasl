using MediatR;
using Microsoft.AspNetCore.Mvc;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Application.Features.Tickets.GetTicketById;

namespace Wasl.Api.Controllers;

/// <summary>
/// <c>/api/tickets</c>. US-005.
/// </summary>
/// <remarks>
/// <para>
/// Binds, dispatches, and maps — nothing else (`CLAUDE.md`). No validation: `003`'s pipeline
/// runs the validator before the handler. No error handling: `002`'s one handler maps every
/// domain exception to <c>ProblemDetails</c>, so there is no <c>try</c> here and no status code
/// chosen at this layer.
/// </para>
/// <para>
/// <b>No <c>[Authorize]</c>, and that is decision 1 rather than an omission.</b> `004` adds
/// authentication and this attribute together; until then every request is anonymous, AC-13 is
/// unverifiable, and `createdByUserId` comes back null. Written here so the absence reads as a
/// decision to whoever opens this file next.
/// </para>
/// </remarks>
[ApiController]
[Route("api/tickets")]
public sealed class TicketsController(ISender sender) : ControllerBase
{
    /// <summary>Creates a ticket. AC-1.</summary>
    /// <remarks>
    /// <c>CreatedAtAction</c> rather than a hand-built <c>Location</c>, so the header is
    /// generated from the route that actually serves it. A literal string would keep compiling
    /// after the route changed, and the `201` would then point at a `404` — which is the defect
    /// decision 3 moved <see cref="GetById"/> into this feature to avoid.
    /// </remarks>
    [HttpPost]
    [ProducesResponseType(typeof(CreateTicketResult), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Create(
        [FromBody] CreateTicketCommand command,
        CancellationToken cancellationToken)
    {
        var result = await sender.Send(command, cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    /// <summary>
    /// Reads one ticket. Moved here from `010` because the contract promises the `201`'s
    /// <c>Location</c> resolves.
    /// </summary>
    /// <remarks>
    /// Returns the same DTO the create returns, from the same mapping — the contract says "a
    /// <c>GET</c> on it returns the same resource", and two mappings would be two shapes to keep
    /// in step.
    /// </remarks>
    [HttpGet("{id:guid}", Name = nameof(GetById))]
    [ProducesResponseType(typeof(CreateTicketResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken) =>
        Ok(await sender.Send(new GetTicketByIdQuery(id), cancellationToken));
}
