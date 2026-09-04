namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// The <c>Idempotency-Key</c> has already been used for a different request body.
/// Mapped to <c>409 errors/idempotency-conflict</c>. `036` §3.5, AC-17.
/// </summary>
/// <remarks>
/// <para>
/// <b>The key is the client's promise that two deliveries are one intent.</b> Reusing it with a
/// different body breaks that promise, and there is no answer the server can give that is both
/// safe and useful: replaying the first response would report success for a request that was
/// never run, and executing the second would create the duplicate the key existed to prevent.
/// So it refuses, and names which of the two it is.
/// </para>
/// <para>
/// <b>A `409` and not a `400`.</b> The request is well-formed and every field is valid; what is
/// wrong is its relationship to a request that came before it. That is the same shape as
/// <c>duplicate-customer</c> and <c>concurrency-conflict</c>, and it is why no <c>errors</c>
/// dictionary is carried — no field is at fault.
/// </para>
/// <para>
/// <b>Distinct from <see cref="TransientConflictException"/>, which is what a key still in
/// flight produces.</b> The client's correct reaction differs completely: this one must never be
/// retried, and that one should be retried in a second. One code for both would force a client
/// to choose between hammering a conflict and abandoning a success.
/// </para>
/// </remarks>
public sealed class IdempotencyConflictException()
    : DomainException(DomainErrorCodes.IdempotencyConflict, "Error.Idempotency.KeyReused");
