using Wasl.Domain.Users;

namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// Issues the signed access token. Declared here, implemented in <c>Wasl.Api</c>.
/// </summary>
/// <remarks>
/// <b>Implemented in <c>Wasl.Api</c>, not <c>Wasl.Infrastructure</c></b>, and for a reason worth
/// stating: a JWT is an HTTP-transport concern, and the signing key, issuer, and audience are the
/// same configuration <c>AddAuthentication</c> validates with. Splitting the pair — issue here,
/// validate there — is how a token starts being signed with one key and checked against another.
/// </remarks>
public interface IAccessTokenIssuer
{
    /// <summary>The token and the instant it expires.</summary>
    /// <remarks>
    /// <c>ExpiresAtUtc</c> is returned so the response can carry it (`004` AC-3) and the client
    /// never has to decode the JWT. The contract is explicit that <c>accessToken</c> is opaque:
    /// a client that decodes it to read <c>role</c> starts depending on a shape the server is
    /// free to change.
    /// </remarks>
    (string Token, DateTime ExpiresAtUtc) Issue(SupportUser user);
}
