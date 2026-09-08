using Wasl.Application.Common.Abstractions;

namespace Wasl.Infrastructure.Communications;

/// <summary>
/// What the mock was asked to send, most recent last. A bounded ring. `021`, AC-2.
/// </summary>
/// <remarks>
/// <para>
/// <b>A DIAGNOSTIC, NOT A LEDGER — and AC-8 exists to stop the two being confused.</b>
/// <c>dbo.Interactions</c> is the record; this is a window onto what the provider saw. The
/// difference is observable: fail a request *after* the provider returns and the transaction
/// rolls back, so there is no row — while this buffer still holds the attempt. AC-8 asserts
/// exactly that asymmetry, *"because it is the difference between a diagnostic buffer and a
/// ledger, and because a reviewer who finds the buffer will otherwise assume it is the record"*.
/// </para>
/// <para>
/// <b>BOUNDED, and that is not a detail.</b> An unbounded in-memory list of every message the
/// process ever sent is a memory leak with a slow fuse — invisible in a test run, fatal in a
/// long-lived process. Oldest entries are dropped when it is full (spec, Edge cases).
/// </para>
/// <para>
/// <b>Thread-safe, because the singleton it lives in serves concurrent requests.</b> A
/// <c>List&lt;T&gt;</c> here would corrupt under two simultaneous sends and present as an
/// occasional wrong count in a test that passes ninety-nine times.
/// </para>
/// <para>
/// <b>It holds the message bodies, so it must never be exposed over HTTP.</b> There is no
/// endpoint that reads it and there must not be: it is reachable only from the DI container,
/// which means from an integration test. A "recent messages" debug endpoint would publish every
/// customer's message text to any authenticated caller.
/// </para>
/// </remarks>
public sealed class SentMessageBuffer
{
    /// <summary>
    /// Enough for any test and any demo, small enough to be harmless.
    /// </summary>
    /// <remarks>
    /// Chosen rather than derived: a test asserts a handful of entries and a demo shows a few. If
    /// something ever needs more than 200, it wants the table.
    /// </remarks>
    public const int Capacity = 200;

    private readonly Lock _gate = new();
    private readonly Queue<SentMessage> _entries = new(Capacity);

    /// <summary>
    /// A snapshot, oldest first. Safe to enumerate while sends are in flight.
    /// </summary>
    /// <remarks>
    /// Copies under the lock and returns the copy. Handing out the live queue would let a caller
    /// enumerate it while another thread enqueues, which throws — and it would throw in the test
    /// that is asserting something else.
    /// </remarks>
    public IReadOnlyList<SentMessage> Snapshot()
    {
        lock (_gate)
        {
            return [.. _entries];
        }
    }

    /// <summary>Records one attempt, dropping the oldest if the ring is full.</summary>
    public void Record(SentMessage message)
    {
        ArgumentNullException.ThrowIfNull(message);

        lock (_gate)
        {
            if (_entries.Count == Capacity)
            {
                _entries.Dequeue();
            }

            _entries.Enqueue(message);
        }
    }

    /// <summary>
    /// Empties it. For a test that wants to assert "the provider was not called".
    /// </summary>
    /// <remarks>
    /// Needed because the integration suite shares one host — `CLAUDE.md`'s one-container rule —
    /// so a previous test's sends are still here. AC-11, AC-12 and AC-13 all assert an *empty*
    /// buffer after a refusal, and without this they would be asserting that no test before them
    /// ever sent anything.
    /// </remarks>
    public void Clear()
    {
        lock (_gate)
        {
            _entries.Clear();
        }
    }
}

/// <summary>
/// One recorded attempt.
/// </summary>
/// <remarks>
/// Carries the <see cref="OutboundMessage"/> verbatim rather than a flattened copy of its fields.
/// AC-2 asserts the recorded body and recipient are <b>byte-identical</b> to what the handler
/// passed — including Arabic — and a flattened copy is a second place for that to stop being
/// true.
/// </remarks>
/// <param name="Message">Exactly what the handler handed over.</param>
/// <param name="ProviderName">Which provider took it, so a multi-provider run is legible.</param>
public sealed record SentMessage(OutboundMessage Message, string ProviderName);
