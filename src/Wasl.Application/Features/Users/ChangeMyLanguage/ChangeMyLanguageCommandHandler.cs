using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Application.Features.Users.ChangeMyLanguage;

/// <summary>
/// Writes the caller's language preference. `014` AC-1, AC-4, AC-9.
/// </summary>
/// <remarks>
/// <para>
/// <b>An unknown or inactive subject is `401`, not `404`</b> — the frozen contract says so, and
/// the reason is the one BR-4.4 gives for customers: a `404` here tells a caller holding a valid
/// token that the account it names has been removed, which is information the token alone should
/// not reveal. The two cases are answered identically on purpose.
/// </para>
/// <para>
/// <b>Storing the same language twice is a `204`, not a `409`.</b> A preference is not a state
/// machine, and `012`'s same-status rule does not generalise to it: nobody is racing anybody for
/// their own setting.
/// </para>
/// </remarks>
internal sealed class ChangeMyLanguageCommandHandler(
    IApplicationDbContext context,
    ICurrentUser currentUser) : IRequestHandler<ChangeMyLanguageCommand, Unit>
{
    public async Task<Unit> Handle(
        ChangeMyLanguageCommand request,
        CancellationToken cancellationToken)
    {
        // From the token, never from the request. There is no field a caller could set to write
        // somebody else's preference, which is stronger than checking one.
        var userId = currentUser.UserId
            ?? throw new UnauthenticatedException();

        // Through the abstraction's own helper, not EF's extension method — `Wasl.Application`
        // cannot see Microsoft.EntityFrameworkCore, and an architecture test fails the build on
        // it. `009` declared FirstOrDefaultAsync for exactly this reason.
        var user = await context.FirstOrDefaultAsync(
            context.SupportUsers.Where(candidate => candidate.Id == userId && candidate.IsActive),
            cancellationToken)
            ?? throw new UnauthenticatedException();

        user.ChangeLanguage(request.Language);

        await context.SaveChangesAsync(cancellationToken);

        return Unit.Value;
    }
}
