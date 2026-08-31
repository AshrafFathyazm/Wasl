using System.Globalization;

namespace Wasl.Application.Features.Tickets.GetTickets;

/// <summary>
/// Reads <c>?createdFrom=</c> and <c>?createdTo=</c> in either calendar. `015`, extended
/// 2026-08-31.
/// </summary>
/// <remarks>
/// <para>
/// <b>The Gregorian half already worked. This exists because the Hijri half FAILED SILENTLY,
/// and that was measured on a running instance:</b>
/// </para>
/// <code>
/// ?createdFrom=1448-03-05   ->  200, totalCount 186   ← every ticket in the table
/// </code>
/// <para>
/// A Hijri date is a perfectly valid Gregorian one. <c>1448-03-05</c> binds to
/// <c>DateOnly</c> as the fifth of March in the year 1448, every ticket was created after it,
/// and the endpoint returns the whole table with a <c>200</c>. **Nothing errors and the filter
/// looks like it ran** — which is the failure class this repository keeps writing rules about.
/// </para>
/// <para>
/// <b>So the calendar is DECLARED, never guessed.</b> <c>?calendar=hijri</c> applies to both
/// bounds. A year-range heuristic — "1448 must be Hijri because it is not near 2026" — was
/// rejected: it is right until it is not, it is invisible when it is wrong, and it would put a
/// second, undocumented rule about what a date means into a query string.
/// </para>
/// <para>
/// <b>And an undeclared date with an implausible year is refused rather than obeyed.</b> That
/// is what turns the measurement above from a silent wrong answer into a sentence naming
/// <c>calendar=hijri</c>. A Gregorian year below 1900 in a support system is not a date
/// somebody meant.
/// </para>
/// <para>
/// <b>Um al-Qura, not <c>HijriCalendar</c>.</b> <c>UmAlQuraCalendar</c> is the civil calendar
/// Saudi Arabia actually uses and the one <c>Intl.DateTimeFormat('ar-SA')</c> produces in the
/// browser, so a date the picker displayed round-trips. <c>HijriCalendar</c> is the tabular
/// astronomical one and differs by a day often enough to matter at a month boundary — which is
/// precisely where a range filter is used.
/// </para>
/// </remarks>
internal static class DateRangeFilter
{
    /// <summary>The one accepted value of <c>?calendar=</c>. Anything else is a <c>400</c>.</summary>
    internal const string Hijri = "hijri";

    /// <summary>Its counterpart, accepted explicitly so a client can be unambiguous.</summary>
    internal const string Gregorian = "gregorian";

    /// <summary>
    /// Below this, an undeclared date is treated as a mistake rather than as the year 1448.
    /// </summary>
    /// <remarks>
    /// Not a guess at the calendar — a refusal to guess. The value is only ever used to decide
    /// whether to ANSWER or to REFUSE, never to reinterpret.
    /// </remarks>
    internal const int ImplausibleGregorianYearBelow = 1900;

    private static readonly UmAlQuraCalendar UmAlQura = new();

    internal static bool IsKnownCalendar(string? calendar) =>
        string.IsNullOrWhiteSpace(calendar)
        || calendar.Trim().Equals(Hijri, StringComparison.OrdinalIgnoreCase)
        || calendar.Trim().Equals(Gregorian, StringComparison.OrdinalIgnoreCase);

    private static bool IsHijri(string? calendar) =>
        !string.IsNullOrWhiteSpace(calendar)
        && calendar.Trim().Equals(Hijri, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// The Gregorian day a bound means, or null when it is absent or unreadable.
    /// </summary>
    /// <remarks>
    /// <b>Exact parsing, <c>yyyy-MM-dd</c>, invariant culture.</b> <c>DateOnly.TryParse</c>
    /// without a format would accept <c>31/08/2026</c> under one culture and read it as the
    /// eighth of the thirty-first month under another — a filter whose meaning depends on the
    /// server's locale is a filter nobody can reason about from a URL.
    /// </remarks>
    internal static DateOnly? Parse(string? raw, string? calendar)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var parts = raw.Trim().Split('-');

        if (parts.Length != 3
            || !int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var year)
            || !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var month)
            || !int.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out var day))
        {
            return null;
        }

        if (!IsHijri(calendar))
        {
            return DateOnly.TryParseExact(
                raw.Trim(), "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var gregorian)
                ? gregorian
                : null;
        }

        /* Um al-Qura covers roughly 1318–1500 AH and THROWS outside it rather than clamping —
         * which is the behaviour to want, and the reason this is a try/catch instead of a range
         * check written here: duplicating the calendar's own limits would put a second copy of
         * them in this file, to drift the first time the framework's table is extended. */
        try
        {
            var converted = UmAlQura.ToDateTime(year, month, day, 0, 0, 0, 0);
            return DateOnly.FromDateTime(converted);
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    /// <summary>
    /// Whether a supplied bound could not be read — a <c>400</c>, never a dropped filter.
    /// </summary>
    internal static bool IsUnreadable(string? raw, string? calendar) =>
        !string.IsNullOrWhiteSpace(raw) && Parse(raw, calendar) is null;

    /// <summary>
    /// Whether an UNDECLARED date carries a year no Gregorian date in this product would.
    /// </summary>
    /// <remarks>
    /// The whole point of the class, in one predicate: <c>?createdFrom=1448-03-05</c> with no
    /// <c>?calendar=</c> stops being "every ticket ever" and becomes a message that names the
    /// parameter that would have made it mean what the caller intended.
    /// </remarks>
    internal static bool LooksHijriButUndeclared(string? raw, string? calendar)
    {
        if (IsHijri(calendar) || string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        var parts = raw.Trim().Split('-');

        return parts.Length == 3
            && int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var year)
            && year < ImplausibleGregorianYearBelow;
    }
}
