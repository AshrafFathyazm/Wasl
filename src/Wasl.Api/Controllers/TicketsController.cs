using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Api.Contracts.Tickets;
using Wasl.Application.Features.Tickets.AddComment;
using Wasl.Application.Features.Tickets.AssignTicket;
using Wasl.Application.Features.Tickets.GetTimeline;
using Wasl.Application.Features.Tickets.ChangeStatus;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Application.Common;
using Wasl.Application.Features.Tickets.GetTicketById;
using Wasl.Application.Features.Tickets.GetTickets;
using Wasl.Domain.Tickets;

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
/// <b><c>[Authorize]</c> arrived with `004`.</b> `009` shipped this controller without it and
/// said so in this paragraph rather than leaving the absence to be discovered — which is the only
/// reason the gap was closed on purpose instead of noticed in a review. With a token in play,
/// <c>createdByUserId</c> now comes back populated with no change to any handler: <c>Ticket</c> is
/// an <c>IAuditableEntity</c> and the stamping in <c>WaslDbContext.SaveChangesAsync</c> reads
/// <c>ICurrentUser</c>.
/// </para>
/// </remarks>
[ApiController]
[Route("api/tickets")]

// Every action needs a token. The fallback policy would refuse an unauthenticated request even
// without this attribute, but AC-10 enumerates ENDPOINT METADATA — and a fallback policy is not
// metadata. So the attribute is what makes the intent visible on the endpoint itself, and the
// fallback is what catches the endpoint that forgets it.
//
// No [Authorize(Policy = ManagerOnly)] anywhere yet: BR-2 puts the role split on assignment, and
// there is no assign endpoint until `011`.
[Authorize]
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
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Create(
        [FromBody] CreateTicketCommand command,
        CancellationToken cancellationToken)
    {
        var result = await sender.Send(command, cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    /// <summary>One page of the list, newest first. `010`, BR-7.</summary>
    /// <remarks>
    /// <para>
    /// <c>page</c> and <c>pageSize</c> are clamped, never rejected (BR-7.2) — the response echoes
    /// the values actually used, so a client that asked for 5000 rows is told it got 100 rather
    /// than left computing pages from a number the server ignored.
    /// </para>
    /// <para>
    /// No filter or search parameters, and that is `015`'s scope. Accepting them here and
    /// ignoring them would be worse than not accepting them: a client would filter, get
    /// everything back, and believe the filter matched.
    /// </para>
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<TicketListItem>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPage(
        [FromQuery] int? page,
        [FromQuery] int? pageSize,
        CancellationToken cancellationToken) =>
        Ok(await sender.Send(new GetTicketsQuery(page, pageSize), cancellationToken));

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
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken) =>
        Ok(await sender.Send(new GetTicketByIdQuery(id), cancellationToken));

    /// <summary>Changes the status. `012`, BR-1.</summary>
    /// <remarks>
    /// <para>
    /// A sub-resource <c>PUT</c>, not a <c>PATCH</c> on the ticket: a status change is a distinct
    /// business action with its own rules and its own history row (`CLAUDE.md`).
    /// </para>
    /// <para>
    /// The route id wins over any id in the body. Binding the two separately and letting the body
    /// decide would make the URL a suggestion — and a client that sent a mismatched pair would
    /// change a ticket it was not addressing.
    /// </para>
    /// <para>
    /// Every rule lives below this method: the entity owns BR-1, the handler owns lookup and the
    /// version check, and `002`'s handler maps each failure to its own `409` type. Nothing here
    /// chooses a status code.
    /// </para>
    /// </remarks>
    [HttpPut("{id:guid}/status")]
    [ProducesResponseType(typeof(CreateTicketResult), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ChangeStatus(
        Guid id,
        [FromBody] ChangeTicketStatusRequest request,
        CancellationToken cancellationToken) =>
        Ok(await sender.Send(
            new ChangeTicketStatusCommand(id, request.Status, request.ExpectedVersion, request.Note),
            cancellationToken));

    /// <summary>Sets or clears the assignee. `011` AC-1 to AC-12, AC-16, AC-17.</summary>
    /// <remarks>
    /// <para>
    /// <b>No role policy on this action, and that is BR-2 rather than an omission.</b>
    /// <c>[Authorize(Policy = WaslPolicies.ManagerOnly)]</c> here would refuse every Agent, and
    /// BR-2.2 makes an Agent self-assigning an unassigned ticket legitimate. So the role is read
    /// inside the handler, where the request's target and the ticket's current owner are also
    /// available — the split `CLAUDE.md` BR-6 requires.
    /// </para>
    /// <para>
    /// <b>The consequence is measurable, not stylistic.</b> A denial raised in the handler is a
    /// <c>DomainException</c>, so `003`'s <c>AuditBehaviour</c> classifies it as <c>Denied</c> and
    /// writes an audit row naming the actor and the ticket. A denial produced by a policy throws
    /// nothing and writes nothing (`004` AC-18, open). Putting BR-2 in a policy would make "an
    /// Agent tried to take a ticket that was not theirs" absent from the audit log.
    /// </para>
    /// <para>
    /// A sub-resource <c>PUT</c> rather than a field on a generic <c>PATCH</c>: assignment is a
    /// distinct business action with its own rules and its own history row (`CLAUDE.md`).
    /// </para>
    /// </remarks>
    [HttpPut("{id:guid}/assignee")]
    [ProducesResponseType(typeof(CreateTicketResult), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Assign(
        Guid id,
        [FromBody] AssignTicketRequest request,
        CancellationToken cancellationToken) =>
        Ok(await sender.Send(
            new AssignTicketCommand(id, request.AssigneeId, request.ExpectedVersion),
            cancellationToken));

    /// <summary>Adds a comment. `013` AC-1 to AC-8, AC-15, AC-16.</summary>
    /// <remarks>
    /// <para>
    /// <b>A `201` on a sub-collection, not a `PUT` on the ticket</b>, and the difference is real
    /// rather than cosmetic: a comment creates a new resource and does not modify the ticket, so
    /// there is no <c>expectedVersion</c> and no concurrency conflict between two people
    /// commenting at once. <c>/status</c> and <c>/assignee</c> are `PUT`s because each changes a
    /// field of the ticket itself.
    /// </para>
    /// <para>
    /// <b>No role policy, and BR-5 asks for none.</b> Any authenticated support user may comment
    /// on any open ticket, including one assigned to someone else — a colleague adding context is
    /// the point of the feature. Stated here because the absence of a rule beside `011`'s four is
    /// a decision.
    /// </para>
    /// </remarks>
    [HttpPost("{id:guid}/comments")]
    [ProducesResponseType(typeof(TicketCommentResult), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> AddComment(
        Guid id,
        [FromBody] AddTicketCommentRequest request,
        CancellationToken cancellationToken)
    {
        var comment = await sender.Send(
            new AddTicketCommentCommand(id, request.Body, request.IsInternal, request.Channel),
            cancellationToken);

        // Location points at the timeline rather than at the comment: BR-5.3 makes a comment
        // append-only, so there is no GET for one and inventing a route that returns 404 would be
        // worse than pointing at the feed the client is about to reload anyway.
        return Created($"/api/tickets/{id}/timeline", comment);
    }

    /// <summary>The merged feed. `013` AC-9 to AC-12, AC-16. BR-5.7.</summary>
    /// <remarks>
    /// <b>A cursor, not `010`'s page envelope</b>, and `CLAUDE.md` records the distinction under
    /// *API contract*. A ticket list grows at the end the reader is not looking at, so page 2 stays
    /// page 2; a timeline grows at the end they are reading, so a page number silently skips or
    /// repeats entries between two requests. <c>before</c> comes from the previous page's
    /// <c>nextCursor</c> and is opaque.
    /// </remarks>
    [HttpGet("{id:guid}/timeline")]
    [ProducesResponseType(typeof(TimelinePage), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Timeline(
        Guid id,
        [FromQuery] string? before,
        [FromQuery] int limit = GetTicketTimelineQuery.DefaultLimit,
        CancellationToken cancellationToken = default) =>
        Ok(await sender.Send(new GetTicketTimelineQuery(id, before, limit), cancellationToken));
}
