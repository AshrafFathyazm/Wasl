using System.Diagnostics;

namespace Wasl.Api.Common.Errors;

/// <summary>
/// The single source of the correlation id. BR-9.9.
/// </summary>
/// <remarks>
/// <para>
/// Three systems must carry the <b>same</b> identifier: the <c>traceId</c> in the response,
/// the correlation id in the log scope, and the <c>TraceId</c> column on `003`'s audit row.
/// </para>
/// <para>
/// <b>Why this is a type and not a one-line expression.</b> Three subsystems each writing
/// <c>Activity.Current?.Id ?? context.TraceIdentifier</c> produce three
/// plausible-looking opaque strings that agree until one of them is written slightly
/// differently — and nobody finds out until an incident, which is the worst possible moment
/// to discover that the id in the log does not match the one the customer quoted.
/// </para>
/// <para>
/// The W3C id from <see cref="Activity"/> is preferred because it survives a process
/// boundary; <c>HttpContext.TraceIdentifier</c> is the fallback and is per-connection.
/// Which one is in play does not matter to correlation — that every reader gets the same
/// answer does.
/// </para>
/// </remarks>
internal static class TraceContext
{
    /// <summary>The correlation id for this request. Never null, never empty.</summary>
    public static string For(HttpContext context) =>
        Activity.Current?.Id ?? context.TraceIdentifier;
}
