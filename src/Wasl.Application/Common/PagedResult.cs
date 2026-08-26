namespace Wasl.Application.Common;

/// <summary>
/// One paged envelope for every list endpoint. BR-7.1, BR-7.2, BR-7.6.
/// </summary>
/// <remarks>
/// <para>
/// The shape is fixed by `CLAUDE.md`'s API contract — <c>items</c>, <c>page</c>,
/// <c>pageSize</c>, <c>totalCount</c>, <c>totalPages</c> — so every list reads the same way and a
/// client writes one pager.
/// </para>
/// <para>
/// <b><see cref="Page"/> and <see cref="PageSize"/> echo the EFFECTIVE values</b>, after clamping.
/// A client that asked for <c>pageSize=5000</c> and got 100 rows needs to be told it got 100;
/// echoing the request instead would leave it computing <c>totalPages</c> from a number the
/// server ignored, and paging past the end of a list it thinks is longer than it is.
/// </para>
/// </remarks>
public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount)
{
    /// <summary>
    /// Derived, never stored. Two fields that must agree are two fields that eventually do not.
    /// </summary>
    /// <remarks>
    /// Zero when the list is empty, rather than 1 — BR-7.6 returns <c>200</c> with an empty array,
    /// and claiming one page of nothing invites a client to render an empty page control.
    /// </remarks>
    public int TotalPages => TotalCount == 0
        ? 0
        : (int)Math.Ceiling(TotalCount / (double)PageSize);
}

/// <summary>
/// The clamping rules, in one place because every list endpoint needs the same ones.
/// </summary>
/// <remarks>
/// <b>Clamped, never rejected</b> (BR-7.2). A `400` for <c>pageSize=101</c> would make the
/// boundary a thing every client has to know; clamping makes it the server's business. The same
/// argument covers <c>page=0</c>: it is a client bug that should return the first page rather
/// than an error the user sees.
/// </remarks>
public static class Paging
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    /// <summary>1-based. Anything below 1 becomes 1.</summary>
    public static int ClampPage(int? page) => page is null or < 1 ? 1 : page.Value;

    /// <summary>
    /// Above <see cref="MaxPageSize"/> becomes 100; below 1 becomes
    /// <see cref="DefaultPageSize"/>.
    /// </summary>
    /// <remarks>
    /// Below 1 becomes the **default**, not 1. A client sending <c>pageSize=0</c> means "I did not
    /// set this", and answering with a single row would look like a working page of one.
    /// </remarks>
    public static int ClampPageSize(int? pageSize) => pageSize switch
    {
        null or < 1 => DefaultPageSize,
        > MaxPageSize => MaxPageSize,
        _ => pageSize.Value,
    };
}
