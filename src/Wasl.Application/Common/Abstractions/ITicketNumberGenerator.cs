namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// Draws the next ticket number. Declared here, implemented over a database sequence in
/// <c>Wasl.Infrastructure</c>.
/// </summary>
/// <remarks>
/// <para>
/// <b>This interface exists for the layer boundary, not for faking.</b> The handler lives in
/// this project and a sequence is a SQL Server object — the same reason
/// <c>IApplicationDbContext</c> exists. `009`'s `research.md` argued against an interface, but
/// it argued under a two-project layout that ADR-010 proposed and that was rejected; under
/// ADR-002 the handler cannot reach EF Core at all.
/// </para>
/// <para>
/// <b>Its real argument survives and is honoured:</b> a faked sequence proves nothing about
/// AC-11. The only reason a sequence exists is that a real one is atomic under concurrency, so
/// the concurrency test runs against a real engine and never against a substitute. That is a
/// rule about the test, not about the interface.
/// </para>
/// </remarks>
public interface ITicketNumberGenerator
{
    /// <summary>
    /// The next number, formatted <c>TCK-{yyyy}-{000000}</c>. Unique across concurrent callers.
    /// </summary>
    /// <remarks>
    /// Gaps are expected and accepted: a rolled-back create consumes a value, because sequence
    /// values are not returned on rollback. Making the series dense would mean serialising every
    /// create behind a lock, which is the thing a sequence was chosen to avoid.
    /// </remarks>
    Task<string> NextAsync(CancellationToken cancellationToken);
}
