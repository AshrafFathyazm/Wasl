using System.Reflection;
using System.Text.RegularExpressions;
using FluentAssertions;
using FluentValidation;
using FluentValidation.Validators;
using Wasl.Application.Common.Messaging;

namespace Wasl.Application.Tests.Architecture;

/// <summary>
/// Every registered validator speaks in keys, never in sentences. `002c` AC-8 — `002`'s
/// `TEST-002-10`, unwritten since `002`.
/// </summary>
/// <remarks>
/// <para>
/// <b>The other end of `004b`'s guard.</b> <c>MessageKeyCoverageTests</c> scans the SOURCE for
/// string literals shaped like keys and requires each to be in the catalogue. This reads the
/// REGISTERED validators and requires each message to be a key at all — so a validator that ships
/// an English sentence is caught, which a source scan by construction cannot see.
/// </para>
/// <para>
/// `002` noted the gap honestly: *"AC-17 — no test proves every registered validator uses a
/// symbolic key. It guards nothing today: the only validators are the probes'."* There are
/// nine now.
/// </para>
/// <para>
/// <b>Why this matters more than it looks.</b> `004b` found seventeen unresolved keys under form
/// fields, and the reason none of them failed a test was that every assertion checked the field
/// was *present*. A validator with a hard-coded sentence has the opposite failure — it looks
/// perfect in English and cannot be translated at all — and no existing guard sees it.
/// </para>
/// </remarks>
public sealed class ValidatorMessageKeyTests
{
    private static readonly Assembly Application = typeof(ICommand).Assembly;

    /// <summary><c>Validation.Ticket.SubjectRequired</c>, not "Enter a subject."</summary>
    private static readonly Regex MessageKey =
        new(@"^(Validation|Error)\.[A-Za-z0-9]+(\.[A-Za-z0-9]+)+$", RegexOptions.Compiled);

    private static IEnumerable<IValidator> Validators() =>
        Application.GetTypes()
            .Where(type => type is { IsClass: true, IsAbstract: false, IsGenericTypeDefinition: false })
            .Where(typeof(IValidator).IsAssignableFrom)
            .Select(type => (IValidator)Activator.CreateInstance(type)!);

    /// <summary>AC-8.</summary>
    [Fact]
    public void Every_registered_validator_message_is_a_key_and_not_a_sentence()
    {
        var sentences = new SortedSet<string>(StringComparer.Ordinal);

        foreach (var validator in Validators())
        {
            foreach (var member in validator.CreateDescriptor().GetMembersWithValidators())
            {
                foreach (var rule in member)  // (IPropertyValidator Validator, IRuleComponent Options)
                {
                    var message = rule.Options.GetUnformattedErrorMessage();

                    // A rule with no explicit message falls back to FluentValidation's own English
                    // default — "'Subject' must not be empty." — which is exactly the failure this
                    // test exists for, so an absent message counts as a sentence rather than being
                    // skipped.
                    if (string.IsNullOrWhiteSpace(message) || !MessageKey.IsMatch(message))
                    {
                        sentences.Add(
                            $"{validator.GetType().Name}.{member.Key}: "
                            + $"\"{message ?? "(no explicit message)"}\"");
                    }
                }
            }
        }

        sentences.Should().BeEmpty(
            "a validator that ships an English sentence cannot be translated, and BR-8.6 says the "
            + "server localizes what it authors. `004b` found seventeen keys with no message; this "
            + "is the opposite failure — a message with no key — and nothing else looks for it");
    }

    /// <summary>The scanner finds validators and rules, so an empty sweep cannot pass.</summary>
    /// <remarks>
    /// `001` shipped an architecture test that was a false negative until somebody broke it on
    /// purpose. A reflection query matching zero validators would satisfy the test above.
    /// </remarks>
    [Fact]
    public void The_scanner_finds_validators_and_their_rules()
    {
        var validators = Validators().ToList();

        validators.Should().HaveCountGreaterThan(5,
            "the Application layer has a validator per write use case");

        validators
            .SelectMany(validator => validator.CreateDescriptor().GetMembersWithValidators())
            .SelectMany(member => member)
            .Should().NotBeEmpty("and those validators have rules");
    }

    /// <summary>The regex recognises a key and rejects a sentence.</summary>
    [Theory]
    [InlineData("Validation.Ticket.SubjectRequired", true)]
    [InlineData("Error.Auth.InvalidCredentials", true)]
    [InlineData("Enter a subject.", false)]
    [InlineData("'Subject' must not be empty.", false)]
    [InlineData("The Description field is required.", false)]
    public void The_shape_check_separates_a_key_from_a_sentence(string candidate, bool isKey)
    {
        MessageKey.IsMatch(candidate).Should().Be(isKey);
    }
}
