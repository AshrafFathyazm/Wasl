namespace Wasl.Domain.Audit;

/// <summary>
/// BR-9.7. Decides whether a changed field's values may be stored, and replaces them when
/// they may not.
/// </summary>
/// <remarks>
/// <para>
/// A pure function in the domain, per constitution III: the rule lives in one place and is
/// unit-tested with no database. Nothing here reaches out, so the test is a table of inputs.
/// </para>
/// <para>
/// <b>Exact, case-insensitive name matching — never "contains".</b> A substring rule would
/// redact a future column called <c>TokenCount</c> or <c>SecretaryName</c>, and a field
/// redacted by accident is a hole that looks like a feature: nobody investigates a value that
/// appears to have been protected on purpose. The cost is that a new sensitive column has to
/// be added to the list below, which is why the list is one file with its own test.
/// </para>
/// <para>
/// The redacted entry <b>keeps its field name</b> and loses both values. That a password
/// changed is auditable; the value is not.
/// </para>
/// </remarks>
public static class AuditRedaction
{
    /// <summary>
    /// What a redacted value is stored as. A constant rather than a literal at each call
    /// site, because a test asserts on it and `019` will display it.
    /// </summary>
    public const string Placeholder = "[redacted]";

    /// <summary>
    /// Property names redacted wherever they appear, on any entity.
    /// </summary>
    private static readonly HashSet<string> SecretFieldNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "Password",
        "PasswordHash",
        "Token",
        "RefreshToken",
        "SigningKey",
        "Secret",
        "ApiKey",
    };

    /// <summary>
    /// Fields redacted only on a specific entity, as <c>Entity.Field</c>.
    /// </summary>
    /// <remarks>
    /// <c>TicketComments.Body</c> is BR-9.7 together with BR-5.5: the audit trail records
    /// <b>that</b> a comment was added, never its text. Entity-qualified rather than global,
    /// because a field called <c>Body</c> on something else is not automatically sensitive —
    /// and the whole argument against substring matching applies to over-broad names too.
    /// </remarks>
    private static readonly HashSet<string> SecretEntityFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "TicketComments.Body",
        "TicketComment.Body",
    };

    /// <summary>
    /// True when this field's values must not be stored.
    /// </summary>
    /// <param name="entity">The CLR entity name, or the table name. Both spellings of the
    /// comment entity are listed, because the entity is <c>TicketComment</c> and the table is
    /// <c>TicketComments</c>, and a caller passing either must get the same answer — a
    /// redaction rule that depends on which name the caller happened to have is not a rule.</param>
    /// <param name="field">The CLR property name.</param>
    public static bool IsRedacted(string entity, string field)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(field);

        return SecretFieldNames.Contains(field)
            || SecretEntityFields.Contains($"{entity}.{field}");
    }

    /// <summary>
    /// Returns the value to store: the original, or <see cref="Placeholder"/> when the field
    /// is on the deny-list.
    /// </summary>
    /// <remarks>
    /// A redacted <c>null</c> still becomes <see cref="Placeholder"/>. Returning <c>null</c>
    /// would leak the difference between "this secret was absent" and "this secret was set",
    /// which is exactly the kind of inference an audit trail should not hand out for free.
    /// </remarks>
    public static string? Redact(string entity, string field, string? value) =>
        IsRedacted(entity, field) ? Placeholder : value;

    /// <summary>
    /// Applies <see cref="Redact"/> to both halves of a change, leaving the name intact.
    /// </summary>
    public static AuditFieldChange Apply(AuditFieldChange change) =>
        IsRedacted(change.Entity, change.Field)
            ? change with { Before = Placeholder, After = Placeholder }
            : change;
}
