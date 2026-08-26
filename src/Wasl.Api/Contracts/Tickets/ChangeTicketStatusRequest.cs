using Wasl.Domain.Tickets;

namespace Wasl.Api.Contracts.Tickets;

/// <summary>
/// The request body, exactly as `contracts/ticket-status-api.md` freezes it.
/// </summary>
/// <remarks>
/// <para>
/// <b>A separate type from the command, and the difference is the ticket id.</b> The command
/// carries it; this does not. Binding the command straight from the body would give the client a
/// <c>TicketId</c> field it could set — and a request whose route said one ticket and whose body
/// said another would change the one in the body, making the URL a suggestion.
/// </para>
/// <para>
/// <b>It lives here, not in the controller.</b> The use case owns its whole shape — command,
/// handler, validator, request, result — so everything about one operation is in one folder
/// (`CLAUDE.md`). A request record declared beside a controller action is the start of a
/// controller that owns shapes, and the next one gets declared there too.
/// </para>
/// <para>
/// <c>Note</c> defaults to <c>null</c> so the field is genuinely optional on the wire. Whether it
/// is *required* is BR-1.2's business, and that depends on the ticket's current status — which is
/// why the entity decides it and not this type.
/// </para>
/// </remarks>
public sealed record ChangeTicketStatusRequest(
    TicketStatus Status,
    string ExpectedVersion,
    string? Note = null);
