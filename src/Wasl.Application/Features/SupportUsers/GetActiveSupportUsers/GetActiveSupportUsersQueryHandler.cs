using MediatR;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Application.Features.SupportUsers.GetActiveSupportUsers;

/// <summary>
/// Active support users, both roles, ordered for display. `011` AC-13.
/// </summary>
internal sealed class GetActiveSupportUsersQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetActiveSupportUsersQuery, IReadOnlyList<SupportUserOption>>
{
    public async Task<IReadOnlyList<SupportUserOption>> Handle(
        GetActiveSupportUsersQuery request,
        CancellationToken cancellationToken)
    {
        // Projected in the query, never materialised as entities. `Select` before `ToList` means
        // PasswordHash is not in the SELECT list at all — so it cannot reach a log, a serializer,
        // or a debugger window on the way to being discarded.
        //
        // IsActive filters HERE, unlike in the assign handler, which projects the flag instead.
        // The difference is deliberate and it is the whole shape of the two answers: a picker must
        // not offer an inactive user, and an assignment must be able to tell "no such user" (404)
        // from "that user is not selectable" (400). Filtering in both places would collapse the
        // second distinction; projecting in both would publish deactivated colleagues in a
        // dropdown.
        var options = await context.ToListAsync(
            context.SupportUsers
                .Where(user => user.IsActive)

                // Role first so the picker's groups arrive already contiguous, then name. Ordered
                // in SQL rather than in the client, because two clients would otherwise sort a
                // list of Arabic names by two different collations.
                .OrderBy(user => user.Role)
                .ThenBy(user => user.FullName)
                .Select(user => new SupportUserOption(
                    user.Id,
                    user.FullName,
                    user.Role.ToString())),
            cancellationToken);

        return options;
    }
}
