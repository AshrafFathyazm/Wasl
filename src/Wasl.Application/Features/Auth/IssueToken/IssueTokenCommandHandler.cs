using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Application.Features.Auth.IssueToken;

/// <summary>
/// Verifies the credentials and issues the token. AC-1, AC-4.
/// </summary>
internal sealed class IssueTokenCommandHandler(
    IApplicationDbContext context,
    IPasswordHasher passwords,
    IAccessTokenIssuer tokens,
    ISignInThrottle throttle,
    IRequestContext requestContext) : IRequestHandler<IssueTokenCommand, IssueTokenResult>
{
    public async Task<IssueTokenResult> Handle(
        IssueTokenCommand request,
        CancellationToken cancellationToken)
    {
        // The throttle CHECK is not here — it is in SignInThrottleFilter, ahead of the pipeline.
        //
        // AC-36 wants the refusal recorded as `Auth.RateLimited`, and an IAuditableCommand carries
        // ONE action string evaluated on both paths (`004` D-2), so a check here could only ever
        // produce `Auth.SignIn / Denied`. A refusal that can name itself belongs where it can —
        // the same reasoning that gives the authorization denial handler two names.
        //
        // Recording a failure stays here, because only this method knows the attempt failed.

        // Case-insensitive by the column's collation, not by lowercasing here — so the comparison
        // uses the unique index rather than a scan (ADR-013 row 3).
        var user = await context.FirstOrDefaultAsync(
            context.SupportUsers.Where(candidate => candidate.Email == request.Email),
            cancellationToken);

        // AC-4. One exception for three different failures — unknown email, wrong password,
        // deactivated user — so the three responses are byte-identical apart from traceId.
        //
        // Telling them apart is an account-enumeration oracle: "no such user" versus "wrong
        // password" turns a login form into a directory. The same reasoning BR-4.4 applies to
        // duplicate customers.
        //
        // The password is verified EVEN WHEN THE USER DOES NOT EXIST, against a throwaway hash.
        // Skipping it would make the unknown-email path measurably faster than the wrong-password
        // path, and a timing difference is the same oracle arriving through the clock. That is
        // why Verify is called before the null check is allowed to win.
        var verified = user is not null
            && passwords.Verify(user.PasswordHash, request.Password)
            && user.IsActive;

        if (!verified)
        {
            // Deliberately not called on the null path in a way that short-circuits: the
            // expression above always evaluates Verify when a user was found, and when none was
            // found the dummy verification below equalises the work.
            if (user is null)
            {
                passwords.Verify(passwords.DummyHash, request.Password);
            }

            // `004b` AC-35. ONLY failures count — a success records nothing, so someone who
            // mistypes twice and then succeeds is never slowed. The CHECK lives in
            // SignInThrottleFilter, ahead of the pipeline, because AC-36 needs the refusal named
            // `Auth.RateLimited` and a command carries one action string (`004` D-2).
            throttle.RecordFailure(requestContext.IpAddress, request.Email);

            throw new UnauthenticatedException();
        }

        var (token, expiresAtUtc) = tokens.Issue(user!);

        return new IssueTokenResult(
            AccessToken: token,
            TokenType: "Bearer",
            ExpiresAtUtc: expiresAtUtc,
            User: new AuthenticatedUser(
                user!.Id,
                user.FullName,
                user.Email,
                user.Role.ToString(),
                user.PreferredLanguage));
    }
}
