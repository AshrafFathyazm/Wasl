using System.Reflection;
using System.Xml.Linq;
using FluentAssertions;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Customers;

namespace Wasl.Application.Tests.Architecture;

/// <summary>
/// The two boundaries that are the entire return on four projects (ADR-002): the domain
/// depends on nothing, and the Application layer cannot see the ORM or the web framework.
/// </summary>
/// <remarks>
/// <para>
/// These are tests rather than review items because both fail by <em>omission</em>, and
/// omission is what review is worst at catching. A reference added in a hurry announces
/// nothing; this does.
/// </para>
/// <para>
/// <b>Each boundary is checked twice, and the reason is a bug this test had on its first
/// day.</b> The original version asserted only over
/// <see cref="Assembly.GetReferencedAssemblies"/>, which returns what the compiled IL
/// actually <em>uses</em>. Adding <c>Microsoft.EntityFrameworkCore</c> to
/// <c>Wasl.Application</c> therefore left the test green, because no code in that project
/// touched an EF Core type yet. A guard that only trips after the damage is already in
/// use is not the guard AC-7 describes.
/// </para>
/// <para>
/// So the declared <c>PackageReference</c> set is read from the project file as well. The
/// two checks catch different things — the project file catches the reference, the
/// assembly catches transitive usage arriving through some other package — and both are
/// cheap.
/// </para>
/// </remarks>
public sealed class LayerDependencyTests
{
    private static readonly Assembly DomainAssembly = typeof(Customer).Assembly;
    private static readonly Assembly ApplicationAssembly = typeof(IApplicationDbContext).Assembly;

    // ── AC-7: the domain ────────────────────────────────────────────────────────────

    [Fact]
    public void Domain_declares_no_package_reference_at_all()
    {
        DeclaredPackages("src/Wasl.Domain/Wasl.Domain.csproj").Should().BeEmpty(
            "Wasl.Domain must reference no package at all — not EF Core, not ASP.NET Core, "
            + "not MediatR, not a JSON library. It is the claim four projects exist to make, "
            + "and one PackageReference silently cancels it.");
    }

    [Fact]
    public void Domain_uses_nothing_but_the_BCL()
    {
        UsedAssemblies(DomainAssembly)
            .Where(name => !IsBaseClassLibrary(name))
            .Should().BeEmpty("a package can also arrive transitively through another project.");
    }

    // ── AC-7: the Application layer ─────────────────────────────────────────────────

    [Fact]
    public void Application_declares_no_reference_to_EF_Core_or_ASP_NET_Core()
    {
        DeclaredPackages("src/Wasl.Application/Wasl.Application.csproj")
            .Where(IsForbiddenInApplication)
            .Should().BeEmpty(
                "Wasl.Application must not reference EF Core or ASP.NET Core. This is why "
                + "IApplicationDbContext exposes IQueryable<T> rather than DbSet<T>: DbSet<T> "
                + "is a type in Microsoft.EntityFrameworkCore, and naming it here would put "
                + "the ORM in this project's dependency graph. Infrastructure implements the "
                + "interface; Application only declares it.");
    }

    [Fact]
    public void Application_uses_nothing_from_EF_Core_or_ASP_NET_Core()
    {
        UsedAssemblies(ApplicationAssembly)
            .Where(IsForbiddenInApplication)
            .Should().BeEmpty("caught even if the package arrives transitively.");
    }

    // ── The direction ───────────────────────────────────────────────────────────────

    [Fact]
    public void Application_depends_on_the_domain_and_not_the_reverse()
    {
        UsedAssemblies(ApplicationAssembly).Should().Contain("Wasl.Domain");
        UsedAssemblies(DomainAssembly).Should().NotContain("Wasl.Application");
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────────

    private static bool IsForbiddenInApplication(string name) =>
        name.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal)
        || name.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal);

    private static bool IsBaseClassLibrary(string name) =>
        name.StartsWith("System", StringComparison.Ordinal)
        || name.Equals("netstandard", StringComparison.Ordinal)
        || name.Equals("mscorlib", StringComparison.Ordinal);

    private static string[] UsedAssemblies(Assembly assembly) =>
        assembly.GetReferencedAssemblies()
            .Select(reference => reference.Name ?? string.Empty)
            .ToArray();

    /// <summary>
    /// The <c>PackageReference</c> names declared in a project file, read from source
    /// rather than from the build output — which is the only way to see a reference that
    /// nothing has used yet.
    /// </summary>
    private static string[] DeclaredPackages(string relativePath)
    {
        var path = Path.Combine(RepositoryRoot(), relativePath);

        File.Exists(path).Should().BeTrue(
            "the test locates the project file by walking up to the repository root; "
            + $"'{path}' was not found, so either the layout moved or the walk is wrong. "
            + "A silently skipped architecture test is worse than no architecture test.");

        return XDocument.Load(path)
            .Descendants("PackageReference")
            .Select(element => element.Attribute("Include")?.Value ?? string.Empty)
            .Where(name => name.Length > 0)
            .ToArray();
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

        throw new InvalidOperationException(
            "Could not find the repository root: no .slnx or .sln above "
            + AppContext.BaseDirectory);
    }
}
