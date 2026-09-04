namespace Wasl.Application.Features.Customers.GetCustomers;

/// <summary>
/// The repeated and enumerated query parameters of <c>GET /api/customers</c>. `033` §5.1–5.2.
/// </summary>
/// <remarks>
/// <para>
/// <b>A sibling of <c>TicketFilters</c> rather than a reuse of it, and the reason is the shape
/// of what they parse.</b> `015`'s helper parses REPEATED enum parameters — four of them, all
/// closed sets from the domain. This one parses two SINGLE enums that exist only on the wire
/// (<c>sort</c>, <c>dir</c>) plus one repeated FREE-TEXT parameter (<c>company</c>), which no
/// enum covers. Generalising the two would produce a helper whose signature is a union of both
/// jobs, and the digit rule below is the only line they would actually share.
/// </para>
/// <para>
/// <b>The digit rule IS shared, deliberately duplicated, and it is four lines.</b>
/// <c>Enum.TryParse</c> returns <c>true</c> for <c>"1"</c> — yielding whatever member happens to
/// sit at that ordinal — and for values outside the enum entirely, so <c>?sort=1</c> would
/// silently order by something the caller never asked for. `009` shipped exactly that class of
/// defect through a <c>DEFAULT</c> the caller could not see, and `015` names it in its own
/// summary. Copying four lines is cheaper than a shared abstraction over two different shapes,
/// and the copy is commented at both ends.
/// </para>
/// </remarks>
internal static class CustomerFilters
{
    /// <summary>
    /// BR-7.2's clamp-never-reject, applied to a repeated parameter. `015` chose the same 20.
    /// </summary>
    /// <remarks>
    /// An unbounded repeated parameter is a denial of service from one URL: a query string the
    /// server has to bind and an <c>IN</c> list SQL Server has to plan. The same shape as the
    /// unclamped <c>pageSize</c> in <c>CLAUDE.md</c>'s write checklist.
    /// </remarks>
    internal const int MaxValues = 20;

    /// <summary>
    /// The supplied company names, trimmed, de-duplicated case-insensitively, clamped.
    /// </summary>
    /// <remarks>
    /// <b>De-duplication is case-INSENSITIVE because the match is</b> — the column carries an
    /// explicit CI collation (`008`), so <c>?company=Acme&amp;company=ACME</c> is one filter
    /// value asked for twice, and letting it count as two spends a clamp slot on nothing.
    /// </remarks>
    internal static IReadOnlyList<string> Companies(IReadOnlyList<string>? values) =>
        values is null
            ? []
            : values
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(MaxValues)
                .ToList();

    /// <summary>
    /// Parses one wire value of an enum, or <c>null</c> when it is absent or unreadable.
    /// </summary>
    /// <remarks>
    /// Absent and unreadable are DIFFERENT and the caller must treat them so: absent takes the
    /// default, unreadable is a `400` (§5.5). <c>null</c> here means "no usable value", and
    /// <see cref="IsUnreadable{TEnum}"/> is what separates the two.
    /// </remarks>
    internal static TEnum? Parse<TEnum>(string? value)
        where TEnum : struct, Enum =>
        TryParseOne<TEnum>(value, out var parsed) ? parsed : null;

    /// <summary>Supplied, and not a member of the enum. §5.5 — a `400`, never a fallback.</summary>
    internal static bool IsUnreadable<TEnum>(string? value)
        where TEnum : struct, Enum =>
        !string.IsNullOrWhiteSpace(value) && !TryParseOne<TEnum>(value, out _);

    /// <summary>The accepted values, for the message. Read from the enum, never transcribed.</summary>
    /// <remarks>
    /// `009` hand-transcribed an enum from a contract example and shipped two invented members.
    /// `015` pre-empted the same defect with a test asserting every message names every member;
    /// this reads the members instead, so there is nothing to fall out of step.
    /// </remarks>
    internal static string Accepted<TEnum>()
        where TEnum : struct, Enum =>
        string.Join(", ", Enum.GetNames<TEnum>().Select(Camel));

    /// <summary>
    /// The wire spelling. The contract says <c>fullName</c> and <c>createdAtUtc</c>, which are
    /// the CLR names with a lowered first letter — computed rather than listed, for the reason
    /// <see cref="Accepted{TEnum}"/> gives.
    /// </summary>
    internal static string Camel(string name) =>
        name.Length == 0 ? name : char.ToLowerInvariant(name[0]) + name[1..];

    private static bool TryParseOne<TEnum>(string? value, out TEnum parsed)
        where TEnum : struct, Enum
    {
        parsed = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();

        /* THE GUARD THAT MAKES `?sort=1` A 400 — the duplicated four lines the class comment
         * names. `Enum.TryParse` accepts an ordinal, including one no member has, so without
         * this the request succeeds and orders by something the caller never asked for. */
        if (trimmed.All(character => char.IsAsciiDigit(character) || character is '-' or '+'))
        {
            return false;
        }

        return Enum.TryParse(trimmed, ignoreCase: true, out parsed)
            && Enum.IsDefined(parsed);
    }
}

/// <summary>What <c>GET /api/customers</c> may be ordered by. `033` §5.1.</summary>
/// <remarks>
/// <b>Two members, and adding a third is a contract change.</b> The set is deliberately not
/// "any column": an unknown value is a `400` precisely so a client cannot discover an ordering
/// the server never promised to keep stable.
/// </remarks>
internal enum CustomerSort
{
    /// <summary>The default, and what `008` shipped.</summary>
    FullName,

    /// <summary>
    /// Newest or oldest first. <b>Ties are the ordinary case here, not an edge</b> —
    /// <c>RequestTimestamp</c> truncates to <c>datetime2(3)</c> and <c>--seed</c> writes many
    /// customers inside one request — which is why the ordering always ends <c>ThenBy(Id)</c>.
    /// </summary>
    CreatedAtUtc,
}

/// <summary>Ascending or descending. `033` §5.1.</summary>
internal enum SortDirection
{
    Asc,
    Desc,
}
