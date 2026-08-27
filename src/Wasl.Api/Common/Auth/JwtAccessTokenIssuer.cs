using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Users;

namespace Wasl.Api.Common.Auth;

/// <summary>
/// Signs the access token. `004` AC-2, AC-3.
/// </summary>
/// <remarks>
/// Reads the same <see cref="JwtOptions"/> the validator does, so the key, issuer, and audience
/// cannot drift apart.
/// </remarks>
internal sealed class JwtAccessTokenIssuer(JwtOptions options, TimeProvider clock)
    : IAccessTokenIssuer
{
    public (string Token, DateTime ExpiresAtUtc) Issue(SupportUser user)
    {
        var issuedAt = clock.GetUtcNow().UtcDateTime;
        var expiresAt = issuedAt.Add(JwtOptions.Lifetime);

        // Short claim names, written literally. ASP.NET Core's inbound claim mapping is turned
        // OFF in Program.cs, so `sub` stays `sub` rather than being rewritten to the long
        // ClaimTypes.NameIdentifier URI — which is why ActorClaimTypes names these and AC-6 is
        // the test. Leaving the mapping on makes HttpContext.User.FindFirst("sub") return null
        // while the token plainly contains it.
        Claim[] claims =
        [
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.Role, user.Role.ToString()),
            new(JwtRegisteredClaimNames.PreferredLanguage, user.PreferredLanguage),

            // A unique id per token. Nothing consumes it yet — there is no revocation list — but
            // without it two tokens issued to one user in the same second are byte-identical, and
            // a log cannot tell one sign-in from another.
            new(JwtRegisteredClaimNames.Jti, Guid.CreateVersion7().ToString()),

            // `iat` written explicitly, and it has to be: JwtSecurityToken emits `nbf` and `exp`
            // from its notBefore/expires arguments but NOT `iat` — it is not derived from either.
            // Observed by decoding a real token from a running instance, where the payload came
            // back with nbf/exp/iss/aud and no iat at all.
            //
            // It matters because `iat` is what a client and an auditor read as "when was this
            // issued". A consumer computing `exp - iat` to find the lifetime gets an exception on
            // a missing claim, not a wrong number, so the absence surfaces somewhere far away.
            new(
                JwtRegisteredClaimNames.IssuedAt,
                new DateTimeOffset(issuedAt, TimeSpan.Zero).ToUnixTimeSeconds()
                    .ToString(CultureInfo.InvariantCulture),
                ClaimValueTypes.Integer64),
        ];

        var token = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims: claims,
            notBefore: issuedAt,
            expires: expiresAt,
            signingCredentials: new SigningCredentials(options.Key(), SecurityAlgorithms.HmacSha256));

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}

/// <summary>
/// The claim names this application issues and reads. One list, so the issuer and the reader
/// cannot disagree.
/// </summary>
internal static class JwtRegisteredClaimNames
{
    public const string Sub = "sub";
    public const string Email = "email";
    public const string Role = "role";
    public const string PreferredLanguage = "preferred_language";
    public const string Jti = "jti";
    public const string IssuedAt = "iat";
}
