using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Api.Common.Errors;

/// <summary>
/// Routes MVC's own <c>ProblemDetails</c> through ours. `002b` AC-3.
/// </summary>
/// <remarks>
/// <para>
/// <b>The `415` is why this exists, and it is the subtler half of `002b`.</b> A `404` and a `405`
/// arrive with an empty body, so <see cref="StatusCodeEnvelope"/> can fill them. A `415` does
/// not: MVC's <c>ClientErrorResultFilter</c> has already built a body through
/// <see cref="Microsoft.AspNetCore.Mvc.Infrastructure.ProblemDetailsFactory"/>, so
/// <c>UseStatusCodePages</c> never sees it and the response goes out looking like this:
/// </para>
/// <code>
/// {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.16",
///  "title":"Unsupported Media Type","status":415,"traceId":"…"}
/// </code>
/// <para>
/// <b>That is worse than the empty body it was mistaken for, and `002`'s summary recorded it as
/// empty.</b> An empty body breaks a client's parser loudly — `002` registered a client-side
/// <c>unparseable-response</c> code for exactly that. A well-formed envelope carrying a foreign
/// <c>type</c> passes every parser, satisfies every shape assertion, and branches nowhere:
/// <c>code === 'unsupported-media-type'</c> is simply false forever. It also carries no
/// <c>instance</c> and an untranslated English <c>title</c> inside a response that asked for
/// Arabic.
/// </para>
/// <para>
/// This is the same class of failure `CLAUDE.md` records under <i>verify a measurement with
/// something below it</i>: `002`'s AC-2 grep over <c>src/</c> was green while three request
/// shapes returned the framework's envelope, because the framework builds it inside itself
/// where a grep cannot look.
/// </para>
/// <para>
/// <b>Replacing the factory rather than patching <c>ClientErrorMapping</c></b> — that option sets
/// a <c>Link</c> and a <c>Title</c> per status and would fix the <c>type</c> while leaving the
/// title in English and <c>instance</c> absent. Substituting the factory makes `002` AC-2 true in
/// the one place it was not: <b>one producer of the envelope</b>, for everything MVC composes as
/// well as everything we throw.
/// </para>
/// </remarks>
internal sealed class MvcProblemDetailsFactory(ProblemDetailsFactory factory)
    : Microsoft.AspNetCore.Mvc.Infrastructure.ProblemDetailsFactory
{
    /// <summary>Status codes this application has a registry row for.</summary>
    private static readonly Dictionary<int, string> Codes = new()
    {
        [StatusCodes.Status400BadRequest] = DomainErrorCodes.Validation,
        [StatusCodes.Status401Unauthorized] = DomainErrorCodes.Unauthenticated,
        [StatusCodes.Status403Forbidden] = DomainErrorCodes.Forbidden,
        [StatusCodes.Status404NotFound] = DomainErrorCodes.NotFound,
        [StatusCodes.Status405MethodNotAllowed] = ProblemTypes.MethodNotAllowed,
        [StatusCodes.Status415UnsupportedMediaType] = ProblemTypes.UnsupportedMediaType,
        [StatusCodes.Status500InternalServerError] = ProblemTypes.Internal,
    };

    public override ProblemDetails CreateProblemDetails(
        HttpContext httpContext,
        int? statusCode = null,
        string? title = null,
        string? type = null,
        string? detail = null,
        string? instance = null)
    {
        var status = statusCode ?? StatusCodes.Status500InternalServerError;

        // A status with no registry row keeps the framework's own body rather than being forced
        // into an invented envelope. The registry IS the contract, and manufacturing a row for a
        // status nobody registered would put a `type` on the wire that `error-contract.md` does
        // not document — which is the failure this class exists to remove, not to relocate.
        if (!Codes.TryGetValue(status, out var code))
        {
            return factory.Passthrough(httpContext, status, title, type, detail, instance);
        }

        return factory.ForCode(httpContext, code);
    }

    public override ValidationProblemDetails CreateValidationProblemDetails(
        HttpContext httpContext,
        ModelStateDictionary modelStateDictionary,
        int? statusCode = null,
        string? title = null,
        string? type = null,
        string? detail = null,
        string? instance = null)
    {
        // Left to the framework on purpose. Validation problems reach the wire through
        // ApiBehaviorOptions.InvalidModelStateResponseFactory — ModelStateEnvelope — which is
        // already ours and already decides between `validation` and `malformed-request`. Routing
        // this method through the same code would give two paths to one answer, and the day they
        // disagreed the response would depend on which one MVC happened to call.
        return factory.PassthroughValidation(
            httpContext, modelStateDictionary,
            statusCode ?? StatusCodes.Status400BadRequest, title, type, detail, instance);
    }
}
