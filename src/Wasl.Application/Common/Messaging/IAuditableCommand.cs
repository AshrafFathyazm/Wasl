using MediatR;
using Wasl.Domain.Audit;

namespace Wasl.Application.Common.Messaging;

/// <summary>
/// A state-changing request that declares what to record about itself. NFR-10: every
/// <see cref="ICommand"/> must implement this, and an architecture test fails the build when
/// one does not (AC-14).
/// </summary>
/// <typeparam name="TResponse">The command's response, which
/// <see cref="DescribeTarget"/> may read the entity id out of.</typeparam>
/// <remarks>
/// <para>
/// <b>The command describes its own target, and that is the whole design</b>
/// (`research.md` R-8). The two alternatives both fail quietly: a handler calling
/// <c>audit.Describe(id, label)</c> produces a row with a null <c>EntityId</c> when it
/// forgets, and nothing announces it; a behaviour inferring the entity from the change
/// tracker cannot tell the aggregate from the incidental, because a comment write touches
/// <c>TicketComments</c> and <c>Tickets</c> and only one of them is what the action was
/// about. Here the compiler requires it, so there is nothing to forget.
/// </para>
/// <para>
/// <b>The constraint is load-bearing and was verified by running it</b> (`research.md` R-3).
/// <c>AuditBehaviour&lt;TRequest, TResponse&gt; where TRequest : IAuditableCommand&lt;TResponse&gt;</c>
/// resolves on MediatR 14.2.0 and applies <b>only</b> to requests that satisfy it — a plain
/// <see cref="ICommand"/> was observed skipping the audit behaviour entirely, and nothing
/// threw for the requests that did not match.
/// </para>
/// </remarks>
public interface IAuditableCommand<TResponse> : IRequest<TResponse>, ICommand
{
    /// <summary>
    /// <c>Entity.Verb</c> — <c>Customer.Created</c>, <c>Ticket.StatusChanged</c>. From the
    /// naming table in `docs/sdd/04-business-rules.md`.
    /// </summary>
    /// <remarks>
    /// A declared string rather than a convention over the type name. <c>CreateCustomerCommand</c>
    /// → <c>Customer.Created</c> works until <c>ChangeStatusCommand</c>, and a convention that
    /// is right most of the time is worse than one that is always explicit — the exceptions
    /// are what an auditor reads.
    /// </remarks>
    string AuditAction { get; }

    /// <summary>
    /// What the action was about. Called with the response on the success path and with
    /// <c>null</c> on the failure path.
    /// </summary>
    /// <param name="response">The handler's response, or <c>null</c> when the handler threw
    /// or was denied.</param>
    /// <remarks>
    /// <b>The <c>null</c> case is why this takes a parameter instead of being a property.</b>
    /// A denied command has no response but does know which ticket it was refused against —
    /// from its own fields. An implementation that reads only the response returns
    /// <see cref="AuditTarget.None"/> on every denial, which is the row an investigation
    /// most needs to be complete.
    /// </remarks>
    AuditTarget DescribeTarget(TResponse? response);
}
