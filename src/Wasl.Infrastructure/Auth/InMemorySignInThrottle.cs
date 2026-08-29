using System.Collections.Concurrent;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Infrastructure.Auth;

/// <summary>
/// The sign-in throttle, in memory. `004b` AC-35 to AC-37.
/// </summary>
/// <remarks>
/// <para>
/// <b>Ten failures in five minutes per (address, email) pair</b> — the product owner's numbers.
/// A success records nothing, so someone who mistypes twice and then succeeds is never slowed.
/// </para>
/// <para>
/// <b>In memory, per process, and that limit is stated rather than hidden.</b> Two instances behind
/// a load balancer each count to ten, so the effective limit is ten times the instance count; a
/// restart forgets everything. Making it durable means a shared store and a new dependency, which
/// is a larger decision than this feature was approved for — and the honest framing is unchanged
/// either way: **it slows a script, it does not stop a determined attacker.**
/// </para>
/// <para>
/// A sliding window rather than a fixed one, because the implementation is the same three lines
/// once the timestamps are kept: a fixed window lets twenty attempts through across a boundary,
/// which is the number the ruling was choosing against.
/// </para>
/// </remarks>
internal sealed class InMemorySignInThrottle(TimeProvider clock) : ISignInThrottle
{
    /// <summary>The product owner's numbers, 2026-08-29.</summary>
    public const int MaxFailures = 10;

    public static readonly TimeSpan Window = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Failure timestamps per (address, email) pair.
    /// </summary>
    /// <remarks>
    /// The email is lowercased into the key so <c>ALI@…</c> and <c>ali@…</c> share a bucket —
    /// otherwise changing the casing resets the counter, which is a one-character bypass.
    /// </remarks>
    private readonly ConcurrentDictionary<string, List<DateTimeOffset>> _failures = new(StringComparer.Ordinal);

    public int? RetryAfterSeconds(string? ipAddress, string email)
    {
        var recent = Recent(Key(ipAddress, email), out var oldest);

        if (recent < MaxFailures)
        {
            return null;
        }

        // Ceiling, and never below one: a Retry-After of 0 invites an immediate retry, which is
        // the behaviour this exists to prevent.
        var wait = (oldest + Window) - clock.GetUtcNow();

        return Math.Max(1, (int)Math.Ceiling(wait.TotalSeconds));
    }

    public void RecordFailure(string? ipAddress, string email)
    {
        var key = Key(ipAddress, email);
        var now = clock.GetUtcNow();

        _failures.AddOrUpdate(
            key,
            _ => [now],
            (_, existing) =>
            {
                lock (existing)
                {
                    // Pruned on write, so the dictionary does not grow without bound for an
                    // address that stops failing. There is no background sweep: an entry that is
                    // never touched again holds at most ten timestamps, which is cheaper than a
                    // timer that has to be disposed correctly.
                    existing.RemoveAll(at => now - at >= Window);
                    existing.Add(now);
                    return existing;
                }
            });
    }

    private int Recent(string key, out DateTimeOffset oldest)
    {
        oldest = default;

        if (!_failures.TryGetValue(key, out var timestamps))
        {
            return 0;
        }

        var now = clock.GetUtcNow();

        lock (timestamps)
        {
            var live = timestamps.Where(at => now - at < Window).ToList();

            if (live.Count > 0)
            {
                oldest = live[0];
            }

            return live.Count;
        }
    }

    /// <summary>
    /// (address, email) — the pair, not either alone.
    /// </summary>
    /// <remarks>
    /// See <see cref="ISignInThrottle"/> for why: IP alone locks out an office behind one NAT
    /// address (AC-37), and email alone is the account lockout the ruling rejected, because anyone
    /// who knows an address could lock its owner out from anywhere.
    /// </remarks>
    private static string Key(string? ipAddress, string email) =>
        $"{ipAddress ?? "unknown"}|{email.Trim().ToLowerInvariant()}";
}
