namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// Who is making the request. Answers <i>who</i>; <see cref="IRequestContext"/> answers
/// <i>which request</i>.
/// </summary>
/// <remarks>
/// <para>
/// <b>Two interfaces rather than one, split on subject rather than on feature.</b> `004`
/// needs identity for authorisation and has no use for a user-agent string; the audit row
/// needs both. A single interface carrying everything would make every authorisation check
/// depend on request metadata it does not read. The third option — a separate
/// <c>ICurrentActor</c> for audit, overlapping both — was rejected by the product owner on
/// 2026-08-25: three abstractions for one request's identity.
/// </para>
/// <para>
/// <b>Every member is nullable, and stays nullable after `004`.</b> BR-9.2 has anonymous
/// events: a failed sign-in has no actor, and a background call has no <c>HttpContext</c>.
/// The <c>AuditLog</c> columns are nullable for the same reason, so this is the shape the
/// database already expects rather than a placeholder for one.
/// </para>
/// <para>
/// Until `004` lands, the implementation returns nulls for all three. That is not a stub to
/// be replaced — it is the correct answer to "who is authenticated" in a system with no
/// authentication, and AC-20 tests the snapshot mechanism against it rather than waiting.
/// </para>
/// </remarks>
public interface ICurrentUser
{
    Guid? UserId { get; }

    string? Email { get; }

    /// <summary>
    /// The role as a string, not an enum. The audit row snapshots it verbatim (BR-9.6), and
    /// a string is what survives the role set changing later — a row must keep meaning the
    /// thing it meant when it was written.
    /// </summary>
    string? Role { get; }
}
