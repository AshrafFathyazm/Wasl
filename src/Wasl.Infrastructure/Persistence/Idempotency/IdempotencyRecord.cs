namespace Wasl.Infrastructure.Persistence.Idempotency;

/// <summary>
/// One <c>Idempotency-Key</c> and what it produced. `036` §3.5.
/// </summary>
/// <remarks>
/// <para>
/// <b>In <c>Wasl.Infrastructure</c> and not in <c>Wasl.Domain</c>, deliberately.</b> An
/// idempotency key is a property of HTTP delivery, not of customer support: it says a client
/// sent something twice. Nothing in <c>docs/sdd/</c> names it, no <c>BR-*</c> governs it, and no
/// domain rule reads it. <c>AuditEntry</c> looks similar and lives in the domain for the opposite
/// reason — BR-9 makes the audit trail a product requirement.
/// </para>
/// <para>
/// <b>Not an <c>IAuditableEntity</c>.</b> Stamping it would put a row in <c>dbo.AuditLog</c> for
/// the bookkeeping of a request as well as for the request, and BR-9's rows would then double on
/// exactly one endpoint. The two timestamps it carries are its own.
/// </para>
/// </remarks>
internal sealed class IdempotencyRecord
{
    private IdempotencyRecord()
    {
    }

    public Guid Id { get; private set; }

    /// <summary>The header value, verbatim. Never trimmed or case-folded — see the configuration.</summary>
    public string KeyValue { get; private set; } = string.Empty;

    /// <summary>
    /// Whose key it is. Part of the unique index, not a note beside it.
    /// </summary>
    /// <remarks>
    /// <b>This is the one security property in `036` §3.5.</b> A key scoped globally would let
    /// any caller replay another caller's response by guessing or reusing a key — handing them a
    /// ticket body they were never entitled to. `spec.md`'s edge-case table names it.
    /// </remarks>
    public Guid UserId { get; private set; }

    /// <summary>Which action the key was spent on, so one key cannot span two endpoints.</summary>
    public string Endpoint { get; private set; } = string.Empty;

    /// <summary>
    /// A digest of the request body, and the whole of AC-17's mechanism.
    /// </summary>
    /// <remarks>
    /// A hash rather than the body: the body can be large, it is not needed for anything but
    /// comparison, and storing a request verbatim in a second table is a copy of customer data
    /// with its own retention question. SHA-256, hex, so the column width is fixed.
    /// </remarks>
    public string RequestHash { get; private set; } = string.Empty;

    /// <summary>Null until the request succeeds. Null IS the in-flight marker.</summary>
    public int? StatusCode { get; private set; }

    public string? ResponseBody { get; private set; }

    /// <summary>The <c>Location</c> the first response carried, stored rather than recomputed (AC-16).</summary>
    public string? Location { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// When this row stops meaning anything.
    /// </summary>
    /// <remarks>
    /// Twenty-four hours (`036` Q-5's ruling). A lookup ignores an expired row and the store
    /// deletes it opportunistically; there is no background sweep, for the reason `004b` gave
    /// for the sign-in throttle — a timer is a thing that has to be disposed correctly, and the
    /// cheaper correct option is to prune on the path that already writes.
    /// </remarks>
    public DateTime ExpiresAtUtc { get; private set; }

    public static IdempotencyRecord Reserve(
        string key, Guid userId, string endpoint, string requestHash, DateTime nowUtc, TimeSpan retention) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            KeyValue = key,
            UserId = userId,
            Endpoint = endpoint,
            RequestHash = requestHash,
            CreatedAtUtc = nowUtc,
            ExpiresAtUtc = nowUtc + retention,
        };

    public void Complete(int statusCode, string responseBody, string? location)
    {
        StatusCode = statusCode;
        ResponseBody = responseBody;
        Location = location;
    }
}
