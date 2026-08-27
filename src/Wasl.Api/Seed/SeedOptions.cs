namespace Wasl.Api.Seed;

/// <summary>
/// The seeded users' passwords. Bound from <c>Seed:*</c> configuration, with **no default**.
/// `004` AC-12.
/// </summary>
/// <remarks>
/// <para>
/// <b>There is deliberately no fallback value.</b> A development default is a committed
/// credential wearing a different hat: it reaches production the first time someone deploys
/// without setting the variable, and nothing anywhere reports it — the application starts, the
/// sign-in works, and the password is in a public repository.
/// </para>
/// <para>
/// <b>Validated at startup rather than at seeding time</b>, for the same reason
/// <see cref="Wasl.Api.Common.Auth.JwtOptions"/> is: a configuration mistake should be loud at
/// the moment the process starts, not on the first request that happens to need it.
/// </para>
/// </remarks>
internal sealed class SeedOptions
{
    public const string Section = "Seed";

    /// <summary>
    /// Short enough to type in a demo, long enough not to be a joke. There is no password policy
    /// in this build — `004` is out of scope for one, and inventing an unenforced minimum here
    /// would be a rule that exists only in a comment.
    /// </summary>
    public const int MinimumPasswordLength = 8;

    public string ManagerPassword { get; init; } = string.Empty;

    public string AgentPassword { get; init; } = string.Empty;

    public static SeedOptions From(IConfiguration configuration)
    {
        var options = configuration.GetSection(Section).Get<SeedOptions>() ?? new SeedOptions();

        Require(options.ManagerPassword, nameof(ManagerPassword));
        Require(options.AgentPassword, nameof(AgentPassword));

        return options;
    }

    /// <summary>
    /// Throws naming the configuration key and never the value.
    /// </summary>
    /// <remarks>
    /// The value is withheld on purpose: a startup exception is written to a console, a container
    /// log, and usually an aggregator, and a message that echoes the password puts it in all
    /// three at once.
    /// </remarks>
    private static void Require(string value, string key)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(
                $"{Section}:{key} is not configured. Set it with user-secrets for local "
                + "development, or an environment variable in a deployed environment. There is "
                + "deliberately no default, because a default password is a committed credential.");
        }

        if (value.Length < MinimumPasswordLength)
        {
            throw new InvalidOperationException(
                $"{Section}:{key} must be at least {MinimumPasswordLength} characters.");
        }
    }
}
