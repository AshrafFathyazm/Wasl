using MediatR;
using Wasl.Application.Common.Communications;
using Wasl.Domain.Communications;

namespace Wasl.Application.Features.Communications.GetSendableChannels;

/// <summary>
/// <c>GET /api/communications/channels</c>. `021`, AC-4.
/// </summary>
/// <remarks>
/// <b>This endpoint is what makes AC-4 observable.</b> Register a provider for a new channel and
/// it appears here, with no edit to the validator, the handler, the response, the contract, or the
/// client. Without it the sendable set would have to be a constant in the client — the one place
/// it could not be kept honest.
/// </remarks>
public sealed record GetSendableChannelsQuery : IRequest<SendableChannelsResponse>;

/// <summary>
/// The channels the module can currently send on.
/// </summary>
/// <remarks>
/// <para>
/// <b>An object with one array, not a bare array.</b> A top-level JSON array cannot grow a field
/// without breaking every client that indexes it, and this response has an obvious future
/// addition — a per-channel display hint, or a reason a channel is unavailable. The envelope costs
/// one level of nesting now and saves a breaking change later.
/// </para>
/// <para>
/// <b>Enum identifiers, never localized</b> (BR-8.7). The client owns the display label (AC-22) —
/// a translated channel name here would be a value a client cannot branch on.
/// </para>
/// </remarks>
public sealed record SendableChannelsResponse(IReadOnlyList<CommunicationChannel> SendableChannels);

/// <summary>
/// Reads the registry. No database, no clock.
/// </summary>
/// <remarks>
/// <b>A MediatR handler for a property read, which looks like ceremony and buys one thing:</b>
/// the pipeline. `036b`'s <c>TransientFailureBehaviour</c> is registered outermost and
/// deliberately unconstrained, and a controller reading the registry directly would be the one
/// endpoint outside every behaviour — including whatever the next feature adds. It also keeps the
/// controller's shape uniform: bind, authorise, dispatch, map.
/// </remarks>
internal sealed class GetSendableChannelsQueryHandler(CommunicationProviderRegistry registry)
    : IRequestHandler<GetSendableChannelsQuery, SendableChannelsResponse>
{
    public Task<SendableChannelsResponse> Handle(
        GetSendableChannelsQuery request,
        CancellationToken cancellationToken) =>
        Task.FromResult(new SendableChannelsResponse(registry.SendableChannels));
}
