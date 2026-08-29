using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Application.Common;
using Wasl.Api.Contracts.Customers;
using Wasl.Application.Features.Customers.CreateCustomer;
using Wasl.Application.Features.Customers.GetCustomerById;
using Wasl.Application.Features.Customers.GetCustomers;

namespace Wasl.Api.Controllers;

/// <summary>
/// <c>/api/customers</c>. Reads from `008`, the create from `007`.
/// </summary>
/// <remarks>
/// <para>
/// <b>No role policy on any action.</b> BR-6 permits both roles to view **and** create a customer,
/// so this controller has **no `403` path at all** — unlike `011`, there is no data-dependent check
/// anywhere here and therefore no denial to audit. Editing and deactivating are `017`.
/// </para>
/// <para>
/// <b>Why the reads came first:</b> `024`'s create-ticket form had a finished customer picker
/// running on hard-coded data because `GET /api/customers` did not exist, so `008` removed a stub
/// before `007` added a screen. It also means `007`'s AC-14 — a `GET` on the `Location` returns
/// the same resource — is satisfiable rather than needing this feature to absorb the read endpoint,
/// which is the dilemma `009` faced and solved that way.
/// </para>
/// </remarks>
[ApiController]
[Route("api/customers")]
[Authorize]
public sealed class CustomersController(ISender sender) : ControllerBase
{
    /// <summary>The directory. `008` AC-4 to AC-11, AC-15, AC-17.</summary>
    /// <remarks>
    /// <para>
    /// The paged envelope `010` froze — **not** `013`'s cursor. A customer directory is a stable,
    /// jumpable list: it grows at the end nobody is reading, so page 2 stays page 2. `CLAUDE.md`
    /// records both shapes and which case each is for.
    /// </para>
    /// <para>
    /// <c>search</c> is a substring over name, email and phone, and the term is escaped before it
    /// reaches <c>LIKE</c> — so <c>100%</c> matches the literal text rather than everything
    /// (AC-8).
    /// </para>
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<CustomerListItem>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = Paging.DefaultPageSize,
        CancellationToken cancellationToken = default) =>
        Ok(await sender.Send(new GetCustomersQuery(search, page, pageSize), cancellationToken));

    /// <summary>Creates a customer. `007` AC-1 to AC-15.</summary>
    /// <remarks>
    /// <para>
    /// <b>No role policy.</b> BR-6 permits both roles to create a customer, so this feature has no
    /// `403` path — the same shape as `008`'s reads and unlike `011`, which has a data-dependent
    /// rule.
    /// </para>
    /// <para>
    /// <b>The `409` is indistinguishable whichever half of BR-4.8 caught it.</b> The handler
    /// checks before inserting and the filtered unique index catches the race; the index's
    /// violation is translated into the same exception in <c>WaslDbContext.SaveChangesAsync</c>,
    /// so a client cannot tell which of two simultaneous requests it was. A difference between the
    /// two paths would leak timing.
    /// </para>
    /// </remarks>
    [HttpPost]
    [ProducesResponseType(typeof(CustomerProfile), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(
        [FromBody] CreateCustomerRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await sender.Send(
            new CreateCustomerCommand(
                request.FullName, request.Email, request.Phone,
                request.CompanyName, request.Notes),
            cancellationToken);

        // AC-14. CreatedAtAction rather than a hand-built string, so the Location is generated
        // from the route that actually serves it — a literal would keep pointing at the old URL
        // the day the route changes, and the 201 would still look correct.
        return CreatedAtAction(nameof(Get), new { id = customer.Id }, customer);
    }

    /// <summary>One customer. `008` AC-1, AC-2, AC-3.</summary>
    /// <remarks>
    /// <b><c>{id:guid}</c>, which means a malformed id returns `404` and not the `400` this
    /// feature's AC-3 asks for.</b> Deliberate, and recorded as a deviation: dropping the
    /// constraint here would buy AC-3 and cost something worse — two resources in one API answering
    /// the same malformed input differently, so a client cannot write one handler. `002b` owns
    /// enveloping the statuses the framework short-circuits, and it fixes every route at once.
    /// `011` met the identical conflict and made the identical choice.
    /// </remarks>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(CustomerProfile), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(await sender.Send(new GetCustomerByIdQuery(id), cancellationToken));
}
