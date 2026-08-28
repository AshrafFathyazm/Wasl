namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// The caller is authenticated and is not permitted this action. Mapped to
/// <c>403 errors/forbidden</c> by `002`'s factory.
/// </summary>
/// <remarks>
/// <para>
/// <b>Added by `011`, and it completes a chain three features long.</b> `002` reserved the
/// <c>forbidden</c> registry row. `003` added <see cref="DomainErrorCodes.Forbidden"/> and made
/// <c>AuditOutcomeClassifier</c> key on it. `004` built the identity a permission decision needs.
/// `011` is the first feature with a data-dependent rule to enforce, so it is the first that can
/// raise one.
/// </para>
/// <para>
/// <b>This type existing is what makes BR-2's denials auditable</b>, and that is not a side
/// effect — it is the reason the data-dependent half of BR-6 lives in a handler rather than in a
/// policy. Thrown here, the exception passes through <c>AuditBehaviour</c>, which classifies it
/// as <c>Denied</c> and writes an independent audit row naming the actor, the ticket, and the
/// traceId of the `403` the caller received. A `403` produced by the authorization middleware
/// instead throws nothing, so MediatR never sees it and no row is written — `004` AC-18, still
/// open. So the same refusal is either recorded or invisible depending purely on where the check
/// was put.
/// </para>
/// <para>
/// <b>It carries no detail about what would have been permitted.</b> A denial is not the place to
/// disclose state: naming the current assignee would tell an Agent who owns every ticket they are
/// refused, one request at a time. The response says the action is not permitted and stops, and
/// the ticket read is where ownership is legitimately available.
/// </para>
/// </remarks>
public sealed class ForbiddenException(string messageKey, params object[] messageArguments)
    : DomainException(DomainErrorCodes.Forbidden, messageKey, messageArguments);
