namespace Wasl.Domain.Communications;

/// <summary>
/// How the customer reported the problem. FR-3.2.
/// </summary>
/// <remarks>
/// <para>
/// <b>The five channels named in the product scope document, section 3</b>, and nothing else.
/// An earlier version of this enum carried <c>Phone</c> and <c>Portal</c>: neither appears in
/// the source, and <c>Portal</c> additionally contradicted
/// `docs/sdd/15-scope-coverage.md`, which excludes a customer portal outright.
/// </para>
/// <para>
/// <b>The member names are a contract, not an implementation detail.</b> They are persisted as
/// strings (ADR-013), serialised as strings on the wire, and `design/icons/` holds one asset per
/// channel keyed by the same name. The frontend lane reads these values from the frozen
/// contract to build its icon map — so a rename here is a broken icon there, and a broken icon
/// map presents as a missing asset rather than as a mismatched enum.
/// </para>
/// <para>
/// Set at creation and not changed (`spec.md` A-3). If a ticket can move channel, that is a
/// change event with a history row, not a field edit.
/// </para>
/// <para>
/// Domain data, not a provider abstraction. `docs/sdd/12-delivery-log.md` records the decision
/// that under nine hours the channel stays a value on the ticket, which is what FR-3.2 asks
/// for. The provider seam and its mock are feature `021`, out of scope.
/// </para>
/// </remarks>
public enum CommunicationChannel
{
    Email,
    WhatsApp,
    LiveChat,
    Sms,
    WebForm,
}
