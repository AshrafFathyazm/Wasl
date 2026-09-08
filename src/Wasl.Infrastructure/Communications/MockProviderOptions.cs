using Wasl.Domain.Communications;

namespace Wasl.Infrastructure.Communications;

/// <summary>
/// Configuration for <see cref="MockCommunicationProvider"/>. Section
/// <c>Communications:Mock</c>. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>NO SECRET, NO KEY, NO ACCOUNT, NO ENDPOINT — and AC-17 asserts that by search.</b> A mock
/// that needs a fake API key has already lost the argument for being a mock, and a configuration
/// key named like a credential is the thing a reviewer greps for.
/// </para>
/// <para>
/// <b>This type is the ONLY way to reach the failure path</b>, and that is `research.md` R-6's
/// ruling rather than a convenience. The rejected alternatives were a magic token in the message
/// body and an <c>X-Force-Failure</c> header — both are request-controlled failure switches,
/// which means they ship, any authenticated caller can fire them, and when they do fire the
/// result is indistinguishable from a bug. AC-6 asserts the absence: a repository search must
/// find no request field, header, query parameter or body token that triggers a failure.
/// </para>
/// </remarks>
public sealed class MockProviderOptions
{
    public const string SectionName = "Communications:Mock";

    /// <summary>
    /// Channels whose sends the mock refuses. <b>Empty by default</b> (AC-6).
    /// </summary>
    /// <remarks>
    /// <para>
    /// A demo sets it in <c>appsettings.Development.json</c> so a reviewer can see the
    /// <c>Failed</c> state; an integration test sets it through the factory's configuration
    /// (Q-D). Neither is a code path a request can influence.
    /// </para>
    /// <para>
    /// <b>A list of channels rather than a single boolean</b>, because the interesting demo is a
    /// customer for whom email works and SMS does not — one failing channel beside a working one
    /// on the same ticket. A global switch would make every channel fail together, which is a
    /// state a real deployment never has.
    /// </para>
    /// </remarks>
    public IList<CommunicationChannel> FailChannels { get; } = [];

    /// <summary>
    /// How long the mock pretends to take. Zero by default.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Exists so a demo can show the composer's pending state, and so a cancellation test has a
    /// window to cancel inside. <b>Zero in every environment that is not being demonstrated</b> —
    /// a provider that sleeps inside the request transaction holds locks for the duration, which
    /// is the exact hazard `CLAUDE.md` names for a real provider call.
    /// </para>
    /// <para>
    /// <c>int</c> milliseconds rather than <c>TimeSpan</c>: this binds from JSON, and
    /// <c>"Latency": "00:00:00.250"</c> is a format nobody guesses right the first time.
    /// </para>
    /// </remarks>
    public int LatencyMs { get; set; }
}
