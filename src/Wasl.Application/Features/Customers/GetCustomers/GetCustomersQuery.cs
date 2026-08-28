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
public sealed record GetCustomersQuery(
    string? Search = null,
    int Page = 1,
    int PageSize = Paging.DefaultPageSize) : IRequest<PagedResult<CustomerListItem>>
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
