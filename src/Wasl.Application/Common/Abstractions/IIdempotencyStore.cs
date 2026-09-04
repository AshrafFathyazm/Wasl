namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// The sizes the key store enforces. `036` §3.5.
/// </summary>
/// <remarks>
/// <b>Here rather than on the EF configuration, because three layers need them and one of them
/// cannot see the others.</b> The column widths are declared in <c>Wasl.Infrastructure</c>, the
/// header is length-checked in <c>Wasl.Api</c> before the store is reached, and neither project
/// can name an <c>internal</c> type in the other. Two copies of the number is how a `400` and a
/// truncation silently disagree about what is too long.
/// </remarks>
public static class IdempotencyLimits
{
    /// <summary>Longest <c>Idempotency-Key</c> accepted. Anything longer is a `400`, never a truncation.</summary>
    public const int KeyMaxLength = 128;

    /// <summary>Longest recorded <c>Location</c>. A URL that will not fit is dropped, not cut.</summary>
    public const int LocationMaxLength = 400;

    public const int EndpointMaxLength = 200;

    /// <summary>SHA-256, hex — fixed width, so the column is not guessing.</summary>
    public const int HashLength = 64;
}

/// <summary>
/// Remembers what a client's <c>Idempotency-Key</c> already produced. `036` §3.5.
/// </summary>
/// <remarks>
/// <para>
/// <b>Reserve, then complete — and the reservation is what makes it safe.</b> The store inserts
/// a row before the request runs and fills in the response after it succeeds. The insert is
/// guarded by a unique index, so two simultaneous deliveries of one key cannot both reserve;
/// exactly one proceeds and the other is told what became of it. <c>CLAUDE.md</c>'s first
/// concurrency row states the rule this implements: *the client guard is not the guarantee — the
/// guarantee is a unique index or a rule.*
/// </para>
/// <para>
/// <b>Declared here, implemented in <c>Wasl.Infrastructure</c>, for the reason every abstraction
/// in this folder exists:</b> the implementation needs EF Core and a unique-index violation, and
/// <c>Wasl.Application</c> can see neither.
/// </para>
/// <para>
/// <b>It deliberately does NOT run inside the command's transaction.</b> The reservation must
/// survive a rollback — a request that fails and is corrected must be able to reuse its key, and
/// a request that succeeds must never be repeatable — so the store writes on its own connection,
/// the same way `003`'s failure-path audit writer does and for the same reason. That also means
/// a process killed between the write and <see cref="CompleteAsync"/> leaves a reservation with
/// no response: the next delivery of that key is answered as still in flight, and the row expires.
/// A stated limit, not a hidden one.
/// </para>
/// </remarks>
public interface IIdempotencyStore
{
    /// <summary>
    /// Claims the key, or reports what it already produced.
    /// </summary>
    /// <param name="key">The client's <c>Idempotency-Key</c> header, verbatim.</param>
    /// <param name="userId">
    /// The caller. **Part of the identity of the key**, never a column merely recorded beside it —
    /// two users must be able to mint the same key without one replaying the other's response.
    /// </param>
    /// <param name="endpoint">Which action the key was used against.</param>
    /// <param name="requestHash">
    /// A digest of the request body. What makes AC-17 possible: the same key with a different
    /// body is a broken promise and is refused, rather than silently replaying a response for a
    /// request that was never run.
    /// </param>
    Task<IdempotencyClaim> TryBeginAsync(
        string key, Guid userId, string endpoint, string requestHash, CancellationToken cancellationToken);

    /// <summary>
    /// Records the response so a later delivery of the same key replays it.
    /// </summary>
    /// <remarks>
    /// Called only for a successful response. A failure calls <see cref="AbandonAsync"/> instead,
    /// because a `400` that the client then corrects must not be the answer its retry receives.
    /// </remarks>
    Task CompleteAsync(
        string key, Guid userId, string endpoint,
        int statusCode, string responseBody, string? location, CancellationToken cancellationToken);

    /// <summary>
    /// Releases the reservation, leaving the key usable again.
    /// </summary>
    Task AbandonAsync(string key, Guid userId, string endpoint, CancellationToken cancellationToken);
}

/// <summary>What <see cref="IIdempotencyStore.TryBeginAsync"/> found.</summary>
public enum IdempotencyOutcome
{
    /// <summary>The key is new. The caller owns it and must run the request.</summary>
    Started,

    /// <summary>The key completed already. Replay the stored response — do not run anything.</summary>
    Replay,

    /// <summary>The key is held by a request still running. Retryable; nothing was decided.</summary>
    InFlight,

    /// <summary>The key was used for a DIFFERENT body. Refuse — AC-17.</summary>
    BodyMismatch,
}

/// <summary>The claim, and the stored response when there is one.</summary>
/// <param name="Outcome">Which of the four situations this is.</param>
/// <param name="StatusCode">The recorded status, on <see cref="IdempotencyOutcome.Replay"/> only.</param>
/// <param name="ResponseBody">The recorded body, on <see cref="IdempotencyOutcome.Replay"/> only.</param>
/// <param name="Location">
/// The recorded <c>Location</c> header, on a replay of a `201`. Stored rather than recomputed:
/// AC-16 requires the replay to name the FIRST ticket, and recomputing would name whatever the
/// route builds today.
/// </param>
public sealed record IdempotencyClaim(
    IdempotencyOutcome Outcome,
    int StatusCode = 0,
    string? ResponseBody = null,
    string? Location = null);
