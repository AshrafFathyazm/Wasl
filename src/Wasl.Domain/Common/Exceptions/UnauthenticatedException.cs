namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// The credentials were not accepted. `004` AC-4.
/// </summary>
/// <remarks>
/// <para>
/// <b>One exception for three different failures</b> — unknown email, wrong password, deactivated
/// user — and that is the point rather than a shortcut. Distinguishing them turns a login form
/// into a directory: "no such user" tells an attacker which addresses are worth attacking. BR-4.4
/// applies the same reasoning to duplicate customers, where the response names the field and
/// nothing else.
/// </para>
/// <para>
/// It carries no message arguments and no field errors, so the body is identical every time apart
/// from <c>traceId</c>. `002` reserved the <c>unauthenticated</c> registry row for this.
/// </para>
/// </remarks>
public sealed class UnauthenticatedException()
    : DomainException(DomainErrorCodes.Unauthenticated, "Error.Auth.InvalidCredentials");
