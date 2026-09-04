namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// Too many failed attempts. Mapped to <c>429 errors/rate-limited</c>. `004b` AC-35.
/// </summary>
/// <remarks>
/// <para>
/// <b>It carries the wait, because the response carries <c>Retry-After</c>.</b> A client told to
/// wait and not told how long retries immediately, which is the behaviour the limit exists to
/// prevent.
/// </para>
/// <para>
/// <b>It says nothing about the account.</b> Not whether the email exists, not how many attempts
/// remain, not when the first one was — the same reasoning that makes a wrong password and an
/// unknown email produce one identical `401` (`004` AC-4). A throttle that answers differently for
/// a real address than for an invented one is an enumeration oracle wearing a rate limit.
/// </para>
/// <para>
/// <b>And it is raised before the credentials are checked</b>, so being throttled reveals nothing
/// about whether the password was right.
/// </para>
/// <para>
/// <b>`036` gave it a second producer and therefore a second message.</b> The general write
/// limiter raises the same <c>type</c> — a client backs off identically for both — but the two
/// sentences must differ, because "too many sign-in attempts" shown to a Manager who has been
/// creating tickets all morning is simply false. The <c>messageKey</c> parameter is how, and it
/// defaults to `004b`'s so nothing that already raised this had to change.
/// </para>
/// <para>
/// <b>It implements <see cref="IRetryAfterHint"/> rather than being type-checked</b>, which is
/// `036`'s change to how <c>Retry-After</c> reaches the wire — see that interface for why a type
/// switch was the wrong shape once a second type carried a wait.
/// </para>
/// </remarks>
public sealed class RateLimitedException(
    int retryAfterSeconds,
    string messageKey = "Error.Auth.RateLimited",
    string? titleKey = null)
    : DomainException(DomainErrorCodes.RateLimited, messageKey), IRetryAfterHint
{
    /// <inheritdoc />
    /// <remarks>
    /// Never below one, for the reason `004b` recorded in <c>InMemorySignInThrottle</c>: a
    /// <c>Retry-After</c> of zero invites an immediate retry, which is the behaviour this exists
    /// to prevent. The throttle already clamps; this clamps again because the general limiter is
    /// a second, independent caller.
    /// </remarks>
    public int RetryAfterSeconds { get; } = Math.Max(1, retryAfterSeconds);

    /// <inheritdoc />
    public override string? TitleKey { get; } = titleKey;
}
