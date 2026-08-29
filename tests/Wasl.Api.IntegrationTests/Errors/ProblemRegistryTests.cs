using System.Reflection;
using FluentAssertions;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Api.IntegrationTests.Errors;

/// <summary>
/// The registry is the shared vocabulary. These assertions are what make it a rule rather
/// than a convention.
/// </summary>
/// <remarks>
/// No database and no HTTP — these are assertions over types and a static table, and they
/// live here only because <c>ProblemTypes</c> is internal to <c>Wasl.Api</c>.
/// </remarks>
public sealed class ProblemRegistryTests
{
    private static readonly Assembly ApiAssembly = typeof(Program).Assembly;
    private static readonly Type ProblemTypes =
        ApiAssembly.GetType("Wasl.Api.Common.Errors.ProblemTypes")!;

    private static IReadOnlyDictionary<string, object> Registry()
    {
        var all = ProblemTypes.GetProperty("All", BindingFlags.Public | BindingFlags.Static)!
            .GetValue(null)!;

        var result = new Dictionary<string, object>(StringComparer.Ordinal);

        foreach (var entry in (System.Collections.IEnumerable)all)
        {
            var type = entry.GetType();
            var key = (string)type.GetProperty("Key")!.GetValue(entry)!;
            result[key] = type.GetProperty("Value")!.GetValue(entry)!;
        }

        return result;
    }

    private static int StatusOf(object definition) =>
        (int)definition.GetType().GetProperty("Status")!.GetValue(definition)!;

    /// <summary>
    /// AC-14. The one that matters most: an unregistered code degrades into
    /// <c>500 errors/internal</c> — a real failure rendered as a generic one, and
    /// indistinguishable from a genuine bug in the log and in the UI.
    /// </summary>
    [Fact]
    public void Every_domain_error_code_is_registered()
    {
        var codes = typeof(DomainErrorCodes)
            .GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy)
            .Where(field => field is { IsLiteral: true, IsInitOnly: false })
            .Select(field => (string)field.GetRawConstantValue()!)
            .ToArray();

        codes.Should().NotBeEmpty("the reflection above must actually find the codes — "
            + "a test that silently examines nothing is worse than no test");

        var registry = Registry();

        codes.Where(code => !registry.ContainsKey(code)).Should().BeEmpty(
            "every code in DomainErrorCodes needs a row in ProblemTypes. Without one the "
            + "failure returns 500 errors/internal, which is a real failure rendered as a "
            + "generic one — see contracts/error-contract.md");
    }

    /// <summary>
    /// The reverse direction. A registry row nothing can raise is either a promise kept
    /// for a later feature — which the contract names — or a typo.
    /// </summary>
    [Fact]
    public void Every_registry_row_is_either_raisable_or_deliberately_reserved()
    {
        // Codes owned by 002's own machinery or by a later feature, per the contract's
        // "Owning feature" column. Listed explicitly so adding a row without a raiser is
        // a deliberate act rather than an accident.
        // "forbidden" left this list when `003` added DomainErrorCodes.Forbidden. `002`
        // reserved it for `004` on the understanding that a 403 comes from auth middleware —
        // true for a role-only check, and false for BR-6 data-dependent checks, which are
        // raised in the handler as a DomainException so the audit pipeline can classify them
        // as Denied rather than Failed. It is now raisable, so listing it as reserved would
        // be the test asserting something that stopped being true.
        string[] reservedByLaterFeatures =
        [
            "internal", "malformed-request", "method-not-allowed", "unsupported-media-type",
            "unauthenticated",
        ];

        var domainCodes = typeof(DomainErrorCodes)
            .GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy)
            .Where(field => field is { IsLiteral: true, IsInitOnly: false })
            .Select(field => (string)field.GetRawConstantValue()!)
            .ToHashSet(StringComparer.Ordinal);

        Registry().Keys
            .Where(code => !domainCodes.Contains(code) && !reservedByLaterFeatures.Contains(code))
            .Should().BeEmpty(
                "a registry row that neither the domain raises nor this list reserves is a "
                + "typo. Add it to DomainErrorCodes or to the reserved list, with the "
                + "owning feature named in contracts/error-contract.md");
    }

    /// <summary>AC-15. Two rows sharing a status is fine; two sharing a URI is a collision.</summary>
    [Fact]
    public void Every_type_uri_is_unique()
    {
        var uriFor = ProblemTypes.GetMethod("UriFor", BindingFlags.Public | BindingFlags.Static)!;

        var uris = Registry().Keys
            .Select(code => (string)uriFor.Invoke(null, [code])!)
            .ToArray();

        uris.Should().OnlyHaveUniqueItems(
            "the type URI is what a client branches on. Two codes sharing one makes the "
            + "distinction the registry exists to provide unavailable to the client");
    }

    /// <summary>AC-15. Every status must be one the API conventions actually document.</summary>
    [Fact]
    public void Every_registered_status_is_in_the_documented_table()
    {
        // 429 arrived with `004b`, and this test is the reason it did not arrive silently: adding
        // the registry row turned it red, which forced the contract table to be corrected in the
        // same change. That is the whole purpose of the list — it is not documentation of the
        // registry, it is a second, independent statement that has to be made to agree with it.
        int[] documented = [400, 401, 403, 404, 405, 409, 415, 429, 500];

        Registry().Values
            .Select(StatusOf)
            .Distinct()
            .Where(status => !documented.Contains(status))
            .Should().BeEmpty(
                "a status outside docs/sdd/05-api-conventions.md's table means either the "
                + "table or the registry is wrong, and both must be corrected — never one "
                + "silently");
    }

    /// <summary>
    /// AC-16. The base URI appears once in <c>src/</c>, as a compile-time constant.
    /// </summary>
    /// <remarks>
    /// A base that varies by environment breaks every client comparing the full URI, and
    /// clients do compare it. Asserted over the source tree because the point is that
    /// there is exactly <b>one</b> occurrence, which a runtime check cannot see.
    /// </remarks>
    [Fact]
    public void The_type_base_uri_appears_exactly_once_in_source()
    {
        var root = RepositoryRoot();
        var occurrences = Directory
            .EnumerateFiles(Path.Combine(root, "src"), "*.cs", SearchOption.AllDirectories)
            .Where(path => !path.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")
                && !path.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
            .Select(path => (path, text: File.ReadAllText(path)))
            .Where(file => file.text.Contains("wasl.local/errors/", StringComparison.Ordinal))
            .Select(file => Path.GetFileName(file.path))
            .ToArray();

        occurrences.Should().BeEquivalentTo(["ProblemTypes.cs"],
            "the base URI is a compile-time constant in one place (AC-16). A second "
            + "occurrence is a second source of truth");
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null)
        {
            if (directory.EnumerateFiles("*.slnx").Any() || directory.EnumerateFiles("*.sln").Any())
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new InvalidOperationException("Could not find the repository root above " + AppContext.BaseDirectory);
    }
}
