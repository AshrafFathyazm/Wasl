using FluentAssertions;
using Wasl.Domain.Audit;

namespace Wasl.Domain.Tests.Audit;

/// <summary>
/// BR-9.7 / AC-17. A pure function with many inputs, so it is a table — no database, no host.
/// </summary>
/// <remarks>
/// The near-miss cases carry as much weight as the positive ones. A "contains" rule would
/// pass every test below except those, and a field redacted by accident is worse than one
/// redacted late: nobody investigates a value that looks deliberately protected.
/// </remarks>
public sealed class AuditRedactionTests
{
    [Theory]
    [InlineData("SupportUser", "Password")]
    [InlineData("SupportUser", "PasswordHash")]
    [InlineData("SupportUser", "Token")]
    [InlineData("SupportUser", "RefreshToken")]
    [InlineData("SupportUser", "SigningKey")]
    [InlineData("SupportUser", "Secret")]
    [InlineData("SupportUser", "ApiKey")]
    public void Every_deny_list_name_is_redacted_on_any_entity(string entity, string field)
    {
        AuditRedaction.IsRedacted(entity, field).Should().BeTrue(
            "every name on the BR-9.7 list is redacted wherever it appears — the list is the rule");
    }

    [Theory]
    [InlineData("password")]
    [InlineData("PASSWORD")]
    [InlineData("PaSsWoRdHaSh")]
    public void Matching_is_case_insensitive(string field)
    {
        AuditRedaction.IsRedacted("SupportUser", field).Should().BeTrue(
            "EF reports the CLR property name, but a rule that depends on casing is a rule "
            + "that breaks when someone renames a property to match a convention");
    }

    /// <summary>
    /// The whole argument for exact matching, as tests.
    /// </summary>
    [Theory]
    [InlineData("Ticket", "TokenCount")]
    [InlineData("SupportUser", "SecretaryName")]
    [InlineData("Customer", "PasswordResetRequestedAtUtc")]
    [InlineData("Customer", "FullName")]
    [InlineData("Ticket", "Subject")]
    public void A_name_that_merely_contains_a_secret_word_is_not_redacted(string entity, string field)
    {
        AuditRedaction.IsRedacted(entity, field).Should().BeFalse(
            "exact matching, never 'contains'. A substring rule redacts columns nobody "
            + "intended to protect, and the hole then looks like a feature");
    }

    [Theory]
    [InlineData("TicketComments")]
    [InlineData("TicketComment")]
    public void The_comment_body_is_redacted_and_both_spellings_agree(string entity)
    {
        AuditRedaction.IsRedacted(entity, "Body").Should().BeTrue(
            "BR-9.7 with BR-5.5: the trail records THAT a comment was added, never its text");
    }

    /// <summary>
    /// `016`. The escalation reason, and both places one request writes it.
    /// </summary>
    /// <remarks>
    /// <b>The second and third rows are the load-bearing ones.</b> An escalation writes the
    /// manager's text into <c>Ticket.EscalationReason</c> AND into
    /// <c>TicketHistoryEntry.Note</c>, both in one transaction, so one audit diff carries it
    /// twice. Redacting only the ticket column produced a row with a <c>[redacted]</c> placeholder
    /// sitting beside the value it was hiding — measured, not predicted, by
    /// <c>EscalateTicketTests.A_successful_escalation_writes_one_audit_row</c>.
    /// </remarks>
    [Theory]
    [InlineData("Ticket", "EscalationReason")]
    [InlineData("TicketHistoryEntry", "Note")]
    [InlineData("TicketHistory", "Note")]
    public void The_escalation_reason_is_redacted_wherever_one_request_writes_it(
        string entity, string field)
    {
        AuditRedaction.IsRedacted(entity, field).Should().BeTrue(
            "BR-9.7's principle rather than its literal list: a manager's free text about a "
            + "customer belongs on the timeline, and the audit row records that the escalation "
            + "happened. `016` tasks.md BE-016-06 and TEST-016-14 say so explicitly");
    }

    /// <summary>
    /// `021`. An outbound message's text, under both spellings.
    /// </summary>
    /// <remarks>
    /// <b>The third time BR-9.7's literal list has been found short, and from a third
    /// direction.</b> `013`'s comment body was in the original five; `016`'s escalation reason was
    /// not; this was not either — and it is the most obviously sensitive of the three, because an
    /// outbound message is the only text in this product a CUSTOMER receives. `021` AC-16 requires
    /// the audit row to carry the channel, the recipient, the delivery status and the interaction
    /// id and <i>not</i> the body, and a test measured it going out in full before this entry
    /// existed.
    /// </remarks>
    [Theory]
    [InlineData("Interaction")]
    [InlineData("Interactions")]
    public void An_outbound_message_body_is_redacted_under_both_spellings(string entity)
    {
        AuditRedaction.IsRedacted(entity, "Body").Should().BeTrue(
            "BR-9.7 with the same reasoning that covers a comment body: the trail records that a "
            + "message was sent, never its text");
    }

    /// <summary>
    /// The recipient address is deliberately NOT redacted.
    /// </summary>
    /// <remarks>
    /// <b>Asserted so the absence is a decision rather than an oversight.</b> `021` AC-16 wants
    /// it: an auditor asking "where did this message go" must be answerable from the trail, and
    /// the address is the whole answer. It is customer data, and that is the trade the rule
    /// accepts — the same one BR-9.6 accepts for snapshotting the actor's email.
    /// </remarks>
    [Fact]
    public void An_interactions_recipient_address_is_not_redacted()
    {
        AuditRedaction.IsRedacted("Interaction", "RecipientAddress").Should().BeFalse(
            "AC-16 requires the recipient in the diff — redacting it would make the audit row "
            + "unable to answer the one question it exists for");
    }

    /// <summary>
    /// A field called <c>Note</c> elsewhere is not automatically sensitive.
    /// </summary>
    /// <remarks>
    /// The same argument as <c>EmailTemplate.Body</c> below, and it matters more here because
    /// <c>Note</c> is a much more ordinary column name than <c>Body</c> — a future
    /// <c>Customer.Note</c> or <c>Tag.Note</c> holding an internal label is not customer free text
    /// and redacting it would hide a change nobody meant to hide.
    /// </remarks>
    [Theory]
    [InlineData("Customer", "Note")]
    [InlineData("Customer", "Notes")]
    public void A_note_field_on_another_entity_is_not_redacted(string entity, string field)
    {
        AuditRedaction.IsRedacted(entity, field).Should().BeFalse(
            "the rule is TicketHistory.Note, not Note. `Customer.Notes` in particular is asserted "
            + "PRESENT in the diff by AuditPipelineTests, so an over-broad rule here would turn "
            + "that test red — which is the shape of the defect, arriving as a warning");
    }

    /// <summary>
    /// The other half of entity-qualified matching: `Body` on something else is not
    /// automatically sensitive.
    /// </summary>
    [Fact]
    public void A_body_field_on_another_entity_is_not_redacted()
    {
        AuditRedaction.IsRedacted("EmailTemplate", "Body").Should().BeFalse(
            "the rule is TicketComments.Body, not Body. An over-broad name is the same "
            + "mistake as a substring match, arriving from the other direction");
    }

    [Fact]
    public void A_redacted_value_keeps_its_field_name_and_loses_both_halves()
    {
        var change = new AuditFieldChange("SupportUser", Guid.NewGuid(), "PasswordHash", "old-hash", "new-hash");

        var redacted = AuditRedaction.Apply(change);

        redacted.Field.Should().Be("PasswordHash", "that a password changed is auditable");
        redacted.Before.Should().Be(AuditRedaction.Placeholder);
        redacted.After.Should().Be(AuditRedaction.Placeholder, "the value is not");
        redacted.Entity.Should().Be(change.Entity);
        redacted.Id.Should().Be(change.Id);
    }

    [Fact]
    public void An_unredacted_change_passes_through_untouched()
    {
        var change = new AuditFieldChange("Customer", Guid.NewGuid(), "Email", null, "ali@example.com");

        AuditRedaction.Apply(change).Should().Be(change,
            "redaction is the exception. Everything else is stored as it was observed");
    }

    /// <summary>
    /// A redacted null still becomes the placeholder.
    /// </summary>
    /// <remarks>
    /// Returning null would leak the difference between "this secret was absent" and "this
    /// secret was set" — an inference an audit trail should not hand out for free.
    /// </remarks>
    [Fact]
    public void A_redacted_null_is_still_replaced()
    {
        AuditRedaction.Redact("SupportUser", "PasswordHash", null)
            .Should().Be(AuditRedaction.Placeholder,
                "null-versus-placeholder would tell a reader whether the secret had been set");
    }

    [Fact]
    public void An_absent_field_name_is_rejected_rather_than_silently_allowed()
    {
        var act = () => AuditRedaction.IsRedacted("Customer", "  ");

        act.Should().Throw<ArgumentException>(
            "an empty field name means the caller lost the property name, and defaulting to "
            + "'not redacted' would store a value the deny-list was meant to catch");
    }
}
