using MediatR;

namespace Wasl.Application.Features.SupportUsers.GetActiveSupportUsers;

/// <summary>
/// <c>GET /api/support-users</c> — the assignee picker's source. `011` AC-13.
/// </summary>
/// <remarks>
/// <para>
/// <b>Not an <c>ICommand</c>, deliberately.</b> It changes no state, so it opens no transaction
/// and writes no audit row — and `003`'s NFR-10 scanner only requires an audit action of things
/// that implement <c>ICommand</c>. A query marked as a command would be audited on every keystroke
/// of a picker.
/// </para>
/// <para>
/// <b>No paging, no search, and no filter parameters</b> (`spec.md` A-4). The table is seeded and
/// holds single digits of rows, so paging would be ceremony around a result that fits in one
/// response. It is recorded as a known limitation rather than designed around: if user management
/// ever ships, this becomes a paged endpoint and that **is** a breaking change for the client.
/// </para>
/// </remarks>
public sealed record GetActiveSupportUsersQuery : IRequest<IReadOnlyList<SupportUserOption>>;

/// <summary>
/// One selectable assignee. `011` AC-13.
/// </summary>
/// <remarks>
/// <para>
/// <b>Three fields, and nothing else.</b> No email, no <c>preferredLanguage</c>, no
/// <c>createdAtUtc</c> — and above all no <c>passwordHash</c>, which is why this projection exists
/// rather than returning <c>SupportUser</c>. An endpoint every authenticated user may call is not
/// the place to publish more of the identity table than a dropdown needs.
/// </para>
/// <para>
/// <c>Role</c> is the enum value as a string, untranslated (BR-8.7): the picker groups by it and a
/// localized value would make the grouping locale-dependent.
/// </para>
/// </remarks>
public sealed record SupportUserOption(Guid Id, string FullName, string Role);
