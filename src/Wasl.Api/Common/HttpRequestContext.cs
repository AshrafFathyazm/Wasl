using System.Net;
using System.Net.Sockets;
using Wasl.Api.Common.Errors;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Api.Common;

/// <summary>
/// <see cref="IRequestContext"/> over the current <c>HttpContext</c>.
/// </summary>
/// <remarks>
/// <para>
/// <b>This class exists to carry `002`'s trace id downwards, and it derives nothing itself.</b>
/// <see cref="TraceContext.For"/> is <c>internal</c> to <c>Wasl.Api</c>, and the audit
/// behaviour lives in <c>Wasl.Infrastructure</c>, which sits <i>below</i> this project in the
/// dependency direction and cannot reach it. So the call happens here and the answer travels
/// through the interface (`spec.md` A-2, `research.md` R-13).
/// </para>
/// <para>
/// The one line that must never appear in this file is <c>Activity.Current?.Id</c>. It would
/// compile, it would produce a valid trace id, and it would be a <i>second</i> derivation —
/// diverging from the response body's only when <c>Activity.Current</c> happened to be null.
/// BR-9.9 is about one identifier, not about two correct ones.
/// </para>
/// </remarks>
internal sealed class HttpRequestContext(IHttpContextAccessor accessor) : IRequestContext
{
    /// <summary>
    /// Used when there is no request at all — a background call, or a hosted service.
    /// </summary>
    /// <remarks>
    /// A constant rather than an empty string, because <c>AuditLog.TraceId</c> is
    /// <c>NOT NULL</c> and <c>AuditEntry.For</c> rejects whitespace. An empty value would fail
    /// the audit write, and a failed audit write on the failure path is the one thing AC-11
    /// says must not happen. A named value is honest: the row says where it came from.
    /// </remarks>
    private const string NoRequestTraceId = "no-http-request";

    public string TraceId => accessor.HttpContext is { } context
        ? TraceContext.For(context)
        : NoRequestTraceId;

    public string? IpAddress => Normalise(accessor.HttpContext?.Connection.RemoteIpAddress);

    public string? UserAgent
    {
        get
        {
            var value = accessor.HttpContext?.Request.Headers.UserAgent.ToString();

            // Not truncated here. AuditEntry.For owns the 400-character limit, so the one
            // place that knows the column width is the one that enforces it.
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }
    }

    /// <summary>
    /// Collapses an IPv4-mapped IPv6 address to its IPv4 form.
    /// </summary>
    /// <remarks>
    /// Kestrel reports a local IPv4 client as <c>::ffff:127.0.0.1</c>, and the same client
    /// over a different binding as <c>127.0.0.1</c>. Two spellings of one address make
    /// "everything from this address" quietly incomplete — and that query is an incident
    /// query, asked once, under pressure, by someone who will believe the answer.
    /// </remarks>
    private static string? Normalise(IPAddress? address)
    {
        if (address is null)
        {
            return null;
        }

        var normalised = address is { AddressFamily: AddressFamily.InterNetworkV6, IsIPv4MappedToIPv6: true }
            ? address.MapToIPv4()
            : address;

        return normalised.ToString();
    }
}
