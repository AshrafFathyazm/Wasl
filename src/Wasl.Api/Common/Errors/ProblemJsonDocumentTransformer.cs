using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Wasl.Api.Common.Errors;

/// <summary>
/// Makes the document say `application/problem+json` on every failure. `002c` AC-3.
/// </summary>
/// <remarks>
/// <para>
/// <b>The attributes were already right and the document was still wrong.</b> Every action carries
/// <c>[ProducesResponseType(typeof(ProblemDetails), …)]</c> for its error statuses — thirty-eight
/// of them across thirteen actions. Measured on the generated document:
/// </para>
/// <code>
/// GET /api/customers -> 401: text/plain, application/json, text/json
/// </code>
/// <para>
/// <c>ProducesResponseType</c> declares the <b>type</b> and says nothing about the <b>media
/// type</b>, so MVC lists whatever formatters it could negotiate — and the document described a
/// content type this API never sends. A client generated from it would type failure bodies wrong
/// on every endpoint, which is the one path a client cannot easily test its way out of.
/// </para>
/// <para>
/// <b>A document transformer rather than an MVC convention, and the first attempt is why.</b>
/// `002c` wrote an <c>IActionModelConvention</c> and reverted it: the content types the API
/// explorer reports do not live on <c>ProducesResponseTypeAttribute</c>, which exposes no
/// <c>ContentTypes</c> at all. The document is where the defect is visible, so the document is
/// where it is corrected — and the assertion that catches a regression reads the same object this
/// edits.
/// </para>
/// <para>
/// <b>4xx and 5xx only.</b> A `200` is <c>application/json</c> and stays that way. Touching
/// success responses would be a contract change; this is a documentation fix.
/// </para>
/// <para>
/// <b>It rewrites rather than appends.</b> Leaving <c>application/json</c> beside
/// <c>application/problem+json</c> would let a generator pick either, and picking the first is
/// exactly the behaviour that produced the wrong types to begin with.
/// </para>
/// </remarks>
internal sealed class ProblemJsonDocumentTransformer : IOpenApiDocumentTransformer
{
    private const string ProblemJson = "application/problem+json";

    public Task TransformAsync(
        OpenApiDocument document,
        OpenApiDocumentTransformerContext context,
        CancellationToken cancellationToken)
    {
        foreach (var path in document.Paths)
        {
            foreach (var operation in path.Value.Operations ?? [])
            {
                foreach (var response in operation.Value.Responses ?? [])
                {
                    if (!int.TryParse(response.Key, out var status) || status < 400)
                    {
                        continue;
                    }

                    var content = response.Value.Content;

                    if (content is null || content.Count == 0)
                    {
                        continue;
                    }

                    // Keep the schema the explorer already worked out — it is ProblemDetails, from
                    // the attribute — and give it the one media type this API answers with.
                    var schema = content.Values.First();

                    content.Clear();
                    content[ProblemJson] = schema;
                }
            }
        }

        return Task.CompletedTask;
    }
}
