using Wasl.Domain.Common.Exceptions;

namespace Wasl.Api.Common.Errors;

/// <summary>
/// One row per failure mode: code, status, whether <c>errors</c> is permitted, and the
/// title key. This file is the shared vocabulary.
/// </summary>
/// <remarks>
/// <para>
/// <b>A feature that adds a new failure mode adds a row here.</b> It does not invent a
/// <c>type</c> locally. `docs/sdd/05-api-conventions.md` names four distinct `409` causes
/// precisely so a client can tell a duplicate from a stale version, and that distinction
/// is worth nothing if `012` invents <c>errors/status-conflict</c> while `016` invents
/// <c>errors/escalation-conflict</c>.
/// </para>
/// <para>
/// Rows exist here for codes nothing raises yet — `002b` adds the malformed-request and
/// routing paths, `004` the auth ones, `012` and `016` their conflicts. That is deliberate:
/// a registered type nothing raises is a promise; an unregistered one that something raises
/// is a `500` indistinguishable from a bug.
/// </para>
/// <para>
/// <b>`errors` is a property of the type, not of the status.</b> `duplicate-customer`
/// carries it; `concurrency-conflict` does not, even though both are `409` — because no
/// field is at fault in a stale version and the answer is refetch, not a form message.
/// This settles the contradiction recorded as spec Q-A.
/// </para>
/// </remarks>
internal static class ProblemTypes
{
    /// <summary>
    /// A compile-time constant, appearing exactly once in <c>src/</c> (AC-16).
    /// </summary>
    /// <remarks>
    /// Not configuration. A base that varies by environment breaks every client comparing
    /// the full URI — and clients do compare it. Clients are told to branch on the last
    /// path segment instead (AC-25), which is what makes this constant safe to change.
    /// </remarks>
    public const string TypeBase = "https://wasl.local/errors/";

    /// <summary>Codes this feature's own machinery raises, which the domain does not own.</summary>
    public const string Internal = "internal";
    public const string MalformedRequest = "malformed-request";
    public const string MethodNotAllowed = "method-not-allowed";
    public const string UnsupportedMediaType = "unsupported-media-type";
    public const string Unauthenticated = "unauthenticated";
    public const string Forbidden = "forbidden";

    private static readonly Dictionary<string, ProblemTypeDefinition> Registry = new(StringComparer.Ordinal)
    {
        // ── Raised by 002 core ──────────────────────────────────────────────────────
        [DomainErrorCodes.Validation] = new(
            StatusCodes.Status400BadRequest, CarriesErrors: true, TitleKey: "Error.Validation.Title"),

        [Internal] = new(
            StatusCodes.Status500InternalServerError, CarriesErrors: false,
            TitleKey: "Error.Internal.Title", CarriesDetail: false),

        // ── Registered here, raised by 002b ─────────────────────────────────────────
        [MalformedRequest] = new(
            StatusCodes.Status400BadRequest, CarriesErrors: false, TitleKey: "Error.MalformedRequest.Title"),

        [DomainErrorCodes.NotFound] = new(
            StatusCodes.Status404NotFound, CarriesErrors: false, TitleKey: "Error.NotFound.Title"),

        [MethodNotAllowed] = new(
            StatusCodes.Status405MethodNotAllowed, CarriesErrors: false, TitleKey: "Error.MethodNotAllowed.Title"),

        [UnsupportedMediaType] = new(
            StatusCodes.Status415UnsupportedMediaType, CarriesErrors: false, TitleKey: "Error.UnsupportedMediaType.Title"),

        // ── Registered here, raised by 004 ──────────────────────────────────────────
        // CarriesDetail: false — `004b`. The frozen contract shows NO detail on either 401, and
        // the omission is the point: a rejected sign-in must say the same thing whichever of the
        // three causes it was, and every sentence added to that response is a sentence that can
        // accidentally distinguish them. The title carries the whole message, and
        // UnauthenticatedException overrides it so "credentials rejected" and "no credentials"
        // read differently while sharing one `type`.
        //
        // It also closes a leak: `004` shipped detail = "Error.Auth.InvalidCredentials", a raw
        // resource key rendered verbatim on the login screen (BR-8.6).
        [Unauthenticated] = new(
            StatusCodes.Status401Unauthorized, CarriesErrors: false,
            TitleKey: "Error.Unauthenticated.Title", CarriesDetail: false),

        [Forbidden] = new(
            StatusCodes.Status403Forbidden, CarriesErrors: false, TitleKey: "Error.Forbidden.Title"),

        // ── Registered here, raised by 007 / 012 / 016 / 017 ────────────────────────
        [DomainErrorCodes.DuplicateCustomer] = new(
            StatusCodes.Status409Conflict, CarriesErrors: true, TitleKey: "Error.DuplicateCustomer.Title"),

        [DomainErrorCodes.InvalidStatusTransition] = new(
            StatusCodes.Status409Conflict, CarriesErrors: false, TitleKey: "Error.InvalidStatusTransition.Title"),

        [DomainErrorCodes.TicketClosed] = new(
            StatusCodes.Status409Conflict, CarriesErrors: false, TitleKey: "Error.TicketClosed.Title"),

        // Added by `012`. Three 409s that a client must be able to tell apart without reading
        // English: refetch quietly, offer Assign, or offer a different transition.
        [DomainErrorCodes.SameStatusTransition] = new(
            StatusCodes.Status409Conflict, CarriesErrors: false, TitleKey: "Error.SameStatusTransition.Title"),

        [DomainErrorCodes.AssigneeRequired] = new(
            StatusCodes.Status409Conflict, CarriesErrors: false, TitleKey: "Error.AssigneeRequired.Title"),

        [DomainErrorCodes.AlreadyEscalated] = new(
            StatusCodes.Status409Conflict, CarriesErrors: false, TitleKey: "Error.AlreadyEscalated.Title"),

        [DomainErrorCodes.ConcurrencyConflict] = new(
            StatusCodes.Status409Conflict, CarriesErrors: false, TitleKey: "Error.ConcurrencyConflict.Title"),

        // Added by `011`. Two more that a client must tell apart without reading English:
        // assignee-unchanged means refetch quietly (a double-click on the picker), and
        // assignee-not-found means the PICKER is stale — distinct from errors/not-found, which
        // means the TICKET is stale and the page should be reloaded. One 404 for both would force
        // the client to guess which of the two it is holding out of date.
        [DomainErrorCodes.AssigneeUnchanged] = new(
            StatusCodes.Status409Conflict, CarriesErrors: false, TitleKey: "Error.AssigneeUnchanged.Title"),

        [DomainErrorCodes.AssigneeNotFound] = new(
            StatusCodes.Status404NotFound, CarriesErrors: false, TitleKey: "Error.AssigneeNotFound.Title"),
    };

    /// <summary>Every registered code. Used by the completeness test (AC-14, AC-15).</summary>
    public static IReadOnlyDictionary<string, ProblemTypeDefinition> All => Registry;

    /// <summary>The full <c>type</c> URI for a code.</summary>
    public static string UriFor(string code) => TypeBase + code;

    /// <summary>
    /// The definition for a code, or <c>null</c> when it is unregistered.
    /// </summary>
    /// <remarks>
    /// Returns null rather than throwing, and rather than guessing a status. The caller
    /// logs at <c>Critical</c> naming the code and degrades to <c>500 errors/internal</c>
    /// — a real failure rendered as a generic one, which is bad, and better than a `409`
    /// invented at runtime. AC-14 makes the omission a red build instead.
    /// </remarks>
    public static ProblemTypeDefinition? Find(string code) =>
        Registry.TryGetValue(code, out var definition) ? definition : null;
}

/// <summary>One registry row.</summary>
/// <param name="Status">The HTTP status this code maps to.</param>
/// <param name="CarriesErrors">
/// Whether this <c>type</c> may emit an <c>errors</c> object. A property of the type, not
/// of the status.
/// </param>
/// <param name="TitleKey">Symbolic key for the title. Never a sentence.</param>
/// <param name="CarriesDetail">
/// Whether this <c>type</c> may emit <c>detail</c>. False only for <c>internal</c>, whose
/// body is <c>type</c>, <c>title</c>, <c>status</c>, <c>instance</c>, <c>traceId</c> and
/// nothing else.
/// </param>
internal sealed record ProblemTypeDefinition(
    int Status,
    bool CarriesErrors,
    string TitleKey,
    bool CarriesDetail = true);
