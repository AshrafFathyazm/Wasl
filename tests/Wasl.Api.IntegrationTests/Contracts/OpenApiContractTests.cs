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

        /* `GET /api/dashboard` WAS HERE AND IS DELETED, by `020` on 2026-09-07 — which is exactly
         * the hand edit this dictionary's remarks describe. The gate went red on the first full run
         * after the endpoint was built, naming it, and that is the mechanism working rather than a
         * nuisance: an entry left behind would have kept the endpoint out of the comparison for
         * every release after the one that built it.
         *
         * `POST /api/tickets/{id}/escalate` WAS HERE AND IS DELETED TOO, by `016` on 2026-09-08,
         * for the same reason. */
        ["GET /api/settings/branding"] = "022-tenant-theming-settings",
        ["PUT /api/settings/branding"] = "022-tenant-theming-settings",
        /* `GET /api/locales` WAS HERE AND IS DELETED — found by
         * `No_pending_entry_names_an_endpoint_no_contract_declares` on its first run, 2026-09-08,
         * and it is a different mistake from the two `021` entries below.
         *
         * It is not an undelivered promise. `005`'s frozen contract names it in an OUT OF SCOPE
         * table — "two locales, both known at build time on both sides. It would be a round trip
         * to learn something the bundle already contains" — so it is an endpoint this product
         * decided NOT to have. `014` then carried an exemption forward for it, and `014`'s
         * `spec.md`, `summary.md` and `tests.md` all state that it "stays in `002c`'s NotBuiltYet
         * with its reason", which reads as correct and is not: this dictionary is for endpoints a
         * contract DECLARES and nothing serves. A rejected endpoint needs no entry. */
        ["GET /api/customers/{id}/overview"] = "018-customer-overview",
        /* `021`'S THREE ENTRIES ARE ALL DELETED, 2026-09-08 — the endpoints are built:
         *
         *   GET  /api/communications/channels
         *   GET  /api/tickets/{ticketId}/interactions
         *   POST /api/tickets/{ticketId}/messages
         *
         * `No_pending_entry_names_an_endpoint_that_now_exists` went red naming all three on the
         * first full run after they were wired, which is that test doing its job — an entry left
         * behind would have kept the comparison from covering the endpoint for every release
         * after the one that built it. */

        /* TWO ENTRIES WERE DELETED FROM HERE by `021` on 2026-09-08, and neither was stale in the
         * usual way — both named endpoints that **no contract declares**:
         *
         *   POST /api/communications/inbound
         *   GET  /api/tickets/{id}/interactions/{interactionId}
         *
         * `021`'s contract mentions both only to say it will NOT build them — the inbound
         * endpoint is US-013's and "appears nowhere in the OpenAPI document", and the
         * single-interaction read "would be an endpoint with no caller". So the entries exempted
         * nothing from a comparison that never saw them, while reading as a promise.
         * `No_pending_entry_names_an_endpoint_no_contract_declares` is the guard that would have
         * caught them, and it did not exist. */

        /* `POST /api/tickets/{ticketId}/messages` WAS HERE TOO and is deleted with the other two.
         * Its note is worth keeping: it was "found BY this test on its first run, not by anyone
         * reading the contracts" — it had been in `021`'s frozen contract, unbuilt, and nothing
         * had ever noticed. It is built now. */

        /* `GET /api/tickets/{id}/comments/{commentId}` WAS HERE AND IS DELETED — the fourth dead
         * entry the new guard found, and its own note had it exactly backwards. It read: "the
         * contract describes a single-comment read that was never built; the timeline serves it".
         *
         * `013`'s contract says the opposite, in words: "there is no
         * GET /api/tickets/{id}/comments/{commentId} in the endpoint inventory and THERE WILL NOT
         * BE ONE, because BR-5.3 gives a comment no addressable identity of its own." Same
         * category as `GET /api/locales` above — an endpoint a contract REJECTS, listed as one a
         * contract PROMISES. */
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
    /// `021`. An entry naming an endpoint <b>no contract declares</b> is dead too.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The test above catches an exemption whose endpoint is now BUILT. Nothing caught the other
    /// kind, and `021` found two of them — both attributed to itself:
    /// <c>POST /api/communications/inbound</c> and
    /// <c>GET /api/tickets/{id}/interactions/{interactionId}</c>. Neither appears as a heading in
    /// any file under a <c>contracts/</c> directory, so neither was ever in the comparison; the
    /// entries exempted nothing.
    /// </para>
    /// <para>
    /// <b>Worse than merely dead:</b> `021`'s contract explicitly refuses to build both — the
    /// inbound endpoint is US-013's and *"returns `404` and appears nowhere in the OpenAPI
    /// document"*, and the single-interaction read *"would be an endpoint with no caller"*. An
    /// entry reading "contracted, not built yet" says the opposite: that it is coming. And if
    /// anybody ever did build a path with one of those names, the stale entry would exempt it
    /// from the comparison silently.
    /// </para>
    /// </remarks>
    [Fact]
    public void No_pending_entry_names_an_endpoint_no_contract_declares()
    {
        var contracted = Contracted();

        NotBuiltYet.Keys.Where(endpoint => !contracted.Contains(endpoint))
            .Should().BeEmpty(
                "an exemption for an endpoint no contract declares exempts nothing, and it hides "
                + "the path if somebody later builds it. Delete the entry — or add the contract "
                + "heading, if the endpoint is genuinely promised");
    }

    /// <summary>
    /// AC-3 — every operation declares its statuses, and every error one is `problem+json`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>`002c` recorded this as not claimed, on the belief that no action carried
    /// <c>[ProducesResponseType]</c>.</b> Measured on 2026-08-30 while picking the work up:
    /// thirty-eight of them are already there, across all thirteen actions —
    /// <c>TicketsController</c> alone has twenty-one. The annotations were never the gap, and the
    /// estimate `002c` gave the product owner — "an hour, twelve actions" — was for work that had
    /// already been done.
    /// </para>
    /// <para>
    /// So this asserts the observable the criterion actually asks for — that the DOCUMENT declares
    /// them — rather than that the attributes exist. If a future action ships without them the
    /// document loses its statuses and this goes red; reading the source for attributes would pass
    /// on a document that never rendered them.
    /// </para>
    /// <para>
    /// Only <c>/api/</c> paths: <c>/health</c> is outside it and returns the health report shape
    /// rather than <c>ProblemDetails</c>, which is `002` AC-11's one documented exception.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Every_operation_declares_its_statuses_and_errors_are_problem_json()
    {
        using var scope = factory.Services.CreateScope();
        var document = await scope.ServiceProvider
            .GetRequiredKeyedService<IOpenApiDocumentProvider>("v1")
            .GetOpenApiDocumentAsync();

        var undeclared = new SortedSet<string>(StringComparer.Ordinal);
        var wrongMediaType = new SortedSet<string>(StringComparer.Ordinal);

        foreach (var path in document.Paths.Where(entry =>
            entry.Key.StartsWith("/api/", StringComparison.Ordinal)))
        {
            foreach (var operation in path.Value.Operations!)
            {
                var name = $"{operation.Key.ToString().ToUpperInvariant()} {path.Key}";
                var responses = operation.Value.Responses;

                if (responses is null || responses.Count == 0)
                {
                    undeclared.Add(name);
                    continue;
                }

                foreach (var response in responses.Where(entry =>
                    int.TryParse(entry.Key, out var status) && status >= 400))
                {
                    var content = response.Value.Content;

                    if (content is { Count: > 0 }
                        && !content.ContainsKey("application/problem+json"))
                    {
                        wrongMediaType.Add(
                            $"{name} -> {response.Key}: {string.Join(", ", content.Keys)}");
                    }
                }
            }
        }

        undeclared.Should().BeEmpty(
            "an operation with no declared responses gives a generated client nothing to type a "
            + "result as — which is exactly what `028` would have to hand-write around");

        wrongMediaType.Should().BeEmpty(
            "every non-2xx in this API is RFC 7807 `application/problem+json`, and a document "
            + "saying otherwise would have a generated client parsing the wrong shape on every "
            + "failure — the one path a client cannot easily test its way out of");
    }

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
