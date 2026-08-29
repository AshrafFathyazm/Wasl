using System.Globalization;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.Options;
using Wasl.Api.Common.Errors;

namespace Wasl.Api.Common.Localization;

/// <summary>
/// Culture resolution and the catalogues. `005`, BR-8.
/// </summary>
internal static class LocalizationRegistration
{
    /// <summary>The default when nothing else resolves. BR-8.3, FR-5.8.</summary>
    public const string DefaultCulture = "en";

    /// <summary>Where the supported list is read from. NFR-9.</summary>
    public const string SupportedCulturesKey = "Localization:SupportedCultures";

    public static IServiceCollection AddWaslLocalization(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // No ResourcesPath. SharedResource.cs and its two .resx sit in one folder, so the
        // manifest name a .resx compiles to IS the marker type's full name and the two cannot
        // drift — see SharedResource for why the alternative is a path nobody would guess.
        services.AddLocalization();

        services.AddSingleton<IProblemMessageSource, LocalizedProblemMessageSource>();

        var supported = ReadSupportedCultures(configuration);

        services.Configure<RequestLocalizationOptions>(options =>
        {
            options.DefaultRequestCulture = new RequestCulture(DefaultCulture);
            options.ApplyCurrentCultureToResponseHeaders = true;

            // Both lists. SupportedCultures governs formatting and SupportedUICultures governs
            // resource lookup, so setting one gives Arabic text with English number formatting,
            // or the reverse — and neither throws.
            options.SupportedCultures = [.. supported.Select(CultureInfo.GetCultureInfo)];
            options.SupportedUICultures = [.. supported.Select(CultureInfo.GetCultureInfo)];

            // ar-EG resolves to ar; fr resolves to nothing and falls through to the default.
            // BR-8.2, BR-8.3 — asking for a language the system does not speak is not a client
            // error, so this must never become a 400.
            options.FallBackToParentCultures = true;
            options.FallBackToParentUICultures = true;

            // ── The provider list is REPLACED, not appended to. BR-8.4, AC-3 ──────────
            //
            // The framework's default list is query string, COOKIE, Accept-Language. The
            // cookie provider would outrank the header while appearing nowhere in BR-8.4, so
            // a stale cookie from a previous session would quietly beat what the browser asked
            // for. Clearing first is what makes the order in this file the whole truth.
            options.RequestCultureProviders.Clear();
            options.RequestCultureProviders.Add(new QueryStringRequestCultureProvider());
            options.RequestCultureProviders.Add(new PreferredLanguageCultureProvider());
            options.RequestCultureProviders.Add(new AcceptLanguageHeaderRequestCultureProvider());
        });

        return services;
    }

    /// <summary>
    /// The supported list, from configuration, defaulting to <c>en</c> and <c>ar</c>.
    /// </summary>
    /// <remarks>
    /// NFR-9 claims a third locale is a resource file and a configuration entry with no code
    /// change. That claim is only true if the list is read from configuration, and AC-19 tests
    /// it by configuring a third culture in a test host — which is the difference between the
    /// claim being made and the claim being true.
    /// <br/>
    /// An empty or absent configuration section falls back to the two rather than to none: a
    /// misconfigured deployment that supports no cultures at all serves every request in the
    /// invariant culture, and nothing throws.
    /// </remarks>
    private static string[] ReadSupportedCultures(IConfiguration configuration)
    {
        var configured = configuration.GetSection(SupportedCulturesKey).Get<string[]>();

        return configured is { Length: > 0 }
            ? configured
            : [DefaultCulture, "ar"];
    }
}
