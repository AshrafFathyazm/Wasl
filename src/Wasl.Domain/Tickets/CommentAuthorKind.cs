namespace Wasl.Domain.Tickets;

/// <summary>
/// Who a comment is <b>from</b>. `034`.
/// </summary>
/// <remarks>
/// <para>
/// <b>An explicit discriminator, not an inference from <c>AuthorCustomerId != null</c>.</b> The
/// two are kept in step by <see cref="TicketComment.Create"/>, and a reader of a row — in SQL, in
/// the audit log, in a support query — should not have to know that rule to know what the row
/// means. `009` shipped an enum written from a contract example with two invented members; the
/// lesson recorded from it was that an enum is a statement about the domain, so this one states
/// the thing rather than encoding it in a nullable column's presence.
/// </para>
/// <para>
/// <b>Stored as a string, like every other enum in this schema</b> — the domain is the
/// constraint, and an int would let a reordering silently rewrite the meaning of every existing
/// row.
/// </para>
/// <para>
/// <b>There is no <c>System</c> member, deliberately.</b> ADR-005 rejects a fake actor by name.
/// Every comment is caused by a person the server authenticated, and
/// <see cref="TicketComment.AuthorUserId"/> names them whichever kind this is.
/// </para>
/// </remarks>
public enum CommentAuthorKind
{
    /// <summary>Written in the application by the support user who is signed in.</summary>
    Agent,

    /// <summary>
    /// Reached us from the customer through a channel, and was recorded by a support user.
    /// </summary>
    /// <remarks>
    /// The customer never signs in — there is no customer authentication and it is out of scope
    /// (`00-project-context.md`). So a customer-authored comment always has <b>two</b> real
    /// people on the row: the customer it is from, and the support user who recorded it.
    /// </remarks>
    Customer,
}
