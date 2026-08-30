using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Wasl.Api.IntegrationTests.Errors;

/// <summary>
/// Captures the host's log output so a test can read it. `002c` AC-9.
/// </summary>
/// <remarks>
/// <para>
/// The same shape as `008`'s query counter: a real seam registered into the running host, rather
/// than a claim about what the host would do. BR-9.9 says the <c>traceId</c> in a response matches
/// the log, and `002` recorded that as an argument — one accessor, so they agree by construction —
/// rather than as evidence. Reading the log is what turns it into evidence.
/// </para>
/// <para>
/// <b>Static, and that is a deliberate trade.</b> The suite shares one host, so a provider
/// instance per test is not available; entries from other tests running concurrently land in the
/// same buffer. That is why AC-9 asserts the trace id is <b>present</b> among the entries rather
/// than that the buffer contains only its own — a stricter assertion would be flaky for a reason
/// that has nothing to do with the property under test.
/// </para>
/// <para>
/// Bounded, so a long run cannot grow it without limit.
/// </para>
/// </remarks>
internal sealed class LogCapture : ILoggerProvider
{
    private const int Capacity = 500;

    private static readonly ConcurrentQueue<string> Captured = new();

    public static IReadOnlyCollection<string> Entries => [.. Captured];

    public static void Clear() => Captured.Clear();

    public ILogger CreateLogger(string categoryName) => new CapturingLogger();

    public void Dispose()
    {
        // Nothing to release: the buffer is static and shared with the assertions.
    }

    private static void Add(string entry)
    {
        Captured.Enqueue(entry);

        while (Captured.Count > Capacity && Captured.TryDequeue(out _))
        {
            // Oldest first. A test asserts about the request it just made, so the tail is what
            // matters and an unbounded buffer would only cost memory across a long run.
        }
    }

    private sealed class CapturingLogger : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            // The formatted message AND the state, because a trace id usually arrives as a
            // structured property rather than inside the message text — and this test exists to
            // find it wherever it is, not to assume where it was put.
            Add($"{formatter(state, exception)} | {state} | {exception?.Message}");
        }
    }
}
