namespace Wasl.Api.Common.Errors;

/// <summary>
/// The one and only point at which a human sentence enters a response.
/// </summary>
/// <remarks>
/// <para>
/// Everything upstream carries a symbolic <b>key</b>: a domain exception's
/// <c>MessageKey</c>, a validator's message, a registry row's <c>TitleKey</c>. This turns
/// a key into a sentence, and nothing else does.
/// </para>
/// <para>
/// <b>The failure this prevents.</b> `005-localization-core` arrives and finds eleven
/// places that concatenate an English sentence. It visits each, invents a key, adds it to
/// two catalogues, and hopes none was missed. The ones missed return plausible English
/// forever — ADR-007 §5 names this as the reason for symbolic keys. With this seam, `005`
/// adds a `.resx`-backed implementation, changes one registration line, and deletes the
/// static table. AC-18 makes that testable <i>now</i>, before `005` exists.
/// </para>
/// </remarks>
internal interface IProblemMessageSource
{
    /// <summary>
    /// Resolves a key to a sentence in the culture recorded on the request.
    /// </summary>
    /// <remarks>
    /// The culture comes from <paramref name="context"/>, never from
    /// <c>CultureInfo.CurrentUICulture</c>. Whether the localization middleware has already
    /// restored the ambient culture by the time the outermost exception handler runs is not
    /// something to rely on (spec Q-E): assume it has not. If the assumption is wrong this
    /// is merely belt-and-braces; if it is right and we had relied on ambient state, every
    /// Arabic error would silently return English. AC-28.
    /// </remarks>
    string Resolve(HttpContext context, string key, IReadOnlyList<object>? arguments = null);
}
