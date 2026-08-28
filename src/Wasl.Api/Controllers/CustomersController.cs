using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Application.Common;
using Wasl.Application.Features.Customers.GetCustomerById;
using Wasl.Application.Features.Customers.GetCustomers;

namespace Wasl.Api.Controllers;

/// <summary>
/// <c>/api/customers</c> — read only. `008`.
/// </summary>
/// <remarks>
/// <para>
/// <b>No write half, and no role policy.</b> Creating a customer is `007`; editing is `017`. BR-6
/// permits both roles to view a customer, so this feature has **no `403` path at all** — unlike
/// `011`, there is no data-dependent check here and therefore no denial to audit.
/// </para>
/// <para>
/// <b>Why this exists now:</b> `024`'s create-ticket form has a finished customer picker running
/// on hard-coded data because this endpoint did not exist. `008` removes a stub.
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
