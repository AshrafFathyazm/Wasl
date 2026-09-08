using System.Reflection;
using FluentValidation;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Common.Communications;

namespace Wasl.Application.Tests.Architecture;

/// <summary>
/// Builds any validator in <c>Wasl.Application</c> so a guard can read its rules. `021`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Written because three guards broke at once, and all three broke correctly.</b>
/// <c>ValidatorMessageKeyTests</c> (twice) and <c>RequiredMemberCoverageTests</c> each did
/// <c>Activator.CreateInstance(type)</c>, which every validator in this codebase supported
/// because every one of them was parameterless. `021`'s
/// <c>SendMessageCommandValidator</c> takes a <c>CommunicationProviderRegistry</c> — AC-3 asks
/// whether a provider is registered for the requested channel, and AC-4 asks that the answer live
/// in exactly one place — so all three threw
/// <c>MissingMethodException: No parameterless constructor defined</c>.
/// </para>
/// <para>
/// <b>The alternative was to remove the dependency, and it was declined.</b> A
/// <c>SendableChannels</c> constant would have kept the guards working and made AC-4 false: the
/// sendable set would then be stated twice, and the copy that drifts is the one that offers a
/// channel the server refuses. Teaching three test helpers to supply a constructor argument is
/// the cheaper half of that trade, and this is the one place it is taught.
/// </para>
/// <para>
/// <b>The instances it supplies are REAL, not mocks, and deliberately empty.</b> These guards read
/// rule <i>metadata</i> — property names and message keys off
/// <c>IValidatorDescriptor</c> — and never execute a rule. An empty registry is therefore
/// sufficient and is honest about it: no test here asserts what
/// <c>Must(registry.CanSend)</c> returns, and one that wanted to would build its own registry with
/// providers in it.
/// </para>
/// </remarks>
internal static class ValidatorFactory
{
    /// <summary>
    /// Every concrete validator in the Application assembly.
    /// </summary>
    public static IEnumerable<IValidator> All(Assembly application) =>
        application.GetTypes()
            .Where(type => type is { IsClass: true, IsAbstract: false, IsGenericTypeDefinition: false })
            .Where(typeof(IValidator).IsAssignableFrom)
            .Select(Create);

    /// <summary>
    /// One validator, with any constructor argument it needs.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// A constructor parameter this factory does not know how to supply. <b>Thrown rather than
    /// skipped</b>, and that matters: returning <c>null</c> or quietly omitting the validator
    /// would drop it from every guard that calls this — and a validator silently outside
    /// <c>ValidatorMessageKeyTests</c> is a validator free to ship a raw resource key, which is
    /// the defect `004b` found seventeen of.
    /// </exception>
    public static IValidator Create(Type validatorType)
    {
        ArgumentNullException.ThrowIfNull(validatorType);

        var constructor = validatorType.GetConstructors().Single();

        var arguments = constructor.GetParameters()
            .Select(parameter => Supply(parameter, validatorType))
            .ToArray();

        return (IValidator)constructor.Invoke(arguments);
    }

    private static object Supply(ParameterInfo parameter, Type validatorType) =>
        parameter.ParameterType switch
        {
            // `021`. Empty on purpose — see the remarks on why metadata-only reads make that safe.
            var type when type == typeof(CommunicationProviderRegistry) =>
                new CommunicationProviderRegistry([]),

            _ => throw new InvalidOperationException(
                $"{validatorType.Name} takes a {parameter.ParameterType.Name} and "
                + $"{nameof(ValidatorFactory)} does not know how to supply one. Add a case above "
                + "rather than making the guards skip this validator — a validator outside "
                + "ValidatorMessageKeyTests can ship a raw resource key, and a validator outside "
                + "RequiredMemberCoverageTests can let a missing field reach a handler as null."),
        };

    /// <summary>Convenience for a caller that has the validated type rather than the validator.</summary>
    public static IValidator? For(Assembly application, Type validatedType)
    {
        var contract = typeof(IValidator<>).MakeGenericType(validatedType);

        var type = application.GetTypes()
            .FirstOrDefault(candidate =>
                candidate is { IsClass: true, IsAbstract: false } && contract.IsAssignableFrom(candidate));

        return type is null ? null : Create(type);
    }
}
