using Microsoft.AspNetCore.Localization;
using Wasl.Api.Common.Auth;

namespace Wasl.Api.Common.Localization;

/// <summary>
/// Reads the signed-in user's preferred language from their token. BR-8.4, `005` AC-5.
/// </summary>
/// <remarks>
/// <para>
/// <b>The claim already exists, and `005` was wrong about that for half a day.</b> The spec
/// recorded "confirmed: `004` does not emit a language claim", reasoned from ADR-005 listing
/// only <c>sub</c>, <c>email</c> and <c>role</c>. Decoding a real token says otherwise: `004`
/// shipped <c>SupportUser.PreferredLanguage</c>, its column, and
/// <c>preferred_language</c> in the token. <b>A document was believed over a measurement</b>,
/// which is the one habit this repository's testing rules exist to break.
/// <br/>
/// The consequence is visible immediately: the seeded Manager prefers <c>ar</c>, so every error
/// on an authenticated request is Arabic the moment this provider is registered. That is BR-8.4
/// working, not a defect — and roughly a dozen tests asserting English sentences had to say so
/// explicitly rather than rely on a default that no longer applies to them.
/// </para>
/// <para>
/// <b>It must sit after <c>UseAuthentication()</c> to see anything</b>, since it reads
/// <c>HttpContext.User</c>. ADR-007 decision 4 calls the reverse order the single most likely
/// defect in the build, and it is: with localization first, the claim is invisible, every user
/// is served in whatever their browser guessed, and nothing anywhere reports an error.
/// </para>
/// <para>
/// The claim name is <see cref="ActorClaimTypes.PreferredLanguage"/> — <b>`004`'s own constant,
/// reused rather than redeclared.</b> `005` first added a second constant beside this provider,
/// which is the shape of a bug that only bites when one of the two changes.
/// </para>
/// </remarks>
internal sealed class PreferredLanguageCultureProvider : RequestCultureProvider
{
    public override Task<ProviderCultureResult?> DetermineProviderCultureResult(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        // An unauthenticated request, an expired token, an invalid token: all three arrive here
        // with no identity, and all three must fall through rather than fail. The `401` they are
        // heading for is itself localized from `Accept-Language`, because the user who cannot
        // read English is precisely the one who needs that sentence translated.
        var value = httpContext.User.FindFirst(ActorClaimTypes.PreferredLanguage)?.Value;

        // Whitespace counts as absent. A token minted elsewhere with an empty claim must not
        // out-rank the header with nothing.
        if (string.IsNullOrWhiteSpace(value))
        {
            return NullProviderCultureResultTask;
        }

        // Returned unvalidated on purpose. The supported-culture filter downstream is the one
        // place that decides what is speakable, and duplicating that decision here would mean
        // two lists to keep in step. A claim of `de` is returned, rejected by the filter, and
        // resolution continues to the next provider — not a `400`, not a `500`.
        return Task.FromResult<ProviderCultureResult?>(new ProviderCultureResult(value.Trim()));
    }

    private static readonly Task<ProviderCultureResult?> NullProviderCultureResultTask =
        Task.FromResult<ProviderCultureResult?>(null);
}
