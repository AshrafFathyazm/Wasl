using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Wasl.Api.Common.Auth;

/// <summary>
/// The signing key, issuer, audience, and lifetime. Bound from <c>Jwt:*</c> configuration.
/// </summary>
/// <remarks>
/// <b>One object read by both the issuer and the validator</b>, so a token cannot be signed with
/// one key and checked against another. Splitting them across two configuration sections is how
/// that happens, and it presents as "every token is invalid" with nothing wrong in either half.
/// </remarks>
internal sealed class JwtOptions
{
    public const string Section = "Jwt";

    /// <summary>
    /// The minimum key length. HS256 uses a 256-bit key, so anything shorter is padded — and a
    /// padded key is a shorter key pretending.
    /// </summary>
    public const int MinimumKeyBytes = 32;

    /// <summary>8 hours (`004` AC-3). One working day, not a number picked for roundness.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(8);

    public string SigningKey { get; init; } = string.Empty;

    public string Issuer { get; init; } = "wasl";

    public string Audience { get; init; } = "wasl-api";

    /// <summary>
    /// Reads and validates the section, or throws at startup.
    /// </summary>
    /// <remarks>
    /// <b>Fails to start rather than starting insecurely</b> (AC-11). A missing key would
    /// otherwise mean either a random key per restart — every token invalid after a deploy, with
    /// no error anywhere — or a hard-coded fallback, which is a signing key in a public
    /// repository. Neither failure announces itself, so the check is at startup where it is loud.
    /// </remarks>
    public static JwtOptions From(IConfiguration configuration)
    {
        var options = configuration.GetSection(Section).Get<JwtOptions>() ?? new JwtOptions();

        if (string.IsNullOrWhiteSpace(options.SigningKey))
        {
            throw new InvalidOperationException(
                $"{Section}:SigningKey is not configured. Set it with user-secrets for local "
                + "development, or an environment variable in a deployed environment. There is "
                + "deliberately no default: a random key per restart invalidates every token "
                + "silently, and a hard-coded one is a signing key in the repository.");
        }

        if (Encoding.UTF8.GetByteCount(options.SigningKey) < MinimumKeyBytes)
        {
            throw new InvalidOperationException(
                $"{Section}:SigningKey must be at least {MinimumKeyBytes} bytes for HS256. "
                + "A shorter key is padded, which makes it a shorter key pretending to be a "
                + "longer one.");
        }

        return options;
    }

    public SymmetricSecurityKey Key() => new(Encoding.UTF8.GetBytes(SigningKey));
}
