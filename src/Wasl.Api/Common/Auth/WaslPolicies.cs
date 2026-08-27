namespace Wasl.Api.Common.Auth;

/// <summary>
/// The authorization policy names. `004`.
/// </summary>
/// <remarks>
/// <b>Public constants rather than literals at each use site.</b> A policy name is a string matched
/// at runtime: <c>[Authorize(Policy = "ManagerOnly")]</c> against a policy registered as
/// <c>"ManagersOnly"</c> throws <c>InvalidOperationException</c> on the first request to that
/// endpoint and nowhere else — not at startup, not in a build. The constant makes the typo a
/// compile error, and it is public so the integration suite asserts the same name the application
/// registers.
/// </remarks>
public static class WaslPolicies
{
    /// <summary>Authenticated, and in the <c>Manager</c> role. BR-2, BR-6.</summary>
    public const string ManagerOnly = nameof(ManagerOnly);

    /// <summary>
    /// Authenticated, any role. Not registered as a named policy — it is the <b>fallback</b>, so
    /// it applies to every endpoint that does not opt out. The constant exists for documentation
    /// and for the test that asserts the fallback is what it claims to be.
    /// </summary>
    public const string RequireAuthenticated = nameof(RequireAuthenticated);
}
