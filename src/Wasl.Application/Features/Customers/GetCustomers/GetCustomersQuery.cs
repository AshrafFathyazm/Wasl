using MediatR;
using Wasl.Application.Common;

namespace Wasl.Application.Features.Customers.GetCustomers;

/// <summary>
/// <c>GET /api/customers</c>. US-002, BR-7. `008` AC-4 to AC-11, AC-15, AC-17.
/// </summary>
/// <remarks>
/// <para>
/// <b>Not an <c>ICommand</c>:</b> it changes no state, so it opens no transaction and writes no
/// audit row. Structural since `003` — the audit behaviour is constrained to
/// <c>IAuditableCommand&lt;TResponse&gt;</c>, so a query cannot reach it even by accident.
/// </para>
/// <para>
/// <b>The envelope is `010`'s, unchanged.</b> This feature was written as the one that would
/// establish it; `010` shipped first, so `008` inherits <see cref="PagedResult{T}"/> and the
/// clamping rules rather than defining them. Re-asserted here anyway, because the clamping is
/// per-endpoint code and inheriting a shape is not inheriting an implementation.
/// </para>
/// </remarks>
/// <param name="Search">
/// Case-insensitive substring over <c>fullName</c>, <c>email</c> and <c>phone</c> (AC-7). Trimmed;
/// whitespace-only is treated as absent, never as a match-nothing filter.
/// </param>
/// <param name="Sort">
/// <c>fullName</c> (default) or <c>createdAtUtc</c>. `033` §5.1. <b>An unknown value is a
/// `400`, not a fallback</b> — §5.5: `pageSize=500` has an obvious nearest legal value and
/// `sort=email` does not, and silently ordering by name instead returns a correct-looking page
/// in the wrong order, which is the one failure the client cannot see.
/// </param>
/// <param name="Dir">
/// <c>asc</c> (default) or <c>desc</c>. Same rule.
/// </param>
/// <param name="Company">
/// Repeated. EXACT match against <c>CompanyName</c>, case-insensitive from the column's own
/// collation (`008`) rather than from a `LOWER()` this query would have to write.
/// <c>?company=A&amp;company=B</c> is OR; clamped to twenty values.
/// </param>
/// <param name="NoCompany">
/// <c>CompanyName IS NULL</c>, <b>OR-ed with <paramref name="Company"/></b> so "Acme or none" is
/// expressible.
/// <para>
/// <b>A separate flag rather than a sentinel string inside <paramref name="Company"/>.</b> The
/// canvas draws it as one more checkbox in the same list, which invites encoding it as a magic
/// value — and a real company named that string then becomes unfilterable, silently.
/// </para>
/// </param>
/// <param name="CreatedFrom">
/// <c>yyyy-MM-dd</c>, inclusive, read as UTC midnight. `033` §5.4.
/// </param>
/// <param name="CreatedTo">
/// <c>yyyy-MM-dd</c>, inclusive <b>to the end of that day</b>.
/// <para>
/// <b>This is the parameter that fails quietly.</b> <c>&lt;= createdTo</c> parsed as a date is
/// <c>&lt;= 00:00:00</c> on that day, which excludes every customer created during it: the
/// filter looks correct, returns rows, and drops exactly the newest day — the one a user
/// filtering <i>to today</i> is asking about. The handler compares
/// <c>&lt; createdTo + 1 day</c> and an integration test pins a customer created at
/// <c>23:59:59.999</c>.
/// </para>
/// </param>
/// <param name="Calendar">
/// <c>gregorian</c> (default) or <c>hijri</c>, and it applies to BOTH bounds. `015` built the
/// parser and the other lane moved it to <c>Common/DateRangeFilter</c> for this feature — a
/// Hijri date is a valid Gregorian one, so without declaring the calendar
/// <c>?createdFrom=1448-03-05</c> silently means the year 1448 and matches everything.
/// </param>
public sealed record GetCustomersQuery(
    string? Search = null,
    int Page = 1,
    int PageSize = Paging.DefaultPageSize,
    string? Sort = null,
    string? Dir = null,
    IReadOnlyList<string>? Company = null,
    bool? NoCompany = null,
    string? CreatedFrom = null,
    string? CreatedTo = null,
    string? Calendar = null) : IRequest<PagedResult<CustomerListItem>>
{
    /// <summary>
    /// BR-7.2's clamping, delegated — **not reimplemented**.
    /// </summary>
    /// <remarks>
    /// <c>Paging.ClampPage</c> and <c>ClampPageSize</c> already exist and `010` uses them. A second
    /// copy of a clamp is a second thing that has to be right: the rule is one sentence in BR-7.2
    /// and there is no reading of it under which two endpoints should differ. `pageSize=0` becomes
    /// the default rather than 1 — one is a page nobody asked for, twenty is what saying nothing
    /// would have given them.
    /// </remarks>
    public int EffectivePage => Paging.ClampPage(Page);

    /// <inheritdoc cref="EffectivePage"/>
    public int EffectivePageSize => Paging.ClampPageSize(PageSize);

    /// <summary>The trimmed term, or null when there is effectively no search.</summary>
    public string? EffectiveSearch =>
        string.IsNullOrWhiteSpace(Search) ? null : Search.Trim();

    /* THE `Effective*` CONVENTION, which `015` states and this follows: the rule lives with the
     * shape it applies to, so a test can assert the rule without a handler and the handler
     * cannot apply a different one. */

    /// <summary>The ordering, defaulted. Unreadable input never reaches here — the validator
    /// refuses it first (§5.5).</summary>
    internal CustomerSort EffectiveSort =>
        CustomerFilters.Parse<CustomerSort>(Sort) ?? CustomerSort.FullName;

    /// <inheritdoc cref="EffectiveSort"/>
    internal SortDirection EffectiveDir =>
        CustomerFilters.Parse<SortDirection>(Dir) ?? SortDirection.Asc;

    /// <summary>Trimmed, de-duplicated case-insensitively, clamped to twenty.</summary>
    internal IReadOnlyList<string> EffectiveCompany => CustomerFilters.Companies(Company);

    /// <summary>Absent is <c>false</c> — a filter nobody asked for filters nothing.</summary>
    internal bool EffectiveNoCompany => NoCompany ?? false;

    /// <inheritdoc cref="CreatedFrom"/>
    internal DateOnly? EffectiveCreatedFrom => DateRangeFilter.Parse(CreatedFrom, Calendar);

    /// <inheritdoc cref="CreatedTo"/>
    internal DateOnly? EffectiveCreatedTo => DateRangeFilter.Parse(CreatedTo, Calendar);

    /// <summary>
    /// <c>createdFrom &gt; createdTo</c>.
    /// </summary>
    /// <remarks>
    /// <b>AN INVERTED RANGE IS A <c>400</c>, THE SAME AS THE TICKETS LIST — ruled 2026-09-03,
    /// superseding §5.4.</b> §5.4 said the range "describes a window with nothing in it"; it
    /// describes a contradiction. A window with nothing in it is <c>from == to</c> on an empty
    /// day, and that returns zero correctly.
    /// <para>
    /// Measured before the change: <c>?createdFrom=2026-09-01&amp;createdTo=2026-08-01</c>
    /// answered <c>200</c> with <c>totalCount 0</c> and the screen said "لا عميل يطابق هذا" — a
    /// false claim about the DATA in answer to a broken claim about the REQUEST, which is the
    /// reasoning <c>015</c> recorded for tickets and the reason a <c>200</c> never carries an
    /// error in this contract.
    /// </para>
    /// <para>
    /// The clients drop an inverted range on the way IN rather than sending it — see
    /// <c>customerFilters.ts</c> and <c>ticketFilters.ts</c>, which already drop every other
    /// value that fails validation — so this <c>400</c> is the guarantee, not the user
    /// experience.
    /// </para>
    /// </remarks>
    internal bool CreatedRangeIsInverted =>
        EffectiveCreatedFrom is { } from && EffectiveCreatedTo is { } to && to < from;
}

/// <summary>
/// One row of the customer list. **The frozen contract's field set, and nothing else.**
/// </summary>
/// <remarks>
/// <para>
/// <b>Six fields, checked against the frontend rather than assumed.</b>
/// <c>src/wasl-web/src/lib/api-types.provisional.ts</c> already declares a hand-written
/// <c>CustomerListItem</c> with exactly <c>id · fullName · email · phone · companyName ·
/// createdAtUtc</c>, written from <c>contracts/customers-read-api.md</c> before this endpoint
/// existed. So the shape is fixed by an agreement that has already been built against, and `008`
/// must not widen it.
/// </para>
/// <para>
/// <b>What is deliberately absent:</b> <c>notes</c> (2000 characters of free text on every row of
/// every page), <c>isActive</c> (the list filters on it, so every row is <c>true</c> and the field
/// would be noise), <c>updatedAtUtc</c> and <c>version</c> (a list is not an edit surface — the
/// profile carries both, because that is where a client needs them). AC-17 asserts the absence
/// over the raw response text, not over this type: a type describes what should be returned, and
/// the assertion has to be about what was.
/// </para>
/// <para>
/// <c>Phone</c> on the wire, <c>PhoneE164</c> in the entity. The contract names the field for the
/// client, and the entity names the format for the reader.
/// </para>
/// </remarks>
public sealed record CustomerListItem(
    Guid Id,
    string FullName,
    string? Email,
    string? Phone,
    string? CompanyName,
    DateTime CreatedAtUtc);
