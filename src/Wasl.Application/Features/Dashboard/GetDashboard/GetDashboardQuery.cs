using MediatR;

namespace Wasl.Application.Features.Dashboard.GetDashboard;

/// <summary>
/// <c>GET /api/dashboard</c> — every block of the screen in one response. US-016.
/// </summary>
/// <remarks>
/// <para>
/// <b>Not an <c>ICommand</c>:</b> it changes no state, so `003`'s transaction and audit
/// behaviours never wrap it and a successful read writes no audit row (BR-9.1). A `401` or a
/// `403` on this route still writes one, from `004b`'s denial handler — a different mechanism
/// that runs before MediatR sees anything.
/// </para>
/// <para>
/// <b>One endpoint, and the role on the token selects the scope</b> (`contracts/dashboard-api.md`,
/// the row it calls its most important). Two endpoints would be two places to keep in step, and
/// the scope is one predicate.
/// </para>
/// <para>
/// <b>The handler is in <c>Wasl.Infrastructure</c></b> —
/// <c>Wasl.Infrastructure.Queries.DashboardAggregatesQuery</c>, the second of exactly two named
/// query classes `CLAUDE.md` sanctions. Every block here is an aggregate over a date spine, a
/// median, or a status/channel spine that must include the empty buckets; none of that is
/// expressible over <c>IApplicationDbContext</c>'s <c>IQueryable</c>s, and two of them
/// (<c>dbo.TicketHistory</c>, <c>dbo.TicketComments</c>) are not on that interface at all.
/// </para>
/// </remarks>
/// <param name="Range">
/// <c>7d</c>, <c>14d</c> or <c>30d</c>. Absent means <c>14d</c> and the response echoes what was
/// actually used, so no client reproduces the arithmetic (AC-15). Anything else is a `400` naming
/// the three accepted values — <b>not</b> a silent fall back to the default, which would answer a
/// different question from the one asked.
///
/// <para>
/// <b>AN ARRAY, FOR ONE VALUE, AND THE REASON WAS MEASURED.</b> The contract says sending
/// <c>range</c> twice is a `400` rather than first-wins. As a <c>string?</c> it was neither: MVC
/// bound <c>?range=7d&amp;range=30d</c> to <c>"7d"</c> and the endpoint answered `200` with a
/// seven-day body — the exact behaviour the contract forbids, and invisible from the response.
/// Repetition is only visible to a validator if the parameter arrives as a collection, which is
/// the same technique `015` uses for its enum filters and for the same reason: a check the model
/// binder performs runs BEFORE <c>ValidationBehaviour</c> and cannot produce a catalogue message.
/// </para>
/// </param>
public sealed record GetDashboardQuery(string[]? Range = null) : IRequest<DashboardSnapshot>
{
    /// <summary>
    /// The single value the caller supplied, or <c>null</c> when they supplied none.
    /// </summary>
    /// <remarks>
    /// Reading <c>[0]</c> is safe here only because the validator has already refused a second
    /// entry — first-wins is exactly the behaviour being prevented, so this property must never
    /// become the place that picks between two values.
    /// </remarks>
    public string? Selected => Range is { Length: > 0 } values ? values[0] : null;
}

/// <summary>
/// The three accepted ranges, and the only place the mapping to a day count lives.
/// </summary>
/// <remarks>
/// <para>
/// <b>A closed set of three literals rather than an integer parameter.</b> An arbitrary
/// <c>?days=</c> would put the size of the date spine — and therefore of every aggregate in the
/// response — under the caller's control, which is BR-7.2's unclamped-page-size defect wearing a
/// different name.
/// </para>
/// <para>
/// <b>Not an enum on the wire.</b> The contract's values are <c>"7d"</c>, <c>"14d"</c>,
/// <c>"30d"</c>; a C# enum member cannot be named <c>7d</c>, so an enum would need a custom
/// converter and the parse would move into the model binder — where `002c` measured that a
/// malformed value is refused BEFORE <c>ValidationBehaviour</c> runs, producing the framework's
/// English sentence instead of the catalogue message that lists what is accepted.
/// </para>
/// </remarks>
public static class DashboardRange
{
    public const string Default = "14d";

    /// <summary>The accepted values, in the order the message catalogue lists them.</summary>
    public static readonly string[] Accepted = ["7d", "14d", "30d"];

    /// <summary>Whether <paramref name="range"/> is accepted. Null is, and means the default.</summary>
    public static bool IsAccepted(string? range) =>
        string.IsNullOrEmpty(range) || Accepted.Contains(range);

    /// <summary>The value actually applied — the echo the response carries.</summary>
    public static string Normalise(string? range) =>
        string.IsNullOrEmpty(range) ? Default : range;

    /// <summary>
    /// How many local days the spine covers, today included.
    /// </summary>
    /// <remarks>
    /// Throws on an unaccepted value rather than defaulting, because by the time this is called
    /// the validator has already refused one — a silent default here would make that validator
    /// deletable without a test going red.
    /// </remarks>
    public static int Days(string? range) => Normalise(range) switch
    {
        "7d" => 7,
        "14d" => 14,
        "30d" => 30,
        var other => throw new ArgumentOutOfRangeException(
            nameof(range),
            other,
            "Unaccepted range reached DashboardRange.Days — GetDashboardQueryValidator should "
            + "have refused it with a 400 first."),
    };
}
