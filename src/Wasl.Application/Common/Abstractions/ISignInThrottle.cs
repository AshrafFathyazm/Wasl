namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// Slows repeated failed sign-ins. `004b` AC-35, AC-36, AC-37.
/// </summary>
/// <remarks>
/// <para>
/// <b>What it is honestly for, in the product owner's words: it slows a script, it does not stop a
/// determined attacker.</b> Anything claiming more than that gives false assurance — a distributed
/// guesser changes address and starts again, and this is a per-process in-memory counter with no
/// shared state.
/// </para>
/// <para>
/// <b>Not ASP.NET Core's rate limiter, and the reason is the ruling.</b> Only *failed* attempts
/// count, and a limiter partitions the request before the endpoint runs, so it cannot know whether
/// the credentials were right. Counting every attempt would throttle a user typing their password
/// correctly ten times in five minutes, which is a working day for anyone on a shared machine.
/// </para>
/// <para>
/// <b>Keyed by IP AND email, which resolves a conflict between the ruling and AC-37.</b> The ruling
/// says "per IP, and no account lockout"; AC-37 says a successful sign-in must not be blocked by
/// another user's failures from the same address. IP alone violates AC-37 — an office behind one
/// NAT address locks out its own staff. Email alone is the lockout the ruling rejects, because
/// anyone who knows an address could then lock its owner out from anywhere.
/// </para>
/// <para>
/// The pair satisfies both: a burst against one account from one address blocks that pair only. A
/// colleague on the same address is a different key, and the same account from a different address
/// is a different key — so there is no way to lock a named user out of the product.
/// </para>
/// </remarks>
public interface ISignInThrottle
{
    /// <summary>
    /// Whether this address has already failed too often against this address-and-email pair.
    /// </summary>
    /// <returns>
    /// The seconds until the window frees, or <c>null</c> when the attempt may proceed.
    /// </returns>
    /// <remarks>
    /// Returns the wait rather than a bool, because the response carries <c>Retry-After</c>
    /// (AC-35). A client that is told to wait and not told how long retries immediately.
    /// </remarks>
    int? RetryAfterSeconds(string? ipAddress, string email);

    /// <summary>Records one failed attempt. Success records nothing.</summary>
    void RecordFailure(string? ipAddress, string email);
}
