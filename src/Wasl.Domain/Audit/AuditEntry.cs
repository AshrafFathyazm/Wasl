namespace Wasl.Domain.Audit;

/// <summary>
/// One row of the forensic record (ADR-008, BR-9). Append-only: there is no mutator, and
/// nothing in the codebase can change a row once <see cref="For"/> has produced it.
/// </summary>
/// <remarks>
/// <para>
/// <b>Immutability is the first line, not the only one.</b> `003b` adds
/// <c>DENY UPDATE, DELETE</c> so the guarantee holds against SQL as well as against C#;
/// until then, append-only is an application property and `spec.md` says so outright. What
/// this type contributes is that EF Core cannot update what the code cannot change.
/// </para>
/// <para>
/// <b>No foreign keys, deliberately</b> (BR-9.12). <see cref="ActorUserId"/> and
/// <see cref="EntityId"/> are plain <c>Guid?</c>: an audit row must be able to record a
/// deletion and still exist afterwards, and a foreign key would let the lifecycle of the
/// audited thing block, cascade, or invalidate the record of it.
/// </para>
/// <para>
/// <b>No <c>rowversion</c> and no <c>UpdatedAtUtc</c></b> (`research.md` R-10). Nothing
/// updates a row, so there is no second writer to conflict with, and a column for the update
/// time would be an invitation. AC-5 asserts both absences so that "add <c>rowversion</c> to
/// be safe" is a change someone has to argue for.
/// </para>
/// </remarks>
public sealed class AuditEntry
{
    /// <summary>
    /// The longest <see cref="UserAgent"/> that will be stored. Anything longer is truncated
    /// rather than rejected — see <see cref="For"/>.
    /// </summary>
    public const int UserAgentMaxLength = 400;

    // EF Core materialises through this. Nothing else should.
    private AuditEntry()
    {
    }

    /// <summary>
    /// <c>bigint IDENTITY(1,1)</c> — the only non-<c>uniqueidentifier</c> key in the schema.
    /// Append-only, high volume, and always read in time order, which is the case ADR-008
    /// makes for a clustered sequential key here and nowhere else.
    /// </summary>
    public long Id { get; private set; }

    /// <summary>
    /// From the injected <c>TimeProvider</c>, never <c>DateTime.UtcNow</c> (AC-23). Stored as
    /// <c>datetime2(3)</c> and read back as <see cref="DateTimeKind.Utc"/> by `001`'s global
    /// value converter.
    /// </summary>
    public DateTime OccurredAtUtc { get; private set; }

    /// <summary>Null for anonymous events — a failed sign-in has no actor.</summary>
    public Guid? ActorUserId { get; private set; }

    /// <summary>
    /// Snapshot at write time (BR-9.6). Copied onto the row rather than joined, so a later
    /// change to the person does not rewrite history.
    /// </summary>
    public string? ActorEmail { get; private set; }

    /// <summary>The role held <b>then</b>, not the role held now (BR-9.6).</summary>
    public string? ActorRole { get; private set; }

    /// <summary>
    /// <c>Entity.Verb</c>, from <c>IAuditableCommand.AuditAction</c>. Never localized
    /// (BR-8.9, BR-9.10) — a table read by two people in two languages has to say the same
    /// thing to both.
    /// </summary>
    public string Action { get; private set; } = null!;

    public string? EntityType { get; private set; }

    public Guid? EntityId { get; private set; }

    /// <summary>
    /// A readable handle — <c>TCK-2026-000042</c> — so a row means something without a join.
    /// </summary>
    public string? EntityLabel { get; private set; }

    public AuditOutcome Outcome { get; private set; }

    /// <summary>
    /// Redacted JSON diff, or <c>null</c>. **Never <c>[]</c>**: an empty array and a lost
    /// diff would be indistinguishable, and a lost diff is `research.md` R-1's silent
    /// failure. <c>null</c> means "no tracked change".
    /// </summary>
    public string? Changes { get; private set; }

    /// <summary>
    /// BR-9.9. The same identifier the response body and the log scope carry, obtained from
    /// one accessor — never re-derived here (`spec.md` A-2). <c>NOT NULL</c> by design:
    /// a row that cannot be correlated is a row nobody can act on.
    /// </summary>
    public string TraceId { get; private set; } = null!;

    /// <summary>
    /// Normalised before storage — <c>::ffff:127.0.0.1</c> is stored as <c>127.0.0.1</c>.
    /// Mixed forms of one address make "everything from this address" quietly wrong.
    /// </summary>
    public string? IpAddress { get; private set; }

    public string? UserAgent { get; private set; }

    /// <summary>
    /// The only way to create a row.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Enforces what the columns already say: <paramref name="action"/> and
    /// <paramref name="traceId"/> are required, because a row without either cannot be read
    /// or correlated.
    /// </para>
    /// <para>
    /// <b><paramref name="userAgent"/> is truncated, not rejected.</b> A 401-character header
    /// is a client's choice, and an audit write that throws on its own input would fail the
    /// mutation it exists to record. The same reasoning is why nothing else here throws on
    /// length: every other string is either bounded by its own column or nullable.
    /// </para>
    /// </remarks>
    public static AuditEntry For(
        DateTime occurredAtUtc,
        string action,
        AuditOutcome outcome,
        string traceId,
        Guid? actorUserId = null,
        string? actorEmail = null,
        string? actorRole = null,
        AuditTarget target = default,
        string? changes = null,
        string? ipAddress = null,
        string? userAgent = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(action);
        ArgumentException.ThrowIfNullOrWhiteSpace(traceId);

        return new AuditEntry
        {
            OccurredAtUtc = occurredAtUtc,
            Action = action,
            Outcome = outcome,
            TraceId = traceId,
            ActorUserId = actorUserId,
            ActorEmail = actorEmail,
            ActorRole = actorRole,
            EntityType = target.EntityType,
            EntityId = target.EntityId,
            EntityLabel = target.EntityLabel,
            Changes = changes,
            IpAddress = ipAddress,
            UserAgent = Truncate(userAgent, UserAgentMaxLength),
        };
    }

    private static string? Truncate(string? value, int maxLength) =>
        value is null || value.Length <= maxLength ? value : value[..maxLength];
}
