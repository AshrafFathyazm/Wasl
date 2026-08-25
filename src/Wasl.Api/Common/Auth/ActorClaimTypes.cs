using System.Security.Claims;

namespace Wasl.Api.Common.Auth;

/// <summary>
/// The claim names the actor is read from. One place, so `004` naming its token differently
/// is one edit rather than a search (`spec.md` A-1).
/// </summary>
/// <remarks>
/// The defaults are the .NET standard URIs. `004` owns the token shape and may issue short
/// names instead — <c>sub</c>, <c>email</c>, <c>role</c> — in which case only this file
/// changes. It is a separate file from the reader for exactly that reason: a constant beside
/// its use gets copied to the second use.
/// </remarks>
internal static class ActorClaimTypes
{
    public const string UserId = ClaimTypes.NameIdentifier;

    public const string Email = ClaimTypes.Email;

    public const string Role = ClaimTypes.Role;
}
