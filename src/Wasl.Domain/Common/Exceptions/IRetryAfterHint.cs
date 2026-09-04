namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// A refusal that names how long the caller should wait before retrying. `036`.
/// </summary>
/// <remarks>
/// <para>
/// <b>An interface rather than a second <c>if</c> in the exception handler.</b> `004b` set
/// <c>Retry-After</c> from a type check against <see cref="RateLimitedException"/>, which was
/// correct while exactly one type carried a wait. `036` adds two more —
/// <see cref="TransientConflictException"/> and the general rate limit — and a growing type
/// switch in <c>GlobalExceptionHandler</c> is a list the next feature forgets to extend.
/// </para>
/// <para>
/// <b>The failure of forgetting is silent</b>, which is why this is worth four lines: a `429` or
/// a `503` with no <c>Retry-After</c> tells a client to wait without saying how long, so it
/// retries immediately and the limit achieves nothing. Nothing throws, no test that asserts the
/// status goes red, and the only symptom is load.
/// </para>
/// </remarks>
public interface IRetryAfterHint
{
    /// <summary>
    /// Seconds to wait. Never below one — a <c>Retry-After</c> of zero invites the immediate
    /// retry the header exists to prevent (`004b`, <see cref="RateLimitedException"/>).
    /// </summary>
    int RetryAfterSeconds { get; }
}
