namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// Base type for a violation of a rule the domain enforces.
/// </summary>
/// <remarks>
/// <para>
/// Carries two machine-readable values and <b>no human sentence</b>:
/// </para>
/// <list type="bullet">
///   <item><see cref="ErrorCode"/> — which rule broke. Mapped to a status and a
///   <c>type</c> URI by the registry in <c>Wasl.Api</c>.</item>
///   <item><see cref="MessageKey"/> — a symbolic key resolved to a sentence by exactly one
///   interface, so <c>005-localization-core</c> swaps a string source rather than visiting
///   eleven call sites.</item>
/// </list>
/// <para>
/// The inherited <see cref="Exception.Message"/> is the key, not a sentence. That is
/// deliberate: a sentence here would be an English string outside any catalogue, rendering
/// correctly in English so review passes and in English inside an Arabic interface so only
/// an Arabic reader finds it. ADR-007 §5 rejects English-text-as-key for exactly this, and
/// AC-17 is the test that closes it.
/// </para>
/// <para>
/// No HTTP type, no status code, no <c>type</c> URI — `Wasl.Domain` has zero package
/// references and this is the reason it can (ADR-002, Principle III).
/// </para>
/// </remarks>
public abstract class DomainException : Exception
{
    protected DomainException(string errorCode, string messageKey, params object[] messageArguments)
        : base(messageKey)
    {
        ErrorCode = errorCode;
        MessageKey = messageKey;
        MessageArguments = messageArguments;
    }

    /// <summary>
    /// The same, carrying the exception this one was translated from. `036`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>For the translations only</b> — a rule that refuses a request has no cause to carry,
    /// and a domain rule that wraps an infrastructure exception is a layering mistake, not a
    /// use of this constructor. It exists because `036` turns two <i>engine</i> conditions into
    /// domain exceptions: a rowversion mismatch EF detected, and a deadlock SQL Server resolved.
    /// </para>
    /// <para>
    /// <b>Without it those two are undiagnosable.</b> <c>GlobalExceptionHandler</c> logs a
    /// <see cref="DomainException"/> at <c>Warning</c> with no exception object, because a
    /// business rule refusing a request is the system working. That is right for a duplicate
    /// email and wrong for a deadlock: the log would say <c>transient-conflict</c> and record
    /// neither the statement nor the victim. The cause is carried so the handler can log it.
    /// </para>
    /// <para>
    /// It never reaches the wire. <c>ProblemDetails</c> is built from
    /// <see cref="ErrorCode"/> and <see cref="MessageKey"/> only — NFR-4, and `002` already
    /// forbids a stack trace, SQL, or an exception type name in <c>detail</c>.
    /// </para>
    /// </remarks>
    protected DomainException(string errorCode, string messageKey, Exception? cause)
        : base(messageKey, cause)
    {
        ErrorCode = errorCode;
        MessageKey = messageKey;
        MessageArguments = [];
    }

    /// <summary>Which rule broke. A value from <see cref="DomainErrorCodes"/>.</summary>
    public string ErrorCode { get; }

    /// <summary>Symbolic key for the human sentence. Never the sentence itself.</summary>
    public string MessageKey { get; }

    /// <summary>Values the message key interpolates. Never pre-formatted into a string.</summary>
    public IReadOnlyList<object> MessageArguments { get; }

    /// <summary>
    /// Field-level detail, where the failure is attributable to named request fields.
    /// </summary>
    /// <remarks>
    /// Empty for most exceptions. The registry decides whether a given <c>type</c> is
    /// <i>permitted</i> to carry <c>errors</c> at all — `errors` is a property of the type,
    /// not of the status (contract, and spec Q-A). So
    /// <c>errors/concurrency-conflict</c> carries none even though it is a `409`, and
    /// <c>errors/duplicate-customer</c> does.
    /// <para>
    /// The values are message <b>keys</b>, on the same rule as <see cref="MessageKey"/>.
    /// </para>
    /// </remarks>
    public virtual IReadOnlyDictionary<string, string[]> FieldErrors { get; }
        = new Dictionary<string, string[]>();

    /// <summary>
    /// A message key overriding the registry's title for this <b>specific</b> failure, or
    /// <c>null</c> to use the title the <c>type</c> is registered with. Added by `004b`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Because one <c>type</c> can legitimately describe two situations with different correct
    /// titles, and `004` shipped exactly that.</b> `errors/unauthenticated` covers both "no
    /// credentials were supplied" — produced by the authentication middleware — and "the
    /// credentials you supplied were rejected", produced by the sign-in handler. The frozen
    /// contract gives them different titles on purpose: *Authentication is required.* against
    /// *Email or password is incorrect.* A single registry row cannot say both, so `004` shipped
    /// the first title on the second response and the login screen displayed it.
    /// </para>
    /// <para>
    /// <b>The <c>type</c> deliberately does not change.</b> Splitting it would have been the other
    /// fix and it is worse: <c>type</c> is the identifier a client branches on and it is frozen in
    /// the contract, so a new one breaks every consumer to solve a wording problem. The title is
    /// the human-readable half — the half that is translated (BR-8.6) and that no client should
    /// branch on — so the title is what varies.
    /// </para>
    /// <para>
    /// Null by default, so every existing exception keeps the registry's title and nothing that
    /// worked before had to change.
    /// </para>
    /// </remarks>
    public virtual string? TitleKey => null;
}
