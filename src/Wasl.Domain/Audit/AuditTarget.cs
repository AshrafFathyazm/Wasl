namespace Wasl.Domain.Audit;

/// <summary>
/// What the audited action was about: the entity type, its id, and a readable handle.
/// Returned by a command's <c>DescribeTarget</c> (`research.md` R-8).
/// </summary>
/// <remarks>
/// <para>
/// All three are nullable, and that is the design rather than laziness. A command that fails
/// before it touches anything has no id to give; a sign-in failure has no entity at all. The
/// columns are nullable for exactly the same reason (BR-9.2's anonymous events).
/// </para>
/// <para>
/// <b><see cref="EntityLabel"/> is what makes a row readable without a join</b> — ADR-008
/// keeps it deliberately, and it is why `spec.md` Q-6 exists: for a customer the label is
/// personal data, in a table with indefinite retention. That question is open and this type
/// is not where it gets answered.
/// </para>
/// </remarks>
public readonly record struct AuditTarget(string? EntityType, Guid? EntityId, string? EntityLabel)
{
    /// <summary>
    /// No entity — an auth event, or a command that failed before it knew what it was
    /// acting on. Named rather than written as <c>default</c> at each call site.
    /// </summary>
    public static AuditTarget None => new(null, null, null);
}
