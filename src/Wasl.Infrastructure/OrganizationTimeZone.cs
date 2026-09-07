using Microsoft.Extensions.Configuration;

namespace Wasl.Infrastructure;

/// <summary>
/// The organisation's timezone, resolved once at startup. <c>Wasl:OrganizationTimeZone</c>.
/// </summary>
/// <remarks>
/// <para>
/// <b>Every local day on the dashboard is expressed in this zone, and the response names it</b>
/// (AC-6) — so a reader can tell which midnight the bars break on instead of assuming their own.
/// </para>
/// <para>
/// <b>An unrecognised id fails startup.</b> The alternative is a fallback to UTC, which for
/// <c>Asia/Riyadh</c> shifts every bucket boundary by three hours: a ticket created at 22:00 local
/// lands on the following day, the chart still looks like a plausible fortnight, and nothing
/// anywhere reports an error. That is the most common silently-wrong thing in a dashboard and it
/// is invisible to anyone testing in UTC, so the check is at startup where it is loud.
/// </para>
/// <para>
/// <b>IANA ids, on Windows too.</b> .NET resolves them through ICU on every platform since .NET 6,
/// so <c>Asia/Riyadh</c> works on the developer's Windows machine and in a Linux container without
/// a second name in configuration. A Windows id (<c>Arab Standard Time</c>) also resolves, and is
/// not what this file documents — one spelling in one place.
/// </para>
/// </remarks>
public sealed class OrganizationTimeZone
{
    public const string Key = "Wasl:OrganizationTimeZone";

    /// <summary>
    /// The default, and it is a real business fact rather than a placeholder: the product is
    /// Saudi, `11-dashboard.md` draws <c>Asia/Riyadh</c> in the header, and a zone-less
    /// installation would otherwise silently mean UTC.
    /// </summary>
    public const string DefaultId = "Asia/Riyadh";

    private OrganizationTimeZone(TimeZoneInfo zone, string id)
    {
        Zone = zone;
        Id = id;
    }

    /// <summary>The resolved zone. Used to build the day spine and nothing else.</summary>
    public TimeZoneInfo Zone { get; }

    /// <summary>
    /// The id as configured, echoed to the client verbatim.
    /// </summary>
    /// <remarks>
    /// Not <c>Zone.Id</c>: on Windows that comes back as the Windows name even when an IANA id was
    /// supplied, and the response would then name a zone the configuration never mentions.
    /// </remarks>
    public string Id { get; }

    /// <summary>Reads the section, or throws at startup.</summary>
    public static OrganizationTimeZone From(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var id = configuration[Key];

        if (string.IsNullOrWhiteSpace(id))
        {
            id = DefaultId;
        }

        try
        {
            return new OrganizationTimeZone(TimeZoneInfo.FindSystemTimeZoneById(id), id);
        }
        catch (Exception exception)
            when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            throw new InvalidOperationException(
                $"{Key} is '{id}', which this machine cannot resolve to a timezone. Use an IANA id "
                + $"such as '{DefaultId}'. There is deliberately no fallback to UTC: every "
                + "dashboard day boundary would move by the zone's offset, every bucket would "
                + "still be populated, and nothing would report an error.",
                exception);
        }
    }
}
