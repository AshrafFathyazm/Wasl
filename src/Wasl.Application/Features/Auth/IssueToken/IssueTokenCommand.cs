using Wasl.Application.Common.Messaging;
using Wasl.Application.Features.Settings;
using Wasl.Domain.Audit;

namespace Wasl.Application.Features.Auth.IssueToken;

/// <summary>
/// <c>POST /api/auth/token</c>. Exchanges an email and password for a signed access token.
/// </summary>
/// <remarks>
/// <para>
/// <b>An <c>IAuditableCommand</c>, so BR-9.2's sign-in events are written by the same pipeline as
/// everything else.</b> `003` reserved `Auth.LoginSucceeded` and `Auth.LoginFailed` for this
/// feature and built <c>IAuditWriter.WriteIndependentAsync</c> for the failure path.
/// </para>
/// <para>
/// <b>One outcome-neutral action, <c>Auth.SignIn</c> — a deviation from BR-9's naming table, which
/// lists <c>Auth.LoginSucceeded</c> and <c>Auth.LoginFailed</c> as two actions.</b>
/// </para>
/// <para>
/// It was written as <c>Auth.LoginSucceeded</c> first, on the assumption that the failure path
/// would produce the other name. It does not, and running it is what showed why: `003`'s
/// <c>AuditBehaviour</c> composes every row with <c>action: request.AuditAction</c>, a single
/// property with no knowledge of which path ran, so a failed sign-in was writing
/// <c>Action = Auth.LoginSucceeded, Outcome = Failed</c> — a row that contradicts itself.
/// </para>
/// <para>
/// The alternative was to give <c>IAuditableCommand</c> a second, outcome-dependent action. That
/// puts the same distinction in two columns, and two columns that must agree eventually will not:
/// a row could then say <c>LoginFailed / Success</c>. <c>Outcome</c> already carries it, so the
/// action names the event and the outcome names how it went — which is the rule every other action
/// in this codebase already follows.
/// </para>
/// </remarks>
public sealed record IssueTokenCommand(string Email, string Password)
    : IAuditableCommand<IssueTokenResult>
{
    public string AuditAction => "Auth.SignIn";

    /// <summary>
    /// The user, on success. On failure there is deliberately **no id** — only the attempted
    /// email, and it goes on the row as the label.
    /// </summary>
    /// <remarks>
    /// The attempted email is the whole value of a failed-sign-in row: "someone tried this
    /// address and failed" is what an investigation reads. It is not a secret — the attacker
    /// supplied it — and it is not the password, which never appears anywhere.
    /// </remarks>
    public AuditTarget DescribeTarget(IssueTokenResult? response) =>
        response is null
            ? new AuditTarget("SupportUser", null, Email)
            : new AuditTarget("SupportUser", response.User.Id, response.User.Email);
}

/// <summary>The `200` body, exactly as `contracts/auth-api.md` freezes it.</summary>
/// <remarks>
/// <para>
/// <c>ExpiresAtUtc</c> is issued so the client never decodes the JWT, and <c>TokenType</c> is a
/// constant so the client composes the header rather than hard-coding the scheme.
/// </para>
/// <para>
/// <b><c>Theme</c> was added by `022`, and it is a CONTRACT CHANGE to `004`'s frozen
/// <c>auth-api.md</c></b> — recorded under Contract changes in `022`'s <c>plan.md</c>, not made
/// silently. It is additive, so no existing consumer breaks.
/// </para>
/// <para>
/// <b>Why it rides on the token response instead of being fetched.</b> The theme has to reach
/// <c>:root</c> before the first paint after sign-in; a separate request means the default theme
/// renders and then snaps to the tenant's, on every sign-in, on every device. That flash is the
/// first thing anyone notices and it is invisible to every test that does not measure paint
/// order (AC-17). The same object is served by <c>GET /api/settings/branding</c> for every later
/// load, and AC-3 asserts the two are <b>field-for-field equal</b> by calling both and comparing
/// — not by two independent shape assertions, which both pass while the two drift apart.
/// </para>
/// </remarks>
public sealed record IssueTokenResult(
    string AccessToken,
    string TokenType,
    DateTime ExpiresAtUtc,
    AuthenticatedUser User,
    BrandingResponse Theme);

/// <summary>
/// Everything the UI needs about the signed-in user. <b>Never the password hash.</b>
/// </summary>
public sealed record AuthenticatedUser(
    Guid Id,
    string FullName,
    string Email,
    string Role,
    string PreferredLanguage);
