namespace Wasl.Domain.Audit;

/// <summary>
/// What happened to the audited action. BR-9.4's three cases, and the distinction between
/// the last two is not cosmetic.
/// </summary>
/// <remarks>
/// <para>
/// Persisted as a <b>string</b> via <c>HasConversion&lt;string&gt;()</c>, not as an
/// <c>int</c> (`data-model.md`). Two reasons: a database dump stays readable without the
/// enum beside it, and reordering the members cannot silently re-label existing rows — in a
/// table nothing ever updates, a re-label is unrecoverable.
/// </para>
/// <para>
/// There is no <c>CHECK</c> constraint on the column. The domain is the constraint, which is
/// what `docs/sdd/03-domain-model.md` says for every enum in this schema.
/// </para>
/// </remarks>
public enum AuditOutcome
{
    /// <summary>The action was permitted and committed.</summary>
    Success,

    /// <summary>
    /// The actor was not allowed to do it. Distinguished from <see cref="Failed"/> because
    /// "someone tried and was refused" is what an incident investigation looks for, and
    /// "something broke" is not.
    /// </summary>
    Denied,

    /// <summary>The action was permitted and then went wrong.</summary>
    Failed,
}
