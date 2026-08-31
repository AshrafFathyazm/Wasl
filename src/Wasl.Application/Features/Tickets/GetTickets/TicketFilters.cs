namespace Wasl.Application.Features.Tickets.GetTickets;

/// <summary>
/// Parsing and clamping for the repeated enum filters. `015` AC-4, AC-5, AC-10.
/// </summary>
/// <remarks>
/// <para>
/// <b>The filters bind as STRINGS at the controller, deliberately, and this is what parses them.</b>
/// Binding <c>TicketStatus[]</c> directly would be shorter and would make AC-10 impossible:
/// `002c` measured that the model binder refuses a malformed value <b>before</b> the MediatR
/// pipeline runs, so <c>ValidationBehaviour</c> never executes, the message comes from the
/// framework in English, and it cannot list the accepted values. AC-10 asks for exactly that list,
/// so the parse has to happen somewhere FluentValidation can see it.
/// </para>
/// <para>
/// <b>A numeric string is rejected even though <c>Enum.TryParse</c> accepts it.</b>
/// <c>Enum.TryParse&lt;TicketStatus&gt;("3", out _)</c> returns <c>true</c> and yields
/// <c>PendingCustomer</c> — and <c>"7"</c> also returns <c>true</c>, yielding a value no member
/// has. The API contract says enums travel as strings, so <c>?status=3</c> is a client that has
/// guessed at the wire format and must be told, not quietly obeyed. This is the same class of
/// defect as `009`'s <c>DEFAULT 'Normal'</c> overriding a caller's <c>Low</c>: the request
/// succeeds and means something the caller did not ask for.
/// </para>
/// <para>
/// <b>Case is normalised, by ruling</b> (`spec.md`, Q-6-adjacent): <c>?status=open</c> is accepted.
/// Rejecting a case variant of a correct value is a worse failure than normalising it.
/// </para>
/// <para>
/// <b>Clamped at twenty values, never rejected</b> — BR-7.2's clamp-never-reject, applied the way
/// `033` applied it to <c>?company=</c> on the same day and for the same reason: a repeated query
/// parameter with no bound is a denial of service from one URL, and an <c>IN</c> list SQL Server
/// has to plan. `CLAUDE.md`'s write checklist carries the <c>pageSize</c> version of this row.
/// Duplicates collapse first, so <c>?status=Open&amp;status=Open</c> is one value and not two
/// (`spec.md`: a duplicate value is a set, not a multiplier).
/// </para>
/// </remarks>
internal static class TicketFilters
{
    /// <summary>The most values one repeated filter may carry. Excess is dropped, not refused.</summary>
    internal const int MaxValues = 20;

    /// <summary>
    /// The values that parsed, de-duplicated and clamped. Values that did not parse are absent —
    /// <see cref="Invalid{TEnum}"/> is what turns them into a <c>400</c>, and the validator runs
    /// first, so in a served request this list is total.
    /// </summary>
    internal static IReadOnlyList<TEnum> Parse<TEnum>(IReadOnlyList<string>? values)
        where TEnum : struct, Enum
    {
        var supplied = Supplied(values);

        if (supplied.Count == 0)
        {
            return [];
        }

        return supplied
            .Where(value => TryParseOne<TEnum>(value, out _))
            .Select(value =>
            {
                TryParseOne<TEnum>(value, out var parsed);
                return parsed;
            })
            .Distinct()
            .Take(MaxValues)
            .ToList();
    }

    /// <summary>Every supplied value that is not a member name. Empty when the filter is valid.</summary>
    internal static IReadOnlyList<string> Invalid<TEnum>(IReadOnlyList<string>? values)
        where TEnum : struct, Enum =>
        Supplied(values)
            .Where(value => !TryParseOne<TEnum>(value, out _))
            .Distinct(StringComparer.Ordinal)
            .ToList();

    /// <summary>
    /// The values that were actually supplied — blanks removed. `spec.md` Q-4.
    /// </summary>
    /// <remarks>
    /// <b><c>?status=</c> does not bind as an empty array. It binds as an array holding one empty
    /// string</b>, and the first version of this class did not know that: <c>Invalid</c> saw
    /// <c>[""]</c>, found it unparseable, and answered <c>400</c> — for a parameter Q-4 rules must
    /// mean <i>no filter</i>. Measured by
    /// <c>An_empty_filter_parameter_is_not_a_filter_that_matches_nothing</c>, which went red on
    /// the first run and is the reason this method exists rather than a <c>Count == 0</c> check at
    /// the top of two others.
    /// <para>
    /// It matters for the ordinary case, not an exotic one: a filter bar that clears its select
    /// sends <c>?status=</c>, and a user who cleared a filter would have been shown a validation
    /// error naming six values they had not asked about.
    /// </para>
    /// </remarks>
    private static IReadOnlyList<string> Supplied(IReadOnlyList<string>? values) =>
        values is null
            ? []
            : values.Where(value => !string.IsNullOrWhiteSpace(value)).ToList();

    /// <summary>
    /// The member names, comma-separated, for the message AC-10 requires.
    /// </summary>
    /// <remarks>
    /// Read from the type rather than written out, so a member added to the enum appears in the
    /// message without anybody remembering to extend a literal. `009` shipped an enum with two
    /// invented members because a contract example was transcribed by hand; a list derived from
    /// the type cannot drift from it.
    /// </remarks>
    internal static string Accepted<TEnum>()
        where TEnum : struct, Enum =>
        string.Join(", ", Enum.GetNames<TEnum>());

    /// <summary>
    /// Case-insensitive by ruling, and numeric-rejecting for the reason in the class remarks.
    /// </summary>
    private static bool TryParseOne<TEnum>(string? value, out TEnum parsed)
        where TEnum : struct, Enum
    {
        parsed = default;

        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();

        // The guard that makes `?status=3` a 400. Checked before TryParse, because TryParse is
        // what would otherwise accept it — including values outside the enum entirely.
        if (trimmed.All(character => char.IsAsciiDigit(character) || character is '-' or '+'))
        {
            return false;
        }

        return Enum.TryParse(trimmed, ignoreCase: true, out parsed)
            && Enum.IsDefined(parsed);
    }
}

/// <summary>
/// What <c>?assignee=</c> resolved to. `015` AC-8, AC-9.
/// </summary>
/// <remarks>
/// Three meanings in one parameter, and they are not interchangeable: <c>me</c> is resolved from
/// the token on the SERVER (AC-8) so a client cannot ask for somebody else's queue by editing a
/// URL, <c>unassigned</c> is a null test rather than an id, and a <c>Guid</c> is a named user.
/// Modelling it as a nullable <c>Guid</c> plus a bool would make "unassigned" and "not filtering"
/// the same absent value — which is the distinction the whole parameter exists for.
/// </remarks>
internal enum AssigneeFilterKind
{
    /// <summary>No <c>?assignee=</c> was supplied. Every ticket, assigned or not.</summary>
    Any,

    /// <summary>Tickets with no assignee.</summary>
    Unassigned,

    /// <summary>
    /// <c>?assignee=me</c>. Kept distinct from <see cref="User"/> because the query is a DTO and
    /// cannot see <c>ICurrentUser</c> — the HANDLER resolves it, which is what AC-8 means by
    /// "resolved server-side". A client cannot reach another user's queue by editing the URL.
    /// </summary>
    Me,

    /// <summary>Tickets assigned to one explicitly named user.</summary>
    User,
}
