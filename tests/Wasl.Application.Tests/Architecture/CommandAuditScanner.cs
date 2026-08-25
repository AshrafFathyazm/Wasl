using System.Reflection;
using Wasl.Application.Common.Messaging;

namespace Wasl.Application.Tests.Architecture;

/// <summary>
/// Finds types that change state without declaring what to audit. NFR-10.
/// </summary>
/// <remarks>
/// A separate class from the test that uses it, so the same scanner can be pointed at a
/// deliberate violator and shown to report it (AC-14b). A scanner defined inside its only
/// test cannot be verified — it can only be trusted.
/// </remarks>
internal static class CommandAuditScanner
{
    /// <summary>
    /// Every concrete type in <paramref name="assembly"/> that implements
    /// <see cref="ICommand"/> without implementing <c>IAuditableCommand&lt;T&gt;</c>.
    /// </summary>
    public static IReadOnlyList<Type> FindUnauditableCommands(Assembly assembly) =>
        assembly.GetTypes()
            .Where(type => type is { IsClass: true, IsAbstract: false })
            .Where(typeof(ICommand).IsAssignableFrom)
            .Where(type => !DeclaresAnAuditAction(type))
            .OrderBy(type => type.FullName, StringComparer.Ordinal)
            .ToArray();

    /// <summary>
    /// True when the type implements the open generic <c>IAuditableCommand&lt;T&gt;</c> at any
    /// closed <c>T</c>.
    /// </summary>
    /// <remarks>
    /// Compared against the <b>open</b> generic definition. Testing
    /// <c>typeof(IAuditableCommand&lt;object&gt;).IsAssignableFrom(type)</c> instead would only
    /// ever match a command whose response happened to be <c>object</c> — so the scanner would
    /// report every real command as a violation, or, if written the other way round, none of
    /// them. Both errors are invisible while the population is empty, which is the whole
    /// reason AC-14 demands a self-test.
    /// </remarks>
    private static bool DeclaresAnAuditAction(Type type) =>
        type.GetInterfaces().Any(contract =>
            contract.IsGenericType
            && contract.GetGenericTypeDefinition() == typeof(IAuditableCommand<>));
}
