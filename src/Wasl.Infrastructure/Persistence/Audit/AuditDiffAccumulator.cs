using Wasl.Domain.Audit;

namespace Wasl.Infrastructure.Persistence.Audit;

/// <summary>
/// Collects the field changes captured during a request. <b>Scoped</b>, so it spans the whole
/// request rather than one <c>SaveChanges</c>.
/// </summary>
/// <remarks>
/// <para>
/// The lifetime is the design. A handler is allowed to call <c>SaveChanges</c> more than once
/// — `007` does, to read back a database-generated <c>rowversion</c> — and the audit row for
/// that request must describe <i>all</i> of it. A per-save collection would keep only the last
/// batch, which is a partial diff that looks exactly like a complete one.
/// </para>
/// <para>
/// It holds no lock and is not thread-safe, deliberately: one scope is one request, and a
/// request is handled on one logical flow. Making it concurrent would imply a shape — two
/// handlers writing through one scope — that A-4 already forbids.
/// </para>
/// </remarks>
internal sealed class AuditDiffAccumulator
{
    private readonly List<AuditFieldChange> _changes = [];

    /// <summary>Adds captured changes. Called by the interceptor, before each save commits.</summary>
    public void Add(IEnumerable<AuditFieldChange> changes) => _changes.AddRange(changes);

    /// <summary>
    /// Everything captured this request, in capture order. Ordering for storage is the
    /// serialiser's job (AC-19) — mixing the two would put a presentation concern in a
    /// collector.
    /// </summary>
    public IReadOnlyList<AuditFieldChange> Changes => _changes;

    /// <summary>
    /// True when nothing was captured. The serialiser turns this into <c>null</c> rather than
    /// <c>[]</c>, because an empty array and a lost diff must not look the same
    /// (`research.md` R-1).
    /// </summary>
    public bool IsEmpty => _changes.Count == 0;
}
