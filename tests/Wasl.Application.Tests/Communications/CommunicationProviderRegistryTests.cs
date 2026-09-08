using FluentAssertions;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Common.Communications;
using Wasl.Domain.Communications;

namespace Wasl.Application.Tests.Communications;

/// <summary>
/// The registry — <b>AC-4 and AC-5</b>. `021`.
/// </summary>
/// <remarks>
/// <para>
/// No database, no HTTP, no host. The registry holds a dictionary it built in its own
/// constructor, which is exactly why it has no interface: an
/// <c>ICommunicationProviderRegistry</c> would exist only to be mocked, and a test that mocked it
/// would stop proving AC-4 — the point being that the <i>real</i> registry is what the validator
/// and the channels endpoint agree on.
/// </para>
/// <para>
/// <b>AC-5's "fails application startup" is asserted here as "throws from the constructor", and
/// the two are the same claim</b> because `Program.cs` resolves the registry before
/// <c>app.Run()</c>. The integration suite asserts the composition half; this asserts the rule.
/// </para>
/// </remarks>
public sealed class CommunicationProviderRegistryTests
{
    /// <summary>A provider that serves one channel and records nothing.</summary>
    /// <remarks>
    /// Hand-written rather than mocked. The registry reads two properties, and a mocking framework
    /// here would add a dependency to make two auto-properties shorter.
    /// </remarks>
    private sealed class StubProvider(CommunicationChannel channel, string name = "Stub")
        : ICommunicationProvider
    {
        public CommunicationChannel Channel { get; } = channel;

        public string Name { get; } = name;

        public Task<SendOutcome> SendAsync(
            OutboundMessage message, CancellationToken cancellationToken) =>
            Task.FromResult(SendOutcome.Accepted("stub-1"));
    }

    // ── AC-5. Two providers, one channel ────────────────────────────────────────

    /// <summary>
    /// AC-5. The message names the channel and both implementation types.
    /// </summary>
    /// <remarks>
    /// <b>The alternative — last registration wins — is a routing bug with no error anywhere.</b>
    /// It presents months later as "the wrong provider sent it", and the data trail looks correct
    /// because <c>Interaction.ProviderName</c> faithfully records whichever provider actually ran.
    /// A constructor that throws names the problem to whoever deployed the change, while it is
    /// still their change.
    /// </remarks>
    [Fact]
    public void Two_providers_for_one_channel_throw_naming_the_channel_and_both_types()
    {
        var build = () => new CommunicationProviderRegistry(
        [
            new StubProvider(CommunicationChannel.Email, "First"),
            new StubProvider(CommunicationChannel.Email, "Second"),
        ]);

        build.Should().Throw<InvalidOperationException>()
            .Which.Message.Should()
            .Contain(nameof(CommunicationChannel.Email), "the message must name the channel")
            .And.Contain(
                typeof(StubProvider).FullName!,
                "and both implementation types — 'duplicate provider' without them sends the "
                + "reader to the DI registration to work out which two");
    }

    /// <summary>
    /// It does NOT throw on the first send, and it does not pick one.
    /// </summary>
    /// <remarks>
    /// The negative half of AC-5, and worth its own assertion: a registry that deferred the check
    /// to <c>Find</c> would let the process start, pass a health check, and misroute silently.
    /// </remarks>
    [Fact]
    public void The_duplicate_check_happens_at_construction_and_not_at_lookup()
    {
        var providers = new ICommunicationProvider[]
        {
            new StubProvider(CommunicationChannel.Sms, "First"),
            new StubProvider(CommunicationChannel.Sms, "Second"),
        };

        // The failure is on this line — building it — not on a later Find.
        var build = () => new CommunicationProviderRegistry(providers);

        build.Should().Throw<InvalidOperationException>();
    }

    // ── AC-4. The sendable set is a projection ──────────────────────────────────

    /// <summary>
    /// AC-4. Registering a provider makes its channel sendable, with no other edit.
    /// </summary>
    /// <remarks>
    /// <b>`LiveChat` is the interesting row.</b> Spec A-3 says it has no outbound address and it
    /// is deliberately unregistered in production — so a test that registers one and finds the
    /// registry accepts it is the cheapest possible proof that the sendable set is derived rather
    /// than declared. There is no list anywhere for this test to have to edit.
    /// </remarks>
    [Fact]
    public void Registering_a_provider_for_any_channel_makes_that_channel_sendable()
    {
        var registry = new CommunicationProviderRegistry(
            [new StubProvider(CommunicationChannel.LiveChat)]);

        registry.SendableChannels.Should().Equal([CommunicationChannel.LiveChat]);
        registry.CanSend(CommunicationChannel.LiveChat).Should().BeTrue();
        registry.Find(CommunicationChannel.LiveChat).Should().NotBeNull();
    }

    /// <summary>
    /// The order is the enum's, not the registration's. The contract promises stability.
    /// </summary>
    /// <remarks>
    /// <b>Registered deliberately backwards so the assertion can fail.</b> Passing them in enum
    /// order would make this test pass under either implementation, which is the shape of a test
    /// that proves nothing — the same trap `013` fell into when two identical results were read
    /// as a determined order.
    /// <para>
    /// The declaration order is <c>Email, WhatsApp, LiveChat, Sms, WebForm</c>, so `Sms` comes
    /// after `WhatsApp` and both come after `Email`.
    /// </para>
    /// </remarks>
    [Fact]
    public void The_sendable_set_is_in_enum_declaration_order_not_registration_order()
    {
        var registry = new CommunicationProviderRegistry(
        [
            new StubProvider(CommunicationChannel.Sms),
            new StubProvider(CommunicationChannel.Email),
            new StubProvider(CommunicationChannel.WhatsApp),
        ]);

        registry.SendableChannels.Should().Equal(
            [
                CommunicationChannel.Email,
                CommunicationChannel.WhatsApp,
                CommunicationChannel.Sms,
            ],
            "the contract promises the channels endpoint is stable between restarts, and DI "
            + "registration order is an implementation detail of AddInfrastructure");
    }

    /// <summary>
    /// The registry indexes by <c>provider.Channel</c>, so the key cannot disagree with it.
    /// </summary>
    /// <remarks>
    /// There is no registration-time key to get wrong — this asserts the property that makes
    /// "a provider registered under the wrong channel" not a bug to be caught but a state that
    /// cannot be expressed.
    /// </remarks>
    [Fact]
    public void A_provider_is_found_under_its_own_channel()
    {
        var email = new StubProvider(CommunicationChannel.Email, "EmailProvider");
        var sms = new StubProvider(CommunicationChannel.Sms, "SmsProvider");

        var registry = new CommunicationProviderRegistry([email, sms]);

        registry.Find(CommunicationChannel.Email).Should().BeSameAs(email);
        registry.Find(CommunicationChannel.Sms).Should().BeSameAs(sms);
    }

    // ── The empty case, which is legal ──────────────────────────────────────────

    /// <summary>
    /// No providers is a valid state: the module is visibly disabled, not broken.
    /// </summary>
    /// <remarks>
    /// The alternative is a <see cref="NullReferenceException"/> on the first send. An empty
    /// sendable set makes "nothing is registered" something a reviewer can observe through
    /// <c>GET /api/communications/channels</c>, and every send becomes a `400` from the validator
    /// rather than a `500` from the handler.
    /// </remarks>
    [Fact]
    public void An_empty_provider_set_is_legal_and_disables_the_module_visibly()
    {
        var registry = new CommunicationProviderRegistry([]);

        registry.SendableChannels.Should().BeEmpty();

        foreach (var channel in Enum.GetValues<CommunicationChannel>())
        {
            registry.CanSend(channel).Should().BeFalse();

            registry.Find(channel).Should().BeNull(
                "Find returns null rather than throwing, because 'no provider for this channel' "
                + "is a caller-facing 400 decided by the validator, not a fault");
        }
    }

    [Fact]
    public void A_null_provider_sequence_is_refused()
    {
        var build = () => new CommunicationProviderRegistry(null!);

        build.Should().Throw<ArgumentNullException>();
    }

    // ── The sendable set matches what the mock is registered for ────────────────

    /// <summary>
    /// Spec A-3's three channels, asserted against separately written literals.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This is the one test in this file that pins production configuration</b>, and it is
    /// written as literals rather than read from <c>AddInfrastructure</c> — reading the
    /// registration would make it a tautology, the same reason
    /// `016`'s <c>The_priority_rank_is_ascending_by_urgency</c> writes its four ordinals out.
    /// </para>
    /// <para>
    /// It exists so that adding or removing a channel from the deployment is a deliberate act with
    /// a red test, not a one-line change nobody reviews. `LiveChat` and `WebForm` are absent
    /// because a live-chat session and a web form are things a customer initiates — there is no
    /// outbound address for either (spec A-3).
    /// </para>
    /// </remarks>
    [Fact]
    public void The_three_channels_spec_A3_names_are_the_sendable_ones()
    {
        var registry = new CommunicationProviderRegistry(
        [
            new StubProvider(CommunicationChannel.Email),
            new StubProvider(CommunicationChannel.WhatsApp),
            new StubProvider(CommunicationChannel.Sms),
        ]);

        registry.SendableChannels.Should().HaveCount(3);

        registry.CanSend(CommunicationChannel.LiveChat).Should().BeFalse(
            "a live-chat session is something a customer initiates — spec A-3");

        registry.CanSend(CommunicationChannel.WebForm).Should().BeFalse(
            "and so is a web form submission");
    }
}
