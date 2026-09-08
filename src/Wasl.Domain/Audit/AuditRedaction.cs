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
    /// <para>
    /// <c>TicketComments.Body</c> is BR-9.7 together with BR-5.5: the audit trail records
    /// <b>that</b> a comment was added, never its text. Entity-qualified rather than global,
    /// because a field called <c>Body</c> on something else is not automatically sensitive —
    /// and the whole argument against substring matching applies to over-broad names too.
    /// </para>
    /// <para>
    /// <b>The last three rows are `016`, and they were added because a test measured the diff
    /// rather than reasoning about it.</b> BR-9.7's list names a password, a hash, a token, a
    /// signing key and "a full comment body" — and an escalation reason is none of those
    /// literally, so it went out in <c>Changes</c> in full. `016`'s own <c>tasks.md</c> (BE-016-06,
    /// TEST-016-14) says the reason must not be there, and the reason it gives is BR-9.7's own
    /// principle: a manager's free text about a customer is recorded on the timeline, and the
    /// audit row records that an escalation happened.
    /// </para>
    /// <para>
    /// <b>Redacting only <c>Ticket.EscalationReason</c> would have been worse than redacting
    /// nothing.</b> The escalation writes the same text into <c>TicketHistoryEntry.Note</c> in the
    /// same transaction, so it appears TWICE in one diff — the first attempt redacted the column,
    /// the run still found the text, and the row would have carried a <c>[redacted]</c> placeholder
    /// beside the value it was hiding. That is precisely the "hole that looks like a feature" this
    /// file warns about one paragraph up.
    /// </para>
    /// <para>
    /// <b>Both spellings of the history entity are listed</b>, as they are for comments: the CLR
    /// type is <c>TicketHistoryEntry</c> and the table is <c>TicketHistory</c>, and a rule that
    /// depends on which name the caller happened to hold is not a rule.
    /// </para>
    /// <para>
    /// <b>This also redacts `012`'s status-change note, and that is intended rather than
    /// collateral.</b> BR-1.2's note is the same category of data reaching the same column through
    /// a different endpoint — an agent's free text about a customer's ticket — so exempting it
    /// would mean the audit trail protects the sentence a Manager typed and publishes the sentence
    /// an Agent typed. No test asserted that note was in the diff (the one that looks like it does,
    /// <c>AuditPipelineTests</c>, asserts <c>Customer.Notes</c>, a different column on a different
    /// entity), so nothing had to be loosened for this.
    /// </para>
    /// </remarks>
    private static readonly HashSet<string> SecretEntityFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "TicketComments.Body",
        "TicketComment.Body",
        "Ticket.EscalationReason",
        "TicketHistory.Note",
        "TicketHistoryEntry.Note",

        /* `021`, AND THIS IS THE THIRD TIME BR-9.7's LIST HAS BEEN SHORT.
         *
         * An outbound message's text is the most obviously sensitive free text in the product —
         * it is the only text in this system a CUSTOMER receives — and BR-9.7's five literal
         * things do not include it either. `021`'s AC-16 says the audit row carries the channel,
         * the recipient, the delivery status and the interaction id "and NOT the message body",
         * and a test measured it going out in full before this entry existed.
         *
         * Three features have now discovered the same gap from three directions (`013`'s comment
         * was in the original list, `016`'s escalation reason was not, this was not), which is
         * itself the finding: BR-9.7 enumerates instead of describing a category, so every new
         * kind of human text is absent until somebody writes a test that looks.
         *
         * `RecipientAddress` is deliberately NOT here. AC-16 wants it: an auditor asking "where
         * did this message go" must be able to answer from the trail, and the address is the
         * whole answer. It is customer data, and that is the trade this rule accepts — the same
         * one BR-9.6 accepts for the actor's email. */
        "Interactions.Body",
        "Interaction.Body",
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
