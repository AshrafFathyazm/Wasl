namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// Metadata about the request being handled. Answers <i>which request</i>;
/// <see cref="ICurrentUser"/> answers <i>who</i>.
/// </summary>
/// <remarks>
/// <para>
/// <b>This interface exists because of a dependency direction, not because of a preference.</b>
/// `002` derives the trace id once, in <c>Wasl.Api/Common/Errors/TraceContext.cs</c>, which is
/// <c>internal</c> to that project — and <c>Wasl.Api</c> sits <i>above</i> the audit behaviour
/// in the dependency direction, so the behaviour cannot call it. The implementation in
/// <c>Wasl.Api</c> calls it and hands the result down through here.
/// </para>
/// <para>
/// <b>The alternative was re-deriving <c>Activity.Current?.Id</c> in the behaviour, and it is
/// the trap BR-9.9 exists to prevent</b> (`spec.md` A-2). That expression produces a valid
/// trace id — it is simply not <i>the</i> trace id, and the two would differ only when
/// <c>Activity.Current</c> happened to be null. An AC-21 failure that appears intermittently
/// is worse than one that appears always, because the first gets retried and the second gets
/// fixed.
/// </para>
/// </remarks>
public interface IRequestContext
{
    /// <summary>
    /// BR-9.9. The one identifier shared by the response body, the log scope, and the audit
    /// row. Never empty — a row that cannot be correlated is a row nobody can act on, which
    /// is why <c>AuditLog.TraceId</c> is <c>NOT NULL</c>.
    /// </summary>
    string TraceId { get; }

    /// <summary>
    /// Normalised: <c>::ffff:127.0.0.1</c> becomes <c>127.0.0.1</c>. Two spellings of one
    /// address make "everything from this address" quietly wrong, and the query that asks it
    /// is an incident query.
    /// </summary>
    string? IpAddress { get; }

    /// <summary>
    /// Not truncated here. <c>AuditEntry.For</c> truncates at 400, so the one place that knows
    /// the column width is the one that enforces it.
    /// </summary>
    string? UserAgent { get; }
}
