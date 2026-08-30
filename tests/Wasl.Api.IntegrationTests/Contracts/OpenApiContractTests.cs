using System.Text.RegularExpressions;
using FluentAssertions;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.DependencyInjection;

namespace Wasl.Api.IntegrationTests.Contracts;

/// <summary>
/// The generated OpenAPI document matches the frozen contracts. `002c` AC-1 … AC-3.
/// </summary>
/// <remarks>
/// <para>
/// <b>The Definition of Done has said *"the generated OpenAPI matches `contracts/`"* since `001`,
/// and it has never been satisfiable for any feature</b> — because until `002c` there was no
/// document. Neither Swashbuckle nor `Microsoft.AspNetCore.OpenApi` was referenced, and
/// `CLAUDE.md`'s Commands block promised a `/swagger` that returned `401` from the fallback
/// policy on an unmatched route.
/// </para>
/// <para>
/// <b>The document is generated here and NOT served</b> (`002c` Q-B, ruled). `Program.cs` never
/// calls <c>MapOpenApi</c>: an unauthenticated description of every endpoint would need
/// <c>AllowAnonymous</c>, making it the third anonymous endpoint after <c>/health</c> and
/// <c>POST /api/auth/token</c> — a list `004` AC-10 counts and asserts. If a demo ever wants the
/// explorer it is Development-only, with a test asserting `404` in Production.
/// </para>
/// <para>
/// <b>Paths, methods and statuses only</b> (Q-C, ruled). Request and response bodies are prose in
/// the contract files; comparing them would need a format invented for the purpose, and the first
/// wording difference would have somebody loosening the comparison rather than fixing the
/// contract.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class OpenApiContractTests(WaslApiFactory factory)
{
    /// <summary>
    /// Endpoints named in a contract whose feature is <b>not built yet</b>.
    /// </summary>
    /// <remarks>
    /// <b>Named individually with the feature that owns each, never by loosening the comparison.</b>
    /// `contracts/` is frozen before either lane starts, so a documented-but-absent endpoint is
    /// the expected state for undelivered work — and the moment it stops being expected, the entry
    /// has to be deleted by hand, which is the point.
    /// <br/>
    /// The reverse direction has no exceptions at all: a <b>built</b> endpoint missing from every
    /// contract is a defect with no legitimate form.
    /// </remarks>
    private static readonly Dictionary<string, string> NotBuiltYet = new(StringComparer.Ordinal)
    {
        ["GET /api/audit"] = "019-audit-log-access",
        ["GET /api/dashboard"] = "020-dashboard",
        ["GET /api/settings/branding"] = "022-tenant-theming-settings",
        ["PUT /api/settings/branding"] = "022-tenant-theming-settings",
        ["GET /api/locales"] = "014-language-preference-and-rtl",
        ["GET /api/customers/{id}/overview"] = "018-customer-overview",
        ["PUT /api/customers/{id}"] = "017-update-customer",
        ["POST /api/tickets/{id}/escalate"] = "016-escalate-ticket",
        ["GET /api/communications/channels"] = "021-communication-provider-abstraction",
        ["POST /api/communications/inbound"] = "021-communication-provider-abstraction",
        ["GET /api/tickets/{ticketId}/interactions"] = "021-communication-provider-abstraction",
        ["GET /api/tickets/{id}/interactions/{interactionId}"] = "021-communication-provider-abstraction",

        // Found BY this test on its first run, not by anyone reading the contracts. It is in
        // `021`'s frozen contract and nothing had ever noticed it was unbuilt.
        ["POST /api/tickets/{ticketId}/messages"] = "021-communication-provider-abstraction",
        ["GET /api/tickets/{id}/comments/{commentId}"] = "013 — the contract describes a single-comment read that was never built; the timeline serves it",
    };

    /// <summary>`METHOD /path`, from the generated document.</summary>
    private static async Task<IReadOnlySet<string>> DocumentedAsync(WaslApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        // KEYED by document name. `AddOpenApi()` registers one provider per document — the default
        // document is "v1" — so an unkeyed resolve throws "No service for type ...". Measured on
        // the first run of this test rather than read from a guide.
        var provider = scope.ServiceProvider.GetRequiredKeyedService<IOpenApiDocumentProvider>("v1");
        var document = await provider.GetOpenApiDocumentAsync();

        return document.Paths
            // Test-only probes are excluded, and the FIRST run of this test is why.
            //
            // `002c`'s spec said a probe "is never in the document — mapped by the fixture, not by
            // src/". That was wrong: the fixture maps them into the REAL pipeline through an
            // IStartupFilter, so they are genuine endpoints and OpenAPI sees them. What is true is
            // that they exist only in the test host — `grep -rn "__probe" src/` returns 0 — so a
            // path prefix `src/` can never produce is a safe and checkable exclusion.
            .Where(path => !path.Key.StartsWith("/__probe/", StringComparison.Ordinal))
            .SelectMany(path => path.Value.Operations!
                .Select(operation => $"{operation.Key.ToString().ToUpperInvariant()} {path.Key}"))
            .ToHashSet(StringComparer.Ordinal);
    }

    /// <summary>
    /// `METHOD /path`, from every contract's headings.
    /// </summary>
    /// <remarks>
    /// Headings only — <c>## `POST /api/tickets`</c> — and never prose. Sixteen of the twenty-one
    /// contract files use that form, and the five that do not describe no `/api` endpoint at all
    /// (`/health` is outside `/api`; the rest are the error envelope, the localization contract
    /// and two pointer READMEs). Scanning prose instead would have picked up
    /// <c>GET /api/customers/not-a-guid</c>, which is an example of a malformed request rather
    /// than an endpoint — Q-C's risk, measured before this was written.
    /// </remarks>
    private static IReadOnlySet<string> Contracted()
    {
        var heading = new Regex(
            @"^#+\s+`?(GET|POST|PUT|PATCH|DELETE)\s+(/api/[^`\s]*)`?\s*$",
            RegexOptions.Multiline | RegexOptions.Compiled);

        var root = RepositoryRoot();
        var endpoints = new HashSet<string>(StringComparer.Ordinal);

        foreach (var file in Directory.EnumerateFiles(
            Path.Combine(root, "specs"), "*.md", SearchOption.AllDirectories)
            .Where(path => path.Contains($"{Path.DirectorySeparatorChar}contracts{Path.DirectorySeparatorChar}")))
        {
            foreach (Match match in heading.Matches(File.ReadAllText(file)))
            {
                endpoints.Add($"{match.Groups[1].Value} {match.Groups[2].Value.TrimEnd('/')}");
            }
        }

        return endpoints;
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null && !directory.EnumerateFiles("*.slnx").Any())
        {
            directory = directory.Parent;
        }

        directory.Should().NotBeNull("the repository root must be findable from the test binary");

        return directory!.FullName;
    }

    /// <summary>AC-1 — the document exists and describes the real endpoints.</summary>
    /// <remarks>
    /// The count is derived from the document rather than written down: a number in an assertion
    /// is a number somebody updates to match a regression.
    /// </remarks>
    [Fact]
    public async Task The_document_is_generated_and_describes_every_controller_action()
    {
        var documented = await DocumentedAsync(factory);

        documented.Should().NotBeEmpty(
            "a document with no paths would satisfy every comparison below");

        documented.Should().Contain("POST /api/tickets");
        documented.Should().Contain("POST /api/auth/token");
        documented.Should().Contain("GET /api/customers");
    }

    /// <summary>
    /// AC-2, the strict direction — a built endpoint absent from every contract.
    /// </summary>
    /// <remarks>
    /// <b>No exceptions.</b> An endpoint the application serves and no contract describes is a
    /// defect with no legitimate form: the frontend lane reads `contracts/` and starts before the
    /// backend exists, so an undocumented endpoint is one the other lane cannot know about.
    /// </remarks>
    [Fact]
    public async Task Every_built_endpoint_appears_in_a_frozen_contract()
    {
        var contracted = Contracted();

        (await DocumentedAsync(factory))
            .Where(endpoint => !contracted.Contains(endpoint))
            .Should().BeEmpty(
                "the frontend lane reads contracts/ and starts before the backend exists, so an "
                + "endpoint that is served and not described is one the other lane cannot know "
                + "about. There is no exception list for this direction");
    }

    /// <summary>
    /// AC-2, the other direction — a contract with no endpoint behind it.
    /// </summary>
    /// <remarks>
    /// Expected while a feature is undelivered, and each one is <b>named with its feature</b> in
    /// <see cref="NotBuiltYet"/>. When the feature ships, this test goes red until the entry is
    /// deleted — which is how the list stays honest rather than becoming a place to hide things.
    /// </remarks>
    [Fact]
    public async Task Every_contracted_endpoint_is_built_or_named_as_pending()
    {
        var documented = await DocumentedAsync(factory);

        Contracted()
            .Where(endpoint => !documented.Contains(endpoint))
            .Where(endpoint => !NotBuiltYet.ContainsKey(endpoint))
            .Should().BeEmpty(
                "a contract describes an endpoint nothing serves. That is expected while its "
                + "feature is undelivered — add it to NotBuiltYet with the feature that owns it. "
                + "It is NOT resolved by loosening this comparison");
    }

    /// <summary>
    /// The exception list does not outlive its reason.
    /// </summary>
    /// <remarks>
    /// An entry naming an endpoint that <b>is</b> built is a stale exception, and a stale
    /// exception is how a comparison quietly stops comparing. `007`'s guard was inverted rather
    /// than deleted for the same reason.
    /// </remarks>
    [Fact]
    public async Task No_pending_entry_names_an_endpoint_that_now_exists()
    {
        var documented = await DocumentedAsync(factory);

        NotBuiltYet.Keys.Where(documented.Contains)
            .Should().BeEmpty(
                "this endpoint is built now, so its entry in NotBuiltYet is stale and must be "
                + "deleted — otherwise the comparison stops covering it and nobody notices");
    }

    /// <summary>
    /// The contract scanner finds something, so an empty sweep cannot pass as agreement.
    /// </summary>
    /// <remarks>
    /// Two empty sets compare equal. `001` shipped an architecture test that was a false negative
    /// until somebody broke it on purpose, and a regex that matched nothing here would make every
    /// assertion above vacuously true.
    /// </remarks>
    [Fact]
    public void The_contract_scanner_reads_real_endpoints_and_ignores_prose()
    {
        var contracted = Contracted();

        contracted.Should().Contain("POST /api/tickets");
        contracted.Should().Contain("GET /api/customers/{id}");

        contracted.Should().NotContain("GET /api/customers/not-a-guid",
            "that appears in prose as an example of a malformed request, not as an endpoint — "
            + "scanning prose rather than headings would have picked it up");
    }
}
