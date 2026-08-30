using Microsoft.AspNetCore.Diagnostics;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Api.Common.Errors;

/// <summary>
/// Gives a body to the statuses the framework short-circuits without throwing. `002b`.
/// </summary>
/// <remarks>
/// <para>
/// <b>`002`'s `research.md` R-1 calls this the feature's most important finding, and it is still
/// true: no exception handler in any framework sees these.</b> Routing answers a `404` for an
/// unmatched path and a `405` for an undeclared method by writing a status code and stopping —
/// nothing is thrown, so <c>UseExceptionHandler</c> is never entered and
/// <see cref="GlobalExceptionHandler"/> never runs. They need a different mechanism, and this is
/// it.
/// </para>
/// <para>
/// <b>It writes only into an EMPTY response, which is what makes it safe to put near the top.</b>
/// <c>UseStatusCodePages</c> invokes this for any 400–599 with no body written. Every response
/// that already carries an envelope — a thrown `409`, `004b`'s `401` and `403`, MVC's `400` —
/// has a body by the time control returns here, so this sees none of them. `002b` AC-6 asserts
/// that by comparing full bodies before and after, because <b>double-writing onto a response
/// that was already correct is exactly what a shape assertion would not catch</b>.
/// </para>
/// <para>
/// <b>Registered AFTER <c>UseAuthentication</c>/<c>UseAuthorization</c> in the pipeline order,
/// and that is a security property rather than a preference.</b> Measured before this was
/// written: an anonymous request to <c>/api/nope</c>, to <c>/api/tickets</c>, to <c>/nope</c> and
/// with a wrong verb all return an identical `401`, because the fallback policy refuses before
/// routing ever resolves a `404`. <b>An anonymous caller therefore cannot tell a real route from
/// an invented one</b> — and a status-code-pages registration that ran earlier would answer
/// `404` for the invented one and `401` for the real one, handing out the route table one guess
/// at a time. AC-18 asserts the four are indistinguishable.
/// </para>
/// <para>
/// The culture is read off the context by <see cref="IProblemMessageSource"/>, not from ambient
/// state: by the time this runs, the localization middleware has unwound.
/// </para>
/// </remarks>
internal static class StatusCodeEnvelope
{
    /// <summary>Maps a bare status to the registry code that describes it.</summary>
    /// <remarks>
    /// A status with no entry is left alone rather than forced into a generic envelope. An
    /// invented `418` body would be a fabricated contract, and the registry is the contract.
    /// </remarks>
    private static readonly Dictionary<int, string> Codes = new()
    {
        // `not-found` is shared with the thrown NotFoundException on purpose: the contract says a
        // client cannot tell "the resource does not exist" from "the route does not", and BR-4.4
        // wants exactly that. The other two are `ProblemTypes` codes that NOTHING throws — no
        // DomainException carries them, because no handler is ever reached.
        [StatusCodes.Status404NotFound] = DomainErrorCodes.NotFound,
        [StatusCodes.Status405MethodNotAllowed] = ProblemTypes.MethodNotAllowed,
        [StatusCodes.Status415UnsupportedMediaType] = ProblemTypes.UnsupportedMediaType,
    };

    public static async Task WriteAsync(StatusCodeContext context)
    {
        var response = context.HttpContext.Response;

        // Belt and braces on UseStatusCodePages' own contract. If anything ever writes a body
        // and then falls through to here, appending a second one produces a response that is not
        // valid JSON at all — worse than the empty body this exists to fix.
        if (response.HasStarted || !Codes.TryGetValue(response.StatusCode, out var code))
        {
            return;
        }

        var problems = context.HttpContext.RequestServices
            .GetRequiredService<ProblemDetailsFactory>();

        var problem = problems.ForCode(context.HttpContext, code);

        await response.WriteAsJsonAsync(
            problem, problem.GetType(), options: null, contentType: "application/problem+json");
    }
}
