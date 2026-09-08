using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wasl.Application.Features.Communications.GetSendableChannels;

namespace Wasl.Api.Controllers;

/// <summary>
/// The communications module's own surface. `021`, US-012, FR-3.
/// </summary>
/// <remarks>
/// <para>
/// <b>One endpoint, and it exists so the client does not mirror the registry.</b> The sendable
/// channel set is a projection of what is registered in <c>CommunicationProviderRegistry</c>
/// (AC-4). A client-side constant listing `Email`, `WhatsApp` and `Sms` would be that fact stated
/// twice, in two languages, in two repositories — and the copy that drifts is the one that offers
/// a channel the server refuses with a `400`.
/// </para>
/// <para>
/// <b>THERE IS NO INBOUND ENDPOINT HERE, AND THAT IS THE POINT OF THIS CLASS BEING SPARSE.</b>
/// `POST /api/communications/inbound` does not exist, returns `404`, and appears nowhere in the
/// generated OpenAPI document. US-013 (Incoming Interaction Registration) is deferred with four
/// blockers that are all still true — an inbound webhook endpoint, a provider payload contract,
/// webhook authentication, and a strategy for matching an inbound message to a customer or
/// ticket — and every one of them depends on the provider account that is out of scope.
/// <c>CK_Interactions_Direction</c> is the schema-level statement of the same thing.
/// </para>
/// <para>
/// <b>A separate controller from <c>TicketsController</c> rather than one more action on it.</b>
/// This route is not under <c>/api/tickets</c> — it is a fact about the deployment, not about a
/// ticket — and the contract puts it at <c>/api/communications/channels</c>. The send and the read
/// stay on <c>TicketsController</c> because both are addressed by ticket id.
/// </para>
/// </remarks>
[ApiController]
[Route("api/communications")]

// `004`. The fallback policy already closes an endpoint with no attribute, so this is not what
// makes the route authenticated — `AuthorizationSurfaceTests` enumerates endpoint METADATA and a
// fallback policy is not metadata. Written out so the test can see it.
[Authorize]
public sealed class CommunicationsController(ISender sender) : ControllerBase
{
    /// <summary>
    /// What the module can currently send on. `021` AC-4.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Any authenticated support user.</b> Nothing here is about a ticket or a customer — it is
    /// the deployment's capability list, and an Agent needs it to render a composer just as much
    /// as a Manager does.
    /// </para>
    /// <para>
    /// <b>Empty when nothing is registered</b>, and the module is then visibly disabled: the
    /// composer offers nothing and every send is a `400`. That is the designed alternative to a
    /// <c>NullReferenceException</c> on first use.
    /// </para>
    /// <para>
    /// <b>Enum identifiers, never localized</b> (BR-8.7). The client owns the display label
    /// (AC-22) — a translated channel name here is a value no client could branch on.
    /// </para>
    /// <para>
    /// <b>No caching header.</b> The value changes only when the deployed registrations change,
    /// and the contract tells the client it may treat it as fresh for the page load and must not
    /// persist it beyond that. A <c>Cache-Control</c> here would be the server guessing at a
    /// client's page lifetime.
    /// </para>
    /// </remarks>
    [HttpGet("channels")]
    [ProducesResponseType(typeof(SendableChannelsResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetChannels(CancellationToken cancellationToken) =>
        Ok(await sender.Send(new GetSendableChannelsQuery(), cancellationToken));
}
