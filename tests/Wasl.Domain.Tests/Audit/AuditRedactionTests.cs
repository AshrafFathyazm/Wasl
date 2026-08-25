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
