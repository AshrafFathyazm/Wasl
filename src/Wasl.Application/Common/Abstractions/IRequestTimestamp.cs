namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// One instant for the whole request. Every timestamp written while handling a request comes
/// from here, so they are equal by construction rather than by coordination.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why this exists rather than two callers sharing a <c>TimeProvider</c>.</b> AC-9 requires a
/// ticket and its first history row to carry the <i>same</i> instant. Two components each
/// calling <c>GetUtcNow()</c> get two values that differ by microseconds — close enough to look
/// right in every test and wrong in the one place it matters, a timeline whose first entry
/// appears to precede the thing it records.
/// </para>
/// <para>
/// The alternatives were both worse. Passing the instant between components makes "the same
/// moment" a thing to be coordinated, and the coordination is what a later feature forgets.
/// Saving twice — stamp the ticket, read the stamp back, write the history — turns a workaround
/// into a pattern that `011`, `012` and `016` would each repeat.
/// </para>
/// <para>
/// <b>"The same moment" is a fact about the request</b>, so it is modelled as one value scoped
/// to the request. Nothing then has to agree with anything.
/// </para>
/// </remarks>
public interface IRequestTimestamp
{
    /// <summary>
    /// The instant this request is treated as happening at. Stable for the request's lifetime.
    /// </summary>
    DateTimeOffset UtcNow { get; }
}
