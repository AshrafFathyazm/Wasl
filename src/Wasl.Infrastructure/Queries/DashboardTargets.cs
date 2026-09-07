using Microsoft.Extensions.Configuration;

namespace Wasl.Infrastructure.Queries;

/// <summary>
/// The two numbers the dashboard's medians are measured against. <c>Wasl:Targets:*</c>.
/// </summary>
/// <remarks>
/// <para>
/// <b>Added 2026-09-07, from the revised canvas</b>, which prints <c>target 2h</c> beside the
/// median first reply and <c>target 1d</c> beside the median resolution, and shades the bar amber
/// when the median is over. Both values are the product owner's, supplied in that canvas.
/// </para>
/// <para>
/// <b>THIS IS NOT AN SLA.</b> An SLA is a per-ticket commitment with a deadline, a countdown and
/// breach semantics; `027` left every SLA region of the ticket screen unbuilt for the reason
/// `CLAUDE.md` records — a countdown drawn from nothing looks exactly like a working one. These are
/// two org-wide numbers compared against two aggregates the endpoint already computes. Nothing here
/// says anything about an individual ticket, and the canvas's "2 breaching" footnote is
/// deliberately NOT built.
/// </para>
/// <para>
/// <b>Configuration rather than constants, and it has a default.</b> A target is a business
/// decision that changes without a deployment — but unlike a signing key there is nothing unsafe
/// about a default, and a dashboard that refused to start because nobody had set a target would be
/// the wrong trade. The defaults are the canvas's own values.
/// </para>
/// <para>
/// <b>Moved from the project root into <c>Queries/</c> on 2026-09-07</b>, beside its only
/// consumer (<c>DashboardAggregatesQuery</c>). It sat loose at the root while every other options type in this
/// layer sits with the code that reads it — <c>Auth/JwtOptions.cs</c>,
/// <c>Persistence/Seed/SeedOptions.cs</c> — and the "Placement cleanup" of 2026-08-29 is the same
/// move for the same reason. No behaviour changed; the namespace did.
/// </para>
/// </remarks>
public sealed class DashboardTargets
{
    public const string Section = "Wasl:Targets";

    /// <summary>Two hours — the canvas's <c>target 2h</c>.</summary>
    public const int DefaultFirstReplyMinutes = 120;

    /// <summary>One day — the canvas's <c>target 1d</c>.</summary>
    public const int DefaultResolutionMinutes = 1440;

    public int FirstReplyMinutes { get; init; } = DefaultFirstReplyMinutes;

    public int ResolutionMinutes { get; init; } = DefaultResolutionMinutes;

    /// <summary>
    /// Reads the section, falling back to the canvas's values, and refuses a non-positive target.
    /// </summary>
    /// <remarks>
    /// A zero or negative target would put the median "over" by definition and paint the bar amber
    /// forever — a screen permanently reporting failure, from a configuration typo, with nothing
    /// anywhere reporting an error. Loud at startup instead.
    /// </remarks>
    public static DashboardTargets From(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var targets = configuration.GetSection(Section).Get<DashboardTargets>() ?? new DashboardTargets();

        if (targets.FirstReplyMinutes <= 0 || targets.ResolutionMinutes <= 0)
        {
            throw new InvalidOperationException(
                $"{Section}:FirstReplyMinutes and {Section}:ResolutionMinutes must both be greater "
                + $"than zero (got {targets.FirstReplyMinutes} and {targets.ResolutionMinutes}). A "
                + "non-positive target makes every median \"over\" by definition, so the dashboard "
                + "would report failure permanently and silently.");
        }

        return targets;
    }
}
