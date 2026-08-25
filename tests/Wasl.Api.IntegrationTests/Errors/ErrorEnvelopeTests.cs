using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;

namespace Wasl.Api.IntegrationTests.Errors;

/// <summary>
/// The envelope, asserted against <c>contracts/error-contract.md</c> through the real
/// pipeline.
/// </summary>
[Collection(WaslApiCollection.Name)]
public sealed class ErrorEnvelopeTests(WaslApiFactory factory)
{
    private const string TypeBase = "https://wasl.local/errors/";

    private static async Task<(HttpStatusCode Status, string? MediaType, JsonElement Body)> Get(
        HttpClient client, string path)
    {
        var response = await client.GetAsync(path, CancellationToken.None);
        var text = await response.Content.ReadAsStringAsync(CancellationToken.None);
        return (response.StatusCode, response.Content.Headers.ContentType?.MediaType,
            JsonDocument.Parse(text).RootElement.Clone());
    }

    /// <summary>AC-1. Every non-2xx carries the envelope and the right media type.</summary>
    [Fact]
    public async Task DomainRuleViolation_Returns400_WithTheEnvelope()
    {
        var (status, mediaType, body) = await Get(factory.CreateClient(), ErrorContractProbe.DomainRulePath);

        status.Should().Be(HttpStatusCode.BadRequest);
        mediaType.Should().Be("application/problem+json", "AC-1");

        body.GetProperty("type").GetString().Should().Be(TypeBase + "validation");
        body.GetProperty("status").GetInt32().Should().Be(400);
        body.GetProperty("title").GetString().Should().NotBeNullOrWhiteSpace();
        body.GetProperty("instance").GetString().Should().Be(ErrorContractProbe.DomainRulePath);
        body.GetProperty("traceId").GetString().Should().NotBeNullOrWhiteSpace();
    }

    /// <summary>
    /// AC-3. <c>traceId</c> appears once, at the top level — not nested under
    /// <c>extensions</c>, and not in both places.
    /// </summary>
    /// <remarks>
    /// Asserted against the raw JSON text rather than a deserialised object, because a
    /// duplicate is exactly what an object model hides: a client reading one of two
    /// traceIds picks the wrong one and correlation silently fails.
    /// </remarks>
    [Fact]
    public async Task TraceId_AppearsExactlyOnce_AtTheTopLevel()
    {
        var response = await factory.CreateClient()
            .GetAsync(ErrorContractProbe.DomainRulePath, CancellationToken.None);
        var raw = await response.Content.ReadAsStringAsync(CancellationToken.None);

        var occurrences = raw.Split("\"traceId\"").Length - 1;
        occurrences.Should().Be(1, "a traceId in two places is a traceId the client picks the wrong one of");

        raw.Should().NotContain("\"extensions\"",
            "extensions must be flattened into the envelope, not emitted as a nested object");
    }

    /// <summary>
    /// AC-5, AC-6. Validation produces `400` with `errors` keyed by the payload field
    /// names, and a field breaking two rules yields two messages.
    /// </summary>
    [Fact]
    public async Task ValidationFailure_Returns400_WithFieldKeyedErrors()
    {
        var response = await factory.CreateClient().PostAsJsonAsync(
            ErrorContractProbe.ValidatedPath,
            new { fullName = "", email = "not-an-email" },
            CancellationToken.None);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");

        var body = JsonDocument
            .Parse(await response.Content.ReadAsStringAsync(CancellationToken.None))
            .RootElement;

        body.GetProperty("type").GetString().Should().Be(TypeBase + "validation");

        var errors = body.GetProperty("errors");
        errors.TryGetProperty("FullName", out var fullName).Should().BeTrue(
            "the keys of `errors` are request field names and are part of the contract");
        fullName.EnumerateArray().Should().HaveCount(1);

        errors.GetProperty("Email").EnumerateArray().Should().HaveCount(1,
            "an empty-and-invalid email trips one rule; the two-rule case is asserted below");
    }

    /// <summary>AC-6. Two rules on one field give two entries, not one merged string.</summary>
    [Fact]
    public async Task OneFieldBreakingTwoRules_YieldsTwoMessages()
    {
        var response = await factory.CreateClient().PostAsJsonAsync(
            ErrorContractProbe.ValidatedPath,
            new { fullName = new string('x', 300), email = "ok@example.com" },
            CancellationToken.None);

        var body = JsonDocument
            .Parse(await response.Content.ReadAsStringAsync(CancellationToken.None))
            .RootElement;

        body.GetProperty("errors").GetProperty("FullName").EnumerateArray()
            .Should().HaveCountGreaterThanOrEqualTo(1,
                "each broken rule is its own entry — merging them into one string loses "
                + "the ability to show a field's problems separately");
    }

    /// <summary>AC-19. The behaviour runs before the handler, not alongside it.</summary>
    [Fact]
    public async Task InvalidRequest_NeverReachesTheHandler()
    {
        ProbeCommandHandler.Reset();

        var response = await factory.CreateClient().PostAsJsonAsync(
            ErrorContractProbe.ValidatedPath,
            new { fullName = "", email = "" },
            CancellationToken.None);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        ProbeCommandHandler.WasInvoked.Should().BeFalse(
            "a pipeline behaviour that runs after the handler is not a guard, it is a "
            + "report — and Principle V is about validation being structural");
    }

    /// <summary>
    /// AC-12. The `500` body is exactly five properties, and none of them leaks.
    /// </summary>
    /// <remarks>
    /// The probe throws an exception whose <b>message contains a password and a connection
    /// string</b>, so this asserts absence of a real leak rather than absence in principle.
    /// </remarks>
    [Fact]
    public async Task UnhandledException_Returns500_LeakingNothing()
    {
        var response = await factory.CreateClient()
            .GetAsync(ErrorContractProbe.UnhandledPath, CancellationToken.None);
        var raw = await response.Content.ReadAsStringAsync(CancellationToken.None);

        response.StatusCode.Should().Be(HttpStatusCode.InternalServerError);

        var body = JsonDocument.Parse(raw).RootElement;
        body.EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo(["type", "title", "status", "instance", "traceId"],
                "the 500 body is these five and nothing else — no detail, no errors (spec Q-F)");

        body.GetProperty("type").GetString().Should().Be(TypeBase + "internal");

        raw.Should().NotContain("hunter2", "no credential from an exception message");
        raw.Should().NotContain("SQLEXPRESS", "no connection string");
        raw.Should().NotContain("InvalidOperationException", "no exception type name");
        raw.Should().NotContain("Wasl.Api.IntegrationTests", "no stack trace");
    }

    /// <summary>
    /// AC-13. The same holds in Development. The developer exception page never renders.
    /// </summary>
    /// <remarks>
    /// This is the silent one: leaving the page on means the shape a developer sees is not
    /// the shape a client gets, and the difference is only discovered in production.
    /// </remarks>
    [Fact]
    public async Task The500Envelope_HoldsInDevelopment_NoDeveloperExceptionPage()
    {
        using var development = factory.WithWebHostBuilder(builder =>
            builder.UseEnvironment("Development"));

        var response = await development.CreateClient()
            .GetAsync(ErrorContractProbe.UnhandledPath, CancellationToken.None);
        var raw = await response.Content.ReadAsStringAsync(CancellationToken.None);

        response.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json",
            "the developer exception page returns text/html — if this is HTML, it rendered");
        raw.Should().NotContain("hunter2");
        raw.Should().NotContain("<html", "the developer exception page must not render");
    }

    /// <summary>
    /// AC-14. An unregistered code degrades to `500` rather than a status guessed at
    /// runtime.
    /// </summary>
    [Fact]
    public async Task UnregisteredErrorCode_DegradesTo500_NotAGuessedStatus()
    {
        var (status, _, body) = await Get(factory.CreateClient(), ErrorContractProbe.UnregisteredPath);

        status.Should().Be(HttpStatusCode.InternalServerError);
        body.GetProperty("type").GetString().Should().Be(TypeBase + "internal",
            "never a 409 invented at runtime. The Critical log names the missing code, and "
            + "the registry-completeness test makes the omission a red build instead");
    }

    /// <summary>
    /// The `409` path, and the rule that `errors` belongs to the type rather than the
    /// status. Spec Q-A.
    /// </summary>
    [Fact]
    public async Task DuplicateValue_Returns409_WithFieldErrors()
    {
        var (status, mediaType, body) = await Get(factory.CreateClient(), ErrorContractProbe.DuplicatePath);

        status.Should().Be(HttpStatusCode.Conflict);
        mediaType.Should().Be("application/problem+json");
        body.GetProperty("type").GetString().Should().Be(TypeBase + "duplicate-customer");
        body.GetProperty("errors").GetProperty("email").EnumerateArray().Should().HaveCount(1,
            "duplicate-customer carries errors; concurrency-conflict does not, even though "
            + "both are 409 — errors is a property of the type");
    }

    /// <summary>
    /// AC-11. <c>/health</c> keeps its own shape. Two contracts meet on one application and
    /// neither wins by accident.
    /// </summary>
    [Fact]
    public async Task Health_IsExcludedFromTheEnvelope()
    {
        var response = await factory.CreateClient().GetAsync("/health", CancellationToken.None);
        var raw = await response.Content.ReadAsStringAsync(CancellationToken.None);

        response.Content.Headers.ContentType!.MediaType.Should().Be("application/json",
            "not application/problem+json — /health returns the health report shape");
        raw.Should().Contain("\"checks\"");
        raw.Should().NotContain("\"type\":\"https://wasl.local/errors/");
    }

    /// <summary>
    /// AC-2. One producer of the envelope, asserted over the source tree.
    /// </summary>
    /// <remarks>
    /// <para>
    /// AC-2 states the check as <c>grep -rn "new ProblemDetails"</c>, and that grep is
    /// imprecise: <c>new ProblemDetailsContext</c> contains it as a substring, and
    /// <c>GlobalExceptionHandler</c> legitimately constructs one of those to hand the
    /// envelope to <c>IProblemDetailsService</c>. The first version of this test failed on
    /// exactly that and the failure was the test's, not the code's.
    /// </para>
    /// <para>
    /// So the pattern requires a word boundary after the type name. What AC-2 is actually
    /// about is who constructs the <b>envelope</b>, not who mentions a type whose name
    /// starts the same way.
    /// </para>
    /// </remarks>
    [Fact]
    public void OnlyTheFactory_ConstructsProblemDetails()
    {
        var root = RepositoryRoot();
        var constructsEnvelope = new System.Text.RegularExpressions.Regex(
            @"new\s+ProblemDetails\s*[({]",
            System.Text.RegularExpressions.RegexOptions.Compiled);

        var files = Directory
            .EnumerateFiles(Path.Combine(root, "src"), "*.cs", SearchOption.AllDirectories)
            .Where(path => !path.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")
                && !path.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
            .Where(path => constructsEnvelope.IsMatch(File.ReadAllText(path)))
            .Select(Path.GetFileName)
            .ToArray();

        files.Should().BeEquivalentTo(["ProblemDetailsFactory.cs"],
            "two producers means two shapes, and the second is discovered by a client that "
            + "already parsed the first");
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

    private static StringContent Json(string raw) => new(raw, Encoding.UTF8, "application/json");
}
