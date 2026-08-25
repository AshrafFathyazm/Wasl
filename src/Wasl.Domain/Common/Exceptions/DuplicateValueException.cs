namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// A uniqueness rule rejected the value. BR-4.4, BR-4.5.
/// </summary>
/// <remarks>
/// <para>
/// Carries the <b>field name</b> so the response can place the message on it, and
/// deliberately carries nothing about the record it collided with — no id, no name
/// (BR-4.7). Returning the id would leak a record the caller may not be entitled to look
/// up; the search in `008` is the intended way to find it.
/// </para>
/// <para>
/// The <c>errorCode</c> is a parameter rather than a constant, because
/// <c>duplicate-customer</c> is the only duplicate rule today and will not be the last —
/// and a future one gets its own registry row rather than reusing this one's `type`.
/// </para>
/// </remarks>
public sealed class DuplicateValueException(
    string errorCode,
    string fieldName,
    string messageKey)
    : DomainException(errorCode, messageKey)
{
    public string FieldName { get; } = fieldName;

    /// <summary>
    /// One field, one message key. The registry decides whether this <c>type</c> is
    /// permitted to emit `errors` at all.
    /// </summary>
    public override IReadOnlyDictionary<string, string[]> FieldErrors { get; }
        = new Dictionary<string, string[]> { [fieldName] = [messageKey] };
}
