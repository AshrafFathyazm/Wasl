using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Wasl.Api.Common.Errors;

/// <summary>
/// Turns MVC's model-state failure into one of two envelopes. `002b` AC-15 … AC-17, Q-A.
/// </summary>
/// <remarks>
/// <para>
/// <b>Two envelopes, because they are two different answers.</b> `errors/validation` means
/// *these fields are wrong, fix them*; `errors/malformed-request` means *your request was not
/// readable at all*. The frozen contract registers both and distinguishes them deliberately —
/// and a client that renders field errors will happily try to place them on a form, which is why
/// the second one carries no <c>errors</c> object.
/// </para>
/// <para>
/// <b>What was measured before this existed, and it is the reason Q-A widened the scope:</b>
/// <c>POST /api/tickets</c> with <c>{not json</c> returned
/// </para>
/// <code>
/// "type": "…/errors/validation",   &lt;- the wrong one
/// "errors": {
///   "$": ["'n' is an invalid start of a property name. Expected a '\"'.
///          Path: $ | LineNumber: 0 | BytePositionInLine: 1."],
///   "command": ["The command field is required."] }
/// </code>
/// <para>
/// Three faults in one body. A <c>System.Text.Json</c> parser diagnostic served to the caller,
/// naming byte offsets in the payload — the same family as a stack trace in <c>detail</c>, which
/// `CLAUDE.md` forbids, arriving through <c>errors</c> instead. The wrong <c>type</c>. And
/// <c>command</c>, which is the action method's <b>parameter name</b>, presented as a form field.
/// </para>
/// <para>
/// <b>Detection is STRUCTURAL, not textual.</b> A parse failure attaches the exception to the
/// model-state error; a plain validation failure carries only an <c>ErrorMessage</c> and a null
/// <c>Exception</c>. Matching on the message text — or on the <c>$</c> key — would break the
/// first time the framework reworded either, and would break <b>silently</b>: the response would
/// go straight back to leaking the diagnostic with nothing failing.
/// <br/>
/// First written as <c>error.Exception is JsonException</c>, which read correctly and matched
/// nothing — the live probe still returned <c>errors/validation</c>. The formatter wraps it.
/// </para>
/// </remarks>
internal static class ModelStateEnvelope
{
    public static IActionResult Build(ActionContext context)
    {
        var problems = context.HttpContext.RequestServices
            .GetRequiredService<ProblemDetailsFactory>();

        var problem = IsUnreadable(context)
            ? problems.Malformed(context.HttpContext)
            : problems.FromValidationFailures(context.HttpContext, Failures(context.ModelState));

        return new ObjectResult(problem)
        {
            StatusCode = problem.Status,
            ContentTypes = { "application/problem+json" },
        };
    }

    /// <summary>The body could not be parsed, so no field is at fault.</summary>
    /// <remarks>
    /// <b>Keyed on the JSON path, after two structural attempts failed against a live probe.</b>
    /// <c>error.Exception is JsonException</c> matched nothing, and so did
    /// <c>error.Exception is not null</c> — because <c>SystemTextJsonInputFormatter</c> wraps the
    /// parse failure in an <c>InputFormatterException</c>, and <c>TryAddModelError</c>
    /// special-cases that type by storing its <b>message</b> and leaving <c>Exception</c> null.
    /// The exception the code was reaching for is never there.
    /// <br/>
    /// So the signal is the KEY. <c>System.Text.Json</c> reports the failure at its JSON path, and
    /// <c>$</c> — the document ROOT — cannot collide with a model property, because no C#
    /// identifier begins with one. A structural fact about the path syntax, rather than a match
    /// on prose.
    /// <br/>
    /// <b>The root ONLY, and that narrowing was a test's doing.</b> The first version also matched
    /// <c>$.field</c>, which turned an unparseable enum or Guid into "your request was
    /// unreadable" — and `002`'s <c>ModelBindingEnvelopeTests</c> went red on four cases. It was
    /// right: <c>$.category</c> means one FIELD failed to parse and the client can fix that field,
    /// while <c>$</c> means the document never became JSON at all. Over-eager detection is a
    /// worse failure than the one being fixed, and it would have looked like a win in every
    /// malformed-body test.
    /// <br/>
    /// <b>Each attempt was measured against the running API, not reasoned about.</b> Both read
    /// correctly and both left `errors/validation` on the wire.
    /// </remarks>
    private static bool IsUnreadable(ActionContext context) =>
        context.ModelState.ContainsKey(JsonRoot)

        // A body of zero bytes never reaches the reader, so there is no `$` key to find — MVC
        // reports the ACTION PARAMETER as missing instead, under its own name, which is an
        // internal identifier and exactly the leak this class exists to close.
        //
        // `is 0`, never `is 0 or null`. A null ContentLength means chunked transfer, which is what
        // HttpClient uses for perfectly valid JSON — the first version tested for it and turned
        // every ordinary validation failure into "your request was unreadable".
        || context.HttpContext.Request.ContentLength is 0;

    /// <summary>The JSON document root — the whole payload, not a field within it.</summary>
    private const string JsonRoot = "$";

    /// <summary>
    /// The field errors, with anything the caller cannot act on removed.
    /// </summary>
    /// <remarks>
    /// Two exclusions, both measured rather than imagined. <c>$</c> is the JSON root, not a form
    /// field. And an entry whose <c>ErrorMessage</c> is empty carries only an
    /// <see cref="ModelError.Exception"/>, whose message is an internal diagnostic — MVC leaves
    /// the text blank precisely because it is not meant for a user, and serialising it would put
    /// the exception's own message on the wire.
    /// </remarks>
    private static Dictionary<string, string[]> Failures(ModelStateDictionary modelState)
    {
        // A JSON-path key means the READER failed on that field, and its message is a parser
        // diagnostic. Measured on the running API, this is what one of them contains:
        //
        //   "$.category": ["The JSON value could not be converted to
        //     Wasl.Application.Features.Tickets.CreateTicket.CreateTicketCommand.
        //     Path: $.category | LineNumber: 0 | BytePositionInLine: 102."]
        //
        // A fully-qualified internal type name, a byte offset, and a JSON path, served to the
        // caller. `002` has a test asserting this response is `errors/validation` and it passes —
        // it asserts the STATUS and never reads the message, which is the shape-not-content trap
        // `CLAUDE.md` records.
        //
        // The status stays `validation`, because `002` chose it and a field that failed to parse
        // IS a field the client can fix. What changes is the message and the key: the field name
        // without its path, and a symbolic key the catalogue resolves in both languages.
        var unreadableFields = modelState
            .Where(entry => entry.Key.StartsWith(JsonPathPrefix, StringComparison.Ordinal))
            .Select(entry => entry.Key[JsonPathPrefix.Length..])
            .Where(field => field.Length > 0)
            .ToList();

        if (unreadableFields.Count > 0)
        {
            // ONLY these. The other entries are consequences of the same failure — the parameter
            // could not be built, so MVC also reports it as missing under its own name, which is
            // an internal identifier and not a form field.
            return unreadableFields.ToDictionary(
                field => field,
                _ => new[] { "Validation.Request.FieldUnreadable" },
                StringComparer.Ordinal);
        }

        return modelState
            .Where(entry => entry.Value?.Errors.Count > 0 && entry.Key != JsonRoot)
            .ToDictionary(
                entry => entry.Key,
                entry => entry.Value!.Errors
                    .Select(error => error.ErrorMessage)
                    .Where(message => !string.IsNullOrWhiteSpace(message))
                    .ToArray(),
                StringComparer.Ordinal)
            .Where(entry => entry.Value.Length > 0)
            .ToDictionary(entry => entry.Key, entry => entry.Value, StringComparer.Ordinal);
    }

    private const string JsonPathPrefix = "$.";
}
