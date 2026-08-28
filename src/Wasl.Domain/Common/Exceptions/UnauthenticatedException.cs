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
    : DomainException(DomainErrorCodes.Unauthenticated, "Error.Auth.InvalidCredentials")
{
    /// <summary>
    /// <i>Email or password is incorrect.</i> — not the registry's <i>Authentication is
    /// required.</i>, which describes the other situation this `type` covers. `004b`.
    /// </summary>
    /// <remarks>
    /// The frozen contract specifies both titles under one `type`: a request with no credentials
    /// is told authentication is required, and a request with wrong ones is told they are wrong.
    /// `004` shipped the first on both, so the login screen displayed *Authentication is
    /// required.* to a user who had just supplied credentials — reported by the frontend lane
    /// from a real run.
    /// </remarks>
    public override string TitleKey => "Error.Auth.InvalidCredentials.Title";
}
