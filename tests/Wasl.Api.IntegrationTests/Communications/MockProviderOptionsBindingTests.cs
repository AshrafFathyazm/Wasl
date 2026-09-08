using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Wasl.Domain.Communications;
using Wasl.Infrastructure.Communications;

namespace Wasl.Api.IntegrationTests.Communications;

/// <summary>
/// Does <c>MockProviderOptions</c> actually bind from configuration? `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Written to settle a disagreement between two measurements, not to add coverage.</b>
/// <c>ProviderSeamTests.A_configured_failure_is_a_201_that_keeps_the_row</c> passes — a second
/// host built with <c>UseSetting("Communications:Mock:FailChannels:0", "Email")</c> answers
/// <c>Failed</c>. But the same setting placed in <c>appsettings.Development.json</c>, and the
/// same setting as an environment variable, and again as a <c>--Key=Value</c> argument, all left
/// the running application accepting every SMS.
/// </para>
/// <para>
/// One of those two observations is about the transport and the other is about the binder, and
/// guessing which would have meant "fixing" the wrong one. This asks the binder directly, with no
/// host and no HTTP.
/// </para>
/// </remarks>
public sealed class MockProviderOptionsBindingTests
{
    private static MockProviderOptions Bind(params (string Key, string Value)[] settings)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(
                settings.Select(pair =>
                    new KeyValuePair<string, string?>(pair.Key, pair.Value)))
            .Build();

        var services = new ServiceCollection();

        services.Configure<MockProviderOptions>(
            configuration.GetSection(MockProviderOptions.SectionName));

        return services.BuildServiceProvider()
            .GetRequiredService<IOptions<MockProviderOptions>>()
            .Value;
    }

    /// <summary>The default: nothing fails. AC-6's first half.</summary>
    [Fact]
    public void With_no_configuration_no_channel_fails()
    {
        var options = Bind();

        options.FailChannels.Should().BeEmpty();
        options.LatencyMs.Should().Be(0);
    }

    /// <summary>
    /// A settable scalar binds. The control for the collection case below.
    /// </summary>
    /// <remarks>
    /// If this passed while <c>FailChannels</c> failed, the difference is the property shape
    /// rather than the section name or the transport — which is exactly the question.
    /// </remarks>
    [Fact]
    public void A_settable_scalar_binds()
    {
        Bind(("Communications:Mock:LatencyMs", "250")).LatencyMs.Should().Be(250);
    }

    /// <summary>
    /// <b>THE ONE THAT MATTERS.</b> The channel list binds from an indexed key.
    /// </summary>
    /// <remarks>
    /// This is the shape both a JSON array and <c>UseSetting</c> produce —
    /// <c>Communications:Mock:FailChannels:0</c> — so if it binds here and not in the running
    /// application, the fault is not the binder.
    /// </remarks>
    [Fact]
    public void The_fail_channel_list_binds_from_an_indexed_key()
    {
        var options = Bind(("Communications:Mock:FailChannels:0", nameof(CommunicationChannel.Sms)));

        options.FailChannels.Should().Equal([CommunicationChannel.Sms]);
    }

    [Fact]
    public void Several_fail_channels_bind()
    {
        var options = Bind(
            ("Communications:Mock:FailChannels:0", nameof(CommunicationChannel.Sms)),
            ("Communications:Mock:FailChannels:1", nameof(CommunicationChannel.WhatsApp)));

        options.FailChannels.Should().BeEquivalentTo(
            [CommunicationChannel.Sms, CommunicationChannel.WhatsApp]);
    }

    /// <summary>
    /// The section name is a constant, and this is what stops it drifting from the file.
    /// </summary>
    /// <remarks>
    /// A mistyped section binds NOTHING and throws nothing — the options come back at their
    /// defaults, so "no channel fails" and "the section name is wrong" are the same observation.
    /// That is precisely the ambiguity this whole file exists to remove.
    /// </remarks>
    [Fact]
    public void The_section_name_is_the_one_the_configuration_file_uses()
    {
        MockProviderOptions.SectionName.Should().Be("Communications:Mock");
    }
}
