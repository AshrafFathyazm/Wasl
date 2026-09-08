using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Communications;

namespace Wasl.Application.Common.Communications;

/// <summary>
/// Channel → provider, and <b>the single source of the sendable-channel set</b>. `021`, AC-4.
/// </summary>
/// <remarks>
/// <para>
/// <b>Concrete, with no interface, deliberately.</b> Every other collaborator in this layer is
/// behind one because it reaches a database, a clock, or a network. This reaches a dictionary it
/// built in its own constructor. An <c>ICommunicationProviderRegistry</c> would exist only to be
/// mocked, and a test that mocks it is a test that no longer proves AC-4 — the whole point is
/// that the *real* registry is what the validator and the channels endpoint agree on.
/// </para>
/// <para>
/// <b>AC-4 is the reason this class exists at all.</b> The sendable set is a projection of what
/// is registered, in one place, so that registering a provider for a new channel makes it appear
/// in <c>GET /api/communications/channels</c> AND be accepted by the validator with no edit to
/// either. A <c>SendableChannels</c> constant somewhere would be that fact stated twice, and the
/// second statement is the one that drifts.
/// </para>
/// <para>
/// <b>Lives in <c>Wasl.Application</c> and not in <c>Wasl.Infrastructure</c></b>, even though
/// every provider it holds is an Infrastructure type: the validator and the channels query both
/// need it and both are Application code. Putting it the other side of the boundary would make
/// Application depend on Infrastructure, which is the one direction ADR-002 forbids.
/// </para>
/// <para>
/// <b>Registered as a singleton.</b> It is immutable after construction and the provider set is
/// fixed at startup — there is no runtime registration, and adding one would be a new decision
/// with an authorization question attached.
/// </para>
/// </remarks>
public sealed class CommunicationProviderRegistry
{
    private readonly Dictionary<CommunicationChannel, ICommunicationProvider> _byChannel;

    /// <summary>
    /// Indexes the registered providers by their own <see cref="ICommunicationProvider.Channel"/>.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// Two providers claim the same channel. <b>Thrown at construction, which is application
    /// startup</b> (AC-5).
    /// </exception>
    /// <remarks>
    /// <para>
    /// <b>Failing at startup rather than on the first send is the whole design of this
    /// constructor.</b> The alternative — last registration wins — is a routing bug that presents
    /// months later as *"the wrong provider sent it"*, with no error anywhere and a data trail
    /// that looks correct. A process that refuses to start names the problem to whoever deployed
    /// it, while it is still their change.
    /// </para>
    /// <para>
    /// <b>The message names the channel AND both implementation types</b>, because "duplicate
    /// provider" without them sends the reader to the DI registration to work out which two.
    /// </para>
    /// <para>
    /// <b>Indexed by <c>provider.Channel</c>, never by a key supplied at registration.</b> There
    /// is then no second place for the key and the provider's own idea of its channel to
    /// disagree — the disagreement is not detected, it is impossible.
    /// </para>
    /// <para>
    /// <b>An empty provider set is legal and starts cleanly.</b> The module is then visibly
    /// disabled: the channels endpoint returns <c>[]</c> and every send is a `400`. That is the
    /// alternative to a <see cref="NullReferenceException"/> on first use, and it is what makes
    /// "no providers registered" a state a reviewer can observe rather than a crash.
    /// </para>
    /// </remarks>
    public CommunicationProviderRegistry(IEnumerable<ICommunicationProvider> providers)
    {
        ArgumentNullException.ThrowIfNull(providers);

        _byChannel = [];

        foreach (var provider in providers)
        {
            if (_byChannel.TryGetValue(provider.Channel, out var existing))
            {
                throw new InvalidOperationException(
                    $"Two communication providers are registered for {provider.Channel}: "
                    + $"{existing.GetType().FullName} and {provider.GetType().FullName}. "
                    + "Exactly one provider may serve a channel — otherwise which one sends a "
                    + "message depends on registration order, which nothing asserts.");
            }

            _byChannel.Add(provider.Channel, provider);
        }

        /* IN THE DECLARATION ORDER OF `CommunicationChannel`, NOT IN REGISTRATION ORDER.
         *
         * The contract promises the channels endpoint is "stable between restarts", and DI
         * registration order is not something a caller can rely on — it is an implementation
         * detail of `AddInfrastructure`. Ordering by the enum makes the response a function of
         * the domain rather than of composition. */
        SendableChannels = Enum.GetValues<CommunicationChannel>()
            .Where(_byChannel.ContainsKey)
            .ToArray();
    }

    /// <summary>
    /// The channels a message can be sent on, in <see cref="CommunicationChannel"/>'s declaration
    /// order. Empty when nothing is registered.
    /// </summary>
    /// <remarks>
    /// Read by the validator (AC-3), by <c>GET /api/communications/channels</c> (AC-4), and by
    /// nothing else. It is a projection, so it cannot disagree with <see cref="Find"/>.
    /// </remarks>
    public IReadOnlyList<CommunicationChannel> SendableChannels { get; }

    /// <summary>
    /// The provider for a channel, or <c>null</c> when none is registered.
    /// </summary>
    /// <remarks>
    /// <b>Returns null rather than throwing</b>, because "no provider for this channel" is a
    /// caller-facing `400` and not a fault — the validator asks this question before the handler
    /// runs, so no code path reaches a null provider (AC-3). A throwing lookup would turn a
    /// validation failure into a `500`.
    /// </remarks>
    public ICommunicationProvider? Find(CommunicationChannel channel) =>
        _byChannel.GetValueOrDefault(channel);

    /// <summary>Whether a message can be sent on this channel.</summary>
    public bool CanSend(CommunicationChannel channel) => _byChannel.ContainsKey(channel);
}
