using System.Reflection;
using FluentAssertions;
using FluentValidation;
using FluentValidation.Internal;
using Wasl.Application.Common.Messaging;

namespace Wasl.Application.Tests.Architecture;

/// <summary>
/// Every non-nullable member of every command has a validator rule. `002c` AC-4.
/// </summary>
/// <remarks>
/// <para>
/// <b>This is a gate, not a report.</b> `002c` intends to suppress ASP.NET Core's implicit
/// "required" rule for non-nullable reference types, so that a missing field is reported by
/// FluentValidation with a catalogue key instead of by the model binder with an English sentence.
/// Measured before that change:
/// </para>
/// <code>
/// POST /api/tickets   {"subject":"s"}   Accept-Language: ar
///     description = The Description field is required.        ← the framework
///
/// POST /api/customers {"fullName":"x"}  Accept-Language: ar
///     email = أدخل بريدًا إلكترونيًا أو رقم هاتف.             ← the catalogue
/// </code>
/// <para>
/// The difference is not the endpoint — it is whether the request binds at all.
/// <c>CreateTicketCommand</c> is a positional record with non-nullable reference parameters, and
/// with nullable reference types enabled the binder treats those as implicitly required and
/// refuses <b>before</b> the MediatR pipeline runs, so <c>ValidationBehaviour</c> never executes.
/// </para>
/// <para>
/// <b>Why the ordering is a rule and not a preference.</b> Suppressing that binder behaviour moves
/// the check to FluentValidation. If a member has no rule, the field arrives as <c>null</c> in a
/// non-nullable property and reaches a handler — trading a `400` with an awkwardly-worded message
/// for a `500`. The product owner put it as: *a worse defect wearing a localization fix.* So this
/// test runs first, and if it is red the setting is not touched at all.
/// </para>
/// <para>
/// <b>Value types are excluded, and that is not an oversight.</b> A missing <c>Guid</c> or
/// <c>enum</c> binds to its default rather than to null, so it cannot produce a null-reference
/// failure. Whether <c>Guid.Empty</c> is meaningful is a business rule — `009` has
/// <c>Validation.Ticket.CustomerRequired</c> for exactly that — and it is not what this gate
/// protects.
/// </para>
/// </remarks>
public sealed class RequiredMemberCoverageTests
{
    private static readonly Assembly Application = typeof(ICommand).Assembly;

    /// <summary>Every command in the Application layer.</summary>
    private static IEnumerable<Type> Commands() =>
        Application.GetTypes()
            .Where(type => type is { IsClass: true, IsAbstract: false })
            .Where(typeof(ICommand).IsAssignableFrom);

    /// <summary>
    /// The members a missing JSON field would leave null.
    /// </summary>
    /// <remarks>
    /// Reference types that the nullable annotation says are not nullable. Read from the
    /// <see cref="NullabilityInfoContext"/> rather than from the type, because
    /// <c>string</c> and <c>string?</c> are the same runtime type — the difference lives only in
    /// the annotation, which is exactly the information the model binder is using.
    /// </remarks>
    private static IEnumerable<PropertyInfo> NonNullableMembers(Type command)
    {
        var nullability = new NullabilityInfoContext();

        return command
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            // Settable, or it is not bound from the request at all. `AuditAction` is a computed
            // property on IAuditableCommand — `=> "Ticket.CommentAdded"` — with no set accessor,
            // and the first run of this gate flagged it. A record's positional parameters compile
            // to `{ get; init; }` and are writable; an expression-bodied property is not.
            //
            // Structural rather than a name exclusion: a list of properties to ignore is a list
            // somebody extends until the gate stops guarding anything.
            .Where(property => property.CanRead && property.CanWrite)
            .Where(property => !property.PropertyType.IsValueType)
            .Where(property => nullability.Create(property).ReadState == NullabilityState.NotNull);
    }

    /// <summary>The validator registered for a command, if there is one.</summary>
    private static IValidator? ValidatorFor(Type command)
    {
        var contract = typeof(IValidator<>).MakeGenericType(command);

        var type = Application.GetTypes()
            .FirstOrDefault(candidate => candidate is { IsClass: true, IsAbstract: false }
                && contract.IsAssignableFrom(candidate));

        return type is null ? null : (IValidator)Activator.CreateInstance(type)!;
    }

    /// <summary>The property names a validator has at least one rule for.</summary>
    /// <remarks>
    /// Read from <see cref="IValidatorDescriptor"/>, which is FluentValidation's own view of its
    /// rules — not from the source. A rule added by a future refactor is visible here without
    /// anyone remembering to update a list.
    /// </remarks>
    private static IReadOnlySet<string> CoveredProperties(IValidator validator) =>
        validator.CreateDescriptor()
            .GetMembersWithValidators()
            .Select(group => group.Key)
            .ToHashSet(StringComparer.Ordinal);

    /// <summary>AC-4 — the gate.</summary>
    [Fact]
    public void Every_non_nullable_command_member_has_a_validator_rule()
    {
        var uncovered = new SortedSet<string>(StringComparer.Ordinal);

        foreach (var command in Commands())
        {
            var members = NonNullableMembers(command).ToList();

            if (members.Count == 0)
            {
                continue;
            }

            var validator = ValidatorFor(command);

            if (validator is null)
            {
                foreach (var member in members)
                {
                    uncovered.Add($"{command.Name}.{member.Name} (no validator at all)");
                }

                continue;
            }

            var covered = CoveredProperties(validator);

            foreach (var member in members.Where(member => !covered.Contains(member.Name)))
            {
                uncovered.Add($"{command.Name}.{member.Name}");
            }
        }

        uncovered.Should().BeEmpty(
            "`002c` suppresses the model binder's implicit-required rule so a missing field is "
            + "reported by FluentValidation with a catalogue key instead of an English sentence. "
            + "A member with no rule then arrives as null in a non-nullable property and reaches "
            + "a handler — a 500 in place of a 400. THIS TEST IS THE GATE: if it is red, "
            + "SuppressImplicitRequiredAttributeForNonNullableReferenceTypes must not be set");
    }

    /// <summary>
    /// The scanner finds something, so an empty sweep cannot pass as success.
    /// </summary>
    /// <remarks>
    /// `001` shipped an architecture test that was a false negative until somebody broke it on
    /// purpose. A reflection query that silently matched zero commands would satisfy the gate
    /// above and prove nothing at all.
    /// </remarks>
    [Fact]
    public void The_scanner_finds_commands_and_non_nullable_members()
    {
        Commands().Should().NotBeEmpty("the Application layer has commands");

        var members = Commands().SelectMany(NonNullableMembers).ToList();

        members.Should().NotBeEmpty(
            "at least one command has a non-nullable reference member — CreateTicketCommand has "
            + "three, and they are the reason this feature exists");

        members.Select(member => member.Name)
            .Should().Contain("Subject", "a bound record parameter must be in scope");

        members.Select(member => member.Name)
            .Should().NotContain("AuditAction",
                "a computed property with no set accessor is never bound from a request, and the "
                + "first run of this gate flagged it — this asserts the filter that fixed it");
    }
}
