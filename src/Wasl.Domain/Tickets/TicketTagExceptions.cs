using Wasl.Domain.Common.Exceptions;

namespace Wasl.Domain.Tickets;

/// <summary>
/// `034` AC-13. The ticket already carries this tag, or does not carry the one being detached.
/// </summary>
/// <remarks>
/// <para>
/// A <c>409</c> and never a no-op <c>200</c> — the same rule and the same reason as
/// <see cref="AssigneeUnchangedException"/>: a <c>200</c> tells the client its request was applied
/// when nothing happened, so two clients disagree about what the last write was.
/// </para>
/// <para>
/// One type for both directions. "Already attached" and "was not attached" are the same fact from
/// the client's side — the set it is holding is stale — and its correct reaction to both is to
/// refetch quietly rather than to report a rule violation for a double-click.
/// </para>
/// </remarks>
public sealed class TagUnchangedException()
    : DomainException(DomainErrorCodes.TagUnchanged, "Error.Ticket.TagUnchanged");

/// <summary>
/// `034`. The tag named does not exist, or has been retired.
/// </summary>
/// <remarks>
/// <para>
/// <b>A <c>400</c> on <c>tagId</c>, not a <c>404</c></b> — the same choice
/// <see cref="AssigneeInactiveException"/> makes. A <c>404</c> addresses the ticket, and the
/// ticket was found; sending one here would tell the client its ticket id was wrong and send it
/// looking for a typo that is not there.
/// </para>
/// <para>
/// <b>Unknown and retired answer identically, deliberately.</b> Distinguishing them would let a
/// caller enumerate which ids ever existed, and the client's reaction is the same either way:
/// refresh the picker. `034` Q-3 keeps the tag set managed, so a retired tag is exactly what a
/// stale picker still offers.
/// </para>
/// </remarks>
public sealed class TagNotAvailableException()
    : DomainException(DomainErrorCodes.Validation, "Validation.Ticket.TagNotAvailable")
{
    public override IReadOnlyDictionary<string, string[]> FieldErrors { get; } =
        new Dictionary<string, string[]>
        {
            ["tagId"] = ["Validation.Ticket.TagNotAvailable"],
        };
}
