namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// A domain invariant was violated — a rule that must hold regardless of who called.
/// </summary>
/// <remarks>
/// Distinct from a validation failure at the boundary. Request validation says "this input
/// is malformed"; this says "the input was well formed and the domain still refuses it".
/// Both map to <c>400 errors/validation</c> on the wire, and the difference matters
/// anyway: a validator can be bypassed by a background job or a future integration, and
/// this cannot (see `docs/sdd/02-architecture.md`, Validation).
/// </remarks>
public class InvariantViolationException(
    string messageKey,
    params object[] messageArguments)
    : DomainException(DomainErrorCodes.Validation, messageKey, messageArguments);
