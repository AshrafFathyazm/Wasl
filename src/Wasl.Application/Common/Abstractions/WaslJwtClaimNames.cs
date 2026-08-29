namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// The claim names this application issues and reads. One list, so the issuer and the reader
/// cannot disagree.
/// </summary>
/// <remarks>
/// <para>
/// <b>Named <c>Wasl…</c> deliberately.</b> It was <c>JwtRegisteredClaimNames</c>, which is the
/// exact name of <c>System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames</c> — and that
/// namespace was imported in the same file. Every reference silently bound to the local type, so
/// the two could have drifted apart with the code still reading as if it used the framework's
/// list. A shadowing name is not a compile error; it is a reader error.
/// </para>
/// <para>
/// <b>In <c>Wasl.Application</c> rather than beside the issuer, and that is the point of the
/// "one list" above.</b> The issuer lives in <c>Wasl.Infrastructure</c> and the reader —
/// <c>ActorClaimTypes</c>, the JWT bearer setup — lives in <c>Wasl.Api</c>. Application is the
/// only project both of them see, so this is the one home that keeps a single list without
/// making the reader depend on the writer. It sits beside <see cref="IAccessTokenIssuer"/>
/// because it describes what that abstraction produces.
/// </para>
/// <para>
/// These are wire values, not display strings. They are never localized (BR-8.8), and
/// <c>MapInboundClaims = false</c> in `004` is what makes the short names survive the round trip
/// instead of becoming WS-Federation URIs.
/// </para>
/// </remarks>
public static class WaslJwtClaimNames
{
    public const string Sub = "sub";
    public const string Email = "email";
    public const string Role = "role";
    public const string PreferredLanguage = "preferred_language";
    public const string Jti = "jti";
    public const string IssuedAt = "iat";
}
