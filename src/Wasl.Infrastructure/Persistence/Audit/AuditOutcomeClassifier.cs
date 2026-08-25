using Wasl.Domain.Audit;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Infrastructure.Persistence.Audit;

/// <summary>
/// Maps an exception to an <see cref="AuditOutcome"/>, or to "do not audit". `spec.md` Q-4.
/// </summary>
/// <remarks>
/// <para>
/// <b>Keyed on <c>DomainException.ErrorCode</c>, a string, not on an HTTP status.</b> `002`
/// deliberately kept HTTP out of <c>Wasl.Domain</c>, and reaching for a status here would
/// bring it back one layer up — with the added problem that `002` produces <c>401</c> and
/// <c>403</c> <b>with no exception thrown at all</b>, so a status-keyed classifier would have
/// nothing to read in the very cases it was built for.
/// </para>
/// <para>
/// <b>Which denials this sees, and which it cannot.</b> A denial raised <i>inside</i> a
/// handler — `011`'s "an Agent assigning someone else's ticket" — arrives here as a
/// <c>DomainException</c> and is classified. A denial produced by the auth middleware never
/// reaches MediatR, so this class cannot see it; BR-9.2's middleware denials are `004`'s to
/// write through <c>IAuditWriter.WriteIndependentAsync</c>. That split is not a gap, and
/// `spec.md`'s Out of scope names the owner.
/// </para>
/// </remarks>
internal static class AuditOutcomeClassifier
{
    /// <summary>
    /// The outcome for this exception, or <c>null</c> when the action must not be audited.
    /// </summary>
    /// <param name="exception">The exception that ended the request.</param>
    /// <param name="requestToken">The request's own cancellation token, used to tell a client
    /// disconnect from a cancellation raised for some other reason.</param>
    /// <remarks>
    /// <b><c>null</c> for a cancelled request, and that is a decision rather than an omission</b>
    /// (`spec.md` Q-5). A client that walked away rolled the transaction back and nothing
    /// happened; a disconnect is not an actor's action. It is recorded because "nothing
    /// happened" and "we lost the record" look identical in the table, and this is what decides
    /// which one a missing row means.
    /// </remarks>
    public static AuditOutcome? Classify(Exception exception, CancellationToken requestToken)
    {
        if (exception is OperationCanceledException && requestToken.IsCancellationRequested)
        {
            return null;
        }

        return exception is DomainException domain && IsDenial(domain.ErrorCode)
            ? AuditOutcome.Denied
            : AuditOutcome.Failed;
    }

    /// <summary>
    /// The codes that mean "the actor was not allowed to".
    /// </summary>
    /// <remarks>
    /// A list rather than a naming convention. `002` ships seven codes with a registry test
    /// that fails the build on an unregistered one, so the vocabulary is stable and small —
    /// and matching on a substring like "forbidden" would classify a future
    /// <c>forbidden-transition</c> as a denial when it is a rule violation, which is the same
    /// over-broad-matching mistake BR-9.7's deny-list refuses.
    /// </remarks>
    private static bool IsDenial(string errorCode) =>
        errorCode is DomainErrorCodes.Forbidden;
}
