using Wasl.Domain.Users;

namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// The role test, in one place. `016`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Written because there were three copies of it and they were not written the same way.</b>
/// <c>AssignTicketCommandHandler</c> compared against <c>nameof(SupportRole.Manager)</c>,
/// <c>GetTicketByIdQueryHandler</c> against the literal <c>"Manager"</c>, and
/// <c>DashboardAggregatesQuery</c> against the literal too. All three agree today — the string
/// and the member name are the same characters — which is exactly the property that makes a
/// rename of <see cref="SupportRole.Manager"/> break two of the three silently while the build
/// stays green.
/// </para>
/// <para>
/// <b><see cref="ICurrentUser.Role"/> is a string on purpose and stays one</b> — BR-9.6 snapshots
/// it verbatim onto the audit row, and a row has to keep meaning what it meant when it was
/// written. So the comparison cannot be turned into an enum on the interface; it can only be
/// written once.
/// </para>
/// <para>
/// <c>StringComparison.Ordinal</c>, not <c>OrdinalIgnoreCase</c>: the claim is issued by
/// <c>JwtAccessTokenIssuer</c> from <c>SupportRole.ToString()</c>, so a case difference means the
/// token was minted by something else and should not be honoured.
/// </para>
/// </remarks>
public static class CurrentUserExtensions
{
    /// <summary>
    /// Whether the caller holds the <see cref="SupportRole.Manager"/> role.
    /// </summary>
    /// <remarks>
    /// <c>false</c> for an unauthenticated caller rather than throwing. Every consumer uses this
    /// to decide whether to <i>widen</i> something — the dashboard's scope, an action offered to
    /// the client — so <c>false</c> is the closed answer, and the fallback authentication policy
    /// means a null role cannot reach a handler anyway.
    /// </remarks>
    public static bool IsManager(this ICurrentUser currentUser)
    {
        ArgumentNullException.ThrowIfNull(currentUser);

        return string.Equals(
            currentUser.Role, nameof(SupportRole.Manager), StringComparison.Ordinal);
    }
}
