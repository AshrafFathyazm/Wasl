namespace Wasl.Domain.Common;

/// <summary>
/// An entity whose creation and last change are stamped automatically. The four properties are
/// set by <c>WaslDbContext.SaveChangesAsync</c>, never by a handler.
/// </summary>
/// <remarks>
/// <para>
/// <b>The stamps a handler is responsible for are the stamps one handler will forget</b> — and
/// the forgetting fails nothing. No test goes red, no constraint is violated; a row simply
/// carries <c>0001-01-01</c> and nobody notices until someone sorts by it. Moving the work into
/// <c>SaveChangesAsync</c> makes it structural, the same argument BR-9 makes for the audit row.
/// </para>
/// <para>
/// <b>An interface, not a base class.</b> Inheritance in the domain constrains for no return:
/// an entity can implement this and still keep private setters, still expose only its own
/// methods, and still inherit nothing. A base class would additionally take the one inheritance
/// slot every entity has.
/// </para>
/// <para>
/// <b>Implementers keep private setters.</b> EF Core writes through the tracked entity, not
/// through the interface, so nothing here needs to be publicly settable — and an
/// <c>{ get; set; }</c> on this interface would make every auditable entity a mutable bag.
/// </para>
/// <para>
/// <b>Not for <c>TicketHistoryEntry</c> or <c>AuditEntry</c>.</b> Those record <i>when
/// something happened</i>, which is data the caller states, not infrastructure metadata about a
/// row. Stamping them automatically would let the two disagree with the thing they describe.
/// </para>
/// </remarks>
public interface IAuditableEntity
{
    DateTime CreatedAtUtc { get; }

    DateTime UpdatedAtUtc { get; }

    /// <summary>Null until `004` — there is no authenticated identity to stamp yet.</summary>
    Guid? CreatedByUserId { get; }

    /// <summary>Null on insert, and null until `004` for the same reason.</summary>
    Guid? UpdatedByUserId { get; }
}
