using System.Security.Claims;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Api.Common.Auth;

/// <summary>
/// <see cref="ICurrentUser"/> read from the request's <c>ClaimsPrincipal</c>.
/// </summary>
/// <remarks>
/// <para>
/// <b>Every member returns null until `004` lands, and that is the correct answer rather than
/// a placeholder.</b> There is no authentication middleware yet, so no request carries an
/// identity — and BR-9.2's anonymous events need exactly this shape. The <c>AuditLog</c>
/// columns are nullable for the same reason, so nothing downstream has to change when `004`
/// starts populating them.
/// </para>
/// <para>
/// This is also what makes AC-20 testable now: the snapshot mechanism is proven against a
/// stubbed <see cref="ICurrentUser"/> rather than waiting for a real one, so `004` inherits a
/// tested mechanism and only has to supply the values.
/// </para>
/// <para>
/// <b>Not injected into anything singleton.</b> This is scoped, and `002`'s
/// <c>ProblemDetailsFactory</c> is a singleton for a reason that is written at its
/// registration site — injecting this there would reintroduce the captive dependency `002`
/// found. The behaviours that consume it are scoped, which is why they can.
/// </para>
/// </remarks>
internal sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public Guid? UserId =>
        Guid.TryParse(Find(ActorClaimTypes.UserId), out var id) ? id : null;

    public string? Email => Find(ActorClaimTypes.Email);

    public string? Role => Find(ActorClaimTypes.Role);

    /// <summary>
    /// Returns null for an absent claim, an unauthenticated principal, or no request at all.
    /// </summary>
    /// <remarks>
    /// The <c>IsAuthenticated</c> check matters: an unauthenticated <c>ClaimsPrincipal</c> can
    /// still carry claims, and treating those as an identity would let an audit row name an
    /// actor the server never authenticated.
    /// </remarks>
    private string? Find(string claimType)
    {
        var principal = accessor.HttpContext?.User;

        if (principal?.Identity is not { IsAuthenticated: true })
        {
            return null;
        }

        var value = principal.FindFirstValue(claimType);

        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
}
