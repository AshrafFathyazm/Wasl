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
/// </remarks>
public sealed class RateLimitedException(int retryAfterSeconds)
    : DomainException(DomainErrorCodes.RateLimited, "Error.Auth.RateLimited")
{
    public int RetryAfterSeconds { get; } = retryAfterSeconds;
}
