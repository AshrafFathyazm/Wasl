using System.Globalization;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.Localization;
using Wasl.Api.Common.Errors;

namespace Wasl.Api.Common.Localization;

/// <summary>
/// Resolves a message key against the shipped catalogues. `005`, replacing `002`'s English
/// dictionary.
/// </summary>
/// <remarks>
/// <para>
/// `002` promised this: a `.resx`-backed implementation, one changed registration line, the
/// static table deleted, and <b>no other production file touched</b>. That held —
/// <see cref="ProblemDetailsFactory"/> is unchanged.
/// </para>
/// <para>
/// <b>The culture comes from the request, never from <c>CultureInfo.CurrentUICulture</c>, and
/// `002` was right to insist.</b> <see cref="IProblemMessageSource"/> says so and calls it
/// belt-and-braces; `005` measured that it is not. The outermost exception handler runs at the
/// TOP of the pipeline, so by the time it builds a body the localization middleware has already
/// unwound and restored the ambient culture. Reading <c>CurrentUICulture</c> there returns the
/// process default, and <b>every error response would be English while every success response
/// was Arabic</b> — which is exactly the shape of the defect this feature exists to fix, arriving
/// through a second door.
/// </para>
/// <para>
/// So the culture is read from <see cref="IRequestCultureFeature"/>, which lives on the context
/// and survives the unwind, and it is applied around the lookup rather than assumed. The swap is
/// restored in a <c>finally</c>: this runs on a request thread that the thread pool hands to
/// somebody else afterwards.
/// </para>
/// <para>
/// <b>A key in neither catalogue returns the key and does not throw</b> — `005` Q-I, ruled, and
/// it is `002`'s reasoning unchanged: an exception raised while building an error response turns
/// a `409` into a `500` and loses the original failure. A missing sentence is cosmetic; a missing
/// sentence that destroys the real error is not.
/// </para>
/// <para>
/// <b>That behaviour is invisible, so it is not the only guard.</b> A wrong resource path makes
/// every lookup return its key, and the result is a well-formed response carrying
/// <c>Error.Auth.InvalidCredentials</c> where a sentence belongs — which has shipped three times.
/// Three tests stand behind it: `002`'s <c>ResourceKeyLeakTests</c>, `002`'s
/// <c>MessageKeyCoverageTests</c>, and `005` AC-16, which asserts
/// <see cref="LocalizedString.ResourceNotFound"/> is <c>false</c> for every shipped key in both
/// cultures. <b>Only the third can tell a missing translation from a broken lookup.</b>
/// </para>
/// </remarks>
internal sealed class LocalizedProblemMessageSource(IStringLocalizer<SharedResource> localizer)
    : IProblemMessageSource
{
    public string Resolve(HttpContext context, string key, IReadOnlyList<object>? arguments = null)
    {
        var requested = context.Features.Get<IRequestCultureFeature>()?.RequestCulture.UICulture;
        var previous = CultureInfo.CurrentUICulture;

        if (requested is not null)
        {
            CultureInfo.CurrentUICulture = requested;
        }

        try
        {
            var localized = arguments is { Count: > 0 }
                ? localizer[key, [.. arguments]]
                : localizer[key];

            // ResourceNotFound already implies Value == Name. Returned explicitly so the
            // contract is readable here rather than inferred from IStringLocalizer's docs.
            return localized.ResourceNotFound ? key : localized.Value;
        }
        finally
        {
            CultureInfo.CurrentUICulture = previous;
        }
    }
}
