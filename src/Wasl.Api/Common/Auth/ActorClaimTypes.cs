namespace Wasl.Api.Common.Auth;

/// <summary>
/// The claim names the actor is read from. One place, so the issuer and the reader cannot
/// disagree (`003` assumption A-1).
/// </summary>
/// <remarks>
/// <para>
/// <b>The short JWT names, not the long <c>ClaimTypes</c> URIs.</b> `003` wrote this file against
/// <c>ClaimTypes.NameIdentifier</c> as a placeholder, on the stated assumption that `004` would
/// confirm or change it. `004` changed it: inbound claim mapping is turned off in
/// <c>Program.cs</c>, so a token's <c>sub</c> arrives as <c>sub</c>.
/// </para>
/// <para>
/// That is the whole reason the assumption was written down rather than the constant inlined —
/// with the mapping off and the long URIs here, every claim lookup would return null while the
/// token plainly contained the value, and nothing would throw. `004` AC-6 is the test.
/// </para>
/// </remarks>
internal static class ActorClaimTypes
{
    public const string UserId = JwtRegisteredClaimNames.Sub;

    public const string Email = JwtRegisteredClaimNames.Email;

    public const string Role = JwtRegisteredClaimNames.Role;

    public const string PreferredLanguage = JwtRegisteredClaimNames.PreferredLanguage;
}
