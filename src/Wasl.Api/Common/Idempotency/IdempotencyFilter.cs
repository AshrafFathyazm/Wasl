using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Common.Exceptions;


namespace Wasl.Api.Common.Idempotency;

/// <summary>
/// Marks an action as safe to deliver twice under one <c>Idempotency-Key</c>. `036` §3.5.
/// </summary>
/// <remarks>
/// <para>
/// <b>Opt-in per action, never global.</b> The header changes what a request means, and an
/// endpoint that silently starts honouring it is an endpoint whose contract changed without its
/// contract file changing. Q-5 scoped this to <c>POST /api/tickets</c> and nothing else.
/// </para>
/// <para>
/// <b>And opt-in per REQUEST too — AC-19.</b> A request with no header behaves exactly as it did
/// before this feature existed. Requiring the header would have been the stronger guarantee and
/// is a breaking change to a frozen contract, which Gate 2 does not let this feature make on its
/// own.
/// </para>
/// </remarks>
[AttributeUsage(AttributeTargets.Method)]
internal sealed class IdempotentAttribute : Attribute, IFilterFactory
{
    public bool IsReusable => false;

    public IFilterMetadata CreateInstance(IServiceProvider serviceProvider) =>
        ActivatorUtilities.CreateInstance<IdempotencyFilter>(serviceProvider);
}

/// <summary>
/// Claims the key, runs the action once, and replays the recorded response afterwards.
/// `036` §3.5, AC-15 to AC-19.
/// </summary>
/// <remarks>
/// <para>
/// <b>An action filter, so it runs OUTSIDE the MediatR pipeline and therefore outside the
/// command's transaction.</b> That placement is the feature: a reservation enrolled in the
/// transaction it guards would vanish with it, and the retry would create the duplicate the key
/// exists to prevent. <c>IIdempotencyStore</c> writes on its own connection for the same reason.
/// </para>
/// <para>
/// <b>It never invents a status.</b> Every refusal is a domain exception thrown into `002`'s one
/// handler — <c>IdempotencyConflictException</c> for a reused key and
/// <c>TransientConflictException</c> for one still in flight — so the bodies come out of the same
/// producer as everything else and are localized by the same middleware. A hand-built
/// <c>StatusCodeResult</c> here would be the second producer `002` AC-2 forbids.
/// </para>
/// </remarks>
internal sealed class IdempotencyFilter(
    IIdempotencyStore store,
    ICurrentUser currentUser) : IAsyncActionFilter
{
    /// <summary>The header. Spelled as the industry spells it, because clients already send it.</summary>
    public const string HeaderName = "Idempotency-Key";

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var key = context.HttpContext.Request.Headers[HeaderName].ToString();

        // AC-19. No header, no change — this is the path every existing client takes.
        if (string.IsNullOrWhiteSpace(key))
        {
            await next();
            return;
        }

        // A `400` on the header, before the store is reached. The column is nvarchar(128), and a
        // longer value would otherwise fail at SaveChanges as a truncation — a `500` for what is
        // plainly a bad request. `004b` fixed the same shape for `expectedVersion`: length-checked
        // before any buffer is built.
        if (key.Length > IdempotencyLimits.KeyMaxLength)
        {
            throw new IdempotencyKeyInvalidException();
        }

        // Never null in practice — the action is behind [Authorize] and the fallback policy is
        // RequireAuthenticatedUser — but the key is SCOPED to the caller, and a null here would
        // scope it to Guid.Empty, which every unauthenticated caller would then share. That is
        // the one failure in this filter that would hand one client another's response.
        var userId = currentUser.UserId ?? throw new UnauthenticatedException();

        // The action, not the path: two routes reaching one action are one endpoint, and one
        // route reaching two actions is not. `context.ActionDescriptor.DisplayName` names the
        // method, which is what "the same request" means here.
        var endpoint = context.ActionDescriptor.DisplayName ?? context.ActionDescriptor.Id;

        var hash = HashOf(context.ActionArguments);

        var claim = await store.TryBeginAsync(
            key, userId, endpoint, hash, context.HttpContext.RequestAborted);

        switch (claim.Outcome)
        {
            case IdempotencyOutcome.Replay:
                // AC-15, AC-16. The FIRST response, byte for byte, including its Location — so a
                // replay names the ticket that exists rather than creating a second one. The
                // action never runs, which is what makes AC-16's "same ticketNumber" true: a
                // second run would draw a second sequence value.
                context.Result = Replay(context, claim);
                return;

            case IdempotencyOutcome.BodyMismatch:
                // AC-17. Refused, never replayed: handing back the first response would report
                // success for a request that was never executed.
                throw new IdempotencyConflictException();

            case IdempotencyOutcome.InFlight:
                // The first delivery still holds the key. Retryable and nothing was decided,
                // which is exactly what `503 transient-conflict` means — reusing that type rather
                // than minting a fourth `409` a client would have to learn not to retry.
                throw new TransientConflictException();
        }

        var executed = await next();

        // An exception on the way out means `002`'s handler is about to build the response. The
        // reservation is released so a corrected retry can reuse the key, and the exception is
        // left to propagate untouched.
        if (executed.Exception is not null)
        {
            await store.AbandonAsync(key, userId, endpoint, CancellationToken.None);
            return;
        }

        if (!TryCapture(context, executed.Result, out var status, out var body, out var location))
        {
            // Not a success, or a shape this filter cannot record faithfully. Releasing is the
            // safe half of the choice: the worst case is that a retry runs again, which is the
            // behaviour the endpoint had before this feature. Recording a response it could not
            // serialise correctly would replay a broken body forever.
            await store.AbandonAsync(key, userId, endpoint, CancellationToken.None);
            return;
        }

        // CancellationToken.None, deliberately: the request has already succeeded and the write
        // has already committed. Abandoning this because the client hung up would leave a
        // completed ticket behind an unfinished reservation, and the retry would make a second.
        await store.CompleteAsync(
            key, userId, endpoint, status, body, location, CancellationToken.None);
    }

    /// <summary>
    /// The recorded response, rebuilt.
    /// </summary>
    /// <remarks>
    /// <c>ContentResult</c> with the stored JSON rather than deserialising and re-serialising the
    /// object: re-serialisation would apply today's converters to yesterday's response, so a
    /// change to <c>JsonSerializerOptions</c> would silently make a replay differ from the
    /// original it is supposed to be identical to.
    /// </remarks>
    private static IActionResult Replay(ActionExecutingContext context, IdempotencyClaim claim)
    {
        if (!string.IsNullOrEmpty(claim.Location))
        {
            context.HttpContext.Response.Headers.Location = claim.Location;
        }

        return new ContentResult
        {
            Content = claim.ResponseBody ?? string.Empty,
            ContentType = "application/json",
            StatusCode = claim.StatusCode,
        };
    }

    /// <summary>
    /// Pulls status, body and <c>Location</c> out of a successful action result.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Only 2xx is recorded.</b> A `400` the client then corrects must not be the answer its
    /// retry receives — see <c>IIdempotencyStore.AbandonAsync</c>.
    /// </para>
    /// <para>
    /// <b><c>Location</c> is read from the result, not recomputed on replay.</b>
    /// <c>CreatedAtActionResult</c> carries the route values of the resource that was actually
    /// created; rebuilding the URL a day later would name whatever the route builds today. AC-16
    /// asserts the replayed header.
    /// </para>
    /// </remarks>
    private static bool TryCapture(
        ActionExecutingContext context,
        IActionResult? result,
        out int status,
        out string body,
        out string? location)
    {
        status = 0;
        body = string.Empty;
        location = null;

        if (result is not ObjectResult objectResult || objectResult.Value is null)
        {
            return false;
        }

        status = objectResult.StatusCode ?? StatusCodes.Status200OK;

        if (status is < 200 or > 299)
        {
            return false;
        }

        var options = context.HttpContext.RequestServices
            .GetRequiredService<Microsoft.Extensions.Options.IOptions<Microsoft.AspNetCore.Mvc.JsonOptions>>()
            .Value.JsonSerializerOptions;

        body = JsonSerializer.Serialize(objectResult.Value, objectResult.Value.GetType(), options);

        if (result is CreatedAtActionResult created && context.Controller is ControllerBase controller)
        {
            location = controller.Url.Action(
                created.ActionName, created.ControllerName, created.RouteValues);
        }

        // The stored Location is dropped rather than truncated if it will not fit. A truncated
        // URL is a link to the wrong place, which is worse than no link — the body still carries
        // the id.
        if (location is { Length: > IdempotencyLimits.LocationMaxLength })
        {
            location = null;
        }

        return true;
    }

    /// <summary>
    /// A digest of the bound arguments. AC-17's whole mechanism.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Over the BOUND arguments, not the raw body.</b> The raw stream has already been consumed
    /// by model binding, and re-reading it needs buffering the whole request. Bound arguments are
    /// also the more honest comparison: two bodies differing only in whitespace or key order are
    /// the same request, and hashing the raw bytes would call them different and refuse the
    /// second.
    /// </para>
    /// <para>
    /// The serializer is the framework's default rather than the API's configured options, so a
    /// change to how the API RENDERS enums cannot change what two requests hash to.
    /// </para>
    /// </remarks>
    private static string HashOf(IDictionary<string, object?> arguments)
    {
        // ── The CancellationToken is an ARGUMENT, and serializing it throws ─────────
        //
        // Measured, not anticipated: every action here takes a CancellationToken, MVC binds it
        // like any other parameter, and System.Text.Json walks it to `$.WaitHandle.Handle` — an
        // IntPtr — and raises NotSupportedException. That surfaced as a `500` on EVERY create
        // carrying a key, which is worse than the duplicate this filter exists to prevent.
        //
        // Excluded by TYPE rather than by parameter name: `cancellationToken` is a convention, and
        // a controller that names it `ct` would put the defect straight back.
        var canonical = new SortedDictionary<string, object?>(StringComparer.Ordinal);

        foreach (var argument in arguments)
        {
            if (argument.Value is CancellationToken)
            {
                continue;
            }

            canonical[argument.Key] = argument.Value;
        }

        var json = JsonSerializer.Serialize(canonical);

        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(json)));
    }
}

/// <summary>
/// The <c>Idempotency-Key</c> header is longer than the store accepts. `036` §3.5.
/// </summary>
/// <remarks>
/// A `400` naming the header, so the client can see which of its inputs was refused — the same
/// choice `011` made for <c>assigneeId</c> and `004b` for <c>expectedVersion</c>. The key of the
/// <c>errors</c> object is the header name rather than a field name because that is where the
/// value came from, and a client maps it back by exact name.
/// </remarks>
internal sealed class IdempotencyKeyInvalidException()
    : DomainException(DomainErrorCodes.Validation, "Validation.Idempotency.KeyTooLong")
{
    public override IReadOnlyDictionary<string, string[]> FieldErrors { get; } =
        new Dictionary<string, string[]>
        {
            [IdempotencyFilter.HeaderName] = ["Validation.Idempotency.KeyTooLong"],
        };
}
