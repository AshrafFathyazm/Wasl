using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Wasl.Api.IntegrationTests.Errors;
using Wasl.Infrastructure.Persistence.Seed;
using Wasl.Infrastructure;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests;

/// <summary>
/// Boots the real API against a real SQL Server in a container, and applies the real
/// migrations before the first test runs.
/// </summary>
/// <remarks>
/// <para>
/// A container per run rather than the developer's local instance, for two reasons:
/// CI needs a container regardless — so tying the suite to a local instance would create
/// two paths and the one that breaks would be the one on the server — and a fresh
/// database per run stops a test coming to depend on the order tests ran in.
/// </para>
/// <para>
/// <b>EF <c>InMemory</c> is never used here.</b> It enforces no unique constraints, no
/// check constraints, and no concurrency tokens, which are precisely the things this
/// suite exists to verify.
/// </para>
/// </remarks>
public sealed class WaslApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly MsSqlContainer _database = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest")
        .Build();

    public async Task InitializeAsync()
    {
        try
        {
            await _database.StartAsync();
        }
        catch (Exception exception)
        {
            // Fail fast and name Docker. Without this the suite hangs until a test
            // timeout, and "the tests are slow" is a much worse diagnosis to be handed
            // than "Docker is not running".
            throw new InvalidOperationException(
                "Could not start the SQL Server test container. Docker must be running for "
                + "the integration suite — see specs/001-solution-skeleton/quickstart.md. "
                + "If Docker is unavailable, run the unit suite only and record the "
                + "integration suite as NOT RUN in tests.md, with the reason. Never as a pass.",
                exception);
        }

        // `003b`. Migrate and provision on the MIGRATOR connection, before anything resolves a
        // WaslDbContext — which is now the restricted principal and cannot create tables, and
        // cannot even connect until the login below exists.
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [$"ConnectionStrings:{Wasl.Infrastructure.DependencyInjection.MigratorConnectionStringName}"] =
                    _database.GetConnectionString(),
                [Wasl.Infrastructure.Persistence.LeastPrivilegeProvisioner.PasswordKey] = AppPassword,
            })
            .Build();

        await Wasl.Infrastructure.Persistence.DatabaseBootstrapper.RunAsync(configuration);

        // The real seeder, not a fixture. `004` AC-13 and AC-23 are about THESE two rows, and a
        // test-only insert would prove a test-only insert works.
        await SupportUserSeeder.SeedAsync(Services);

        ManagerToken = await SignInAsync(SupportUserSeeder.ManagerEmail, ManagerPassword);
        AgentToken = await SignInAsync(SupportUserSeeder.AgentEmail, AgentPassword);
        AgentTwoToken = await SignInAsync(SupportUserSeeder.AgentTwoEmail, AgentTwoPassword);
    }

    public new async Task DisposeAsync()
    {
        await _database.DisposeAsync();
        await ((IAsyncDisposable)this).DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // "Testing", not "Development", and this is not cosmetic.
        //
        // With Development, appsettings.Development.json loads — and it points at the
        // developer's local named instance (Server=.\SQLEXPRESS). That file won the
        // ordering against the in-memory source below, so the suite talked to the local
        // instance instead of the container. It passed on a Windows machine where that
        // instance exists and failed on the CI runner with
        // "Error Locating Server/Instance Specified", which is the class of defect AC-9
        // exists to catch: green locally, red on the server.
        //
        // There is no appsettings.Testing.json, and appsettings.json carries no connection
        // string, so the container's is the only one in play.
        builder.UseEnvironment("Testing");

        // UseSetting, not ConfigureAppConfiguration, and this is the second half of the
        // same lesson.
        //
        // ConfigureAppConfiguration's callback runs too late: Program.cs has already read
        // configuration and called AddInfrastructure, which throws if the connection string
        // is absent. Under "Development" that went unnoticed, because
        // appsettings.Development.json happened to supply one — the local named instance,
        // which is exactly the wrong value and the reason CI failed.
        //
        // UseSetting writes into the host configuration that WebApplicationBuilder is
        // seeded from, so the value is present before Program.cs asks for it.
        // `003b`. TWO strings, and they are different principals.
        //
        // The runtime one is the restricted `wasl_app`, so every request the suite issues runs
        // as the principal production runs as — which is what makes AC-6 mean anything. The
        // migrator one is the container's `sa`, used by InitializeAsync to migrate and provision
        // and by nothing else.
        //
        // Reusing `sa` for BOTH is what the whole feature exists to prevent, and it is also what
        // every earlier run of this suite did: `DENY` is not applied to a sysadmin, so the tests
        // would have passed against a permission that does nothing.
        builder.UseSetting(
            $"ConnectionStrings:{Wasl.Infrastructure.DependencyInjection.ConnectionStringName}",
            RestrictedConnectionString());

        builder.UseSetting(
            $"ConnectionStrings:{Wasl.Infrastructure.DependencyInjection.MigratorConnectionStringName}",
            _database.GetConnectionString());

        builder.UseSetting(
            Wasl.Infrastructure.Persistence.LeastPrivilegeProvisioner.PasswordKey,
            AppPassword);

        // `004` configuration, on the same mechanism and for the same reason: JwtOptions.From and
        // SeedOptions.From run during AddPresentation, so a value supplied any later than this is
        // supplied after the host has already refused to build.
        //
        // A test-only key, and a real one — 40 bytes, so the 32-byte minimum is satisfied by a
        // value rather than by a check being skipped.
        builder.UseSetting("Jwt:SigningKey", TestSigningKey);
        builder.UseSetting("Seed:ManagerPassword", ManagerPassword);
        builder.UseSetting("Seed:AgentPassword", AgentPassword);
        builder.UseSetting("Seed:AgentTwoPassword", AgentTwoPassword);

        // The 002 error-contract probes. Test-only routes, mapped here and never in src/,
        // so the envelope can be asserted against the frozen contract before any product
        // endpoint exists — which matters for the one feature whose whole job IS that
        // contract. They also give MediatR a real consumer in this feature (research.md R-10).
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<IStartupFilter>(new ProbeRouteStartupFilter());

            // 003's audit probes, on the same mechanism. Two filters rather than one combined
            // map, so a feature's probes are removable with the feature.
            services.AddSingleton<IStartupFilter>(new Audit.Probe.AuditProbeStartupFilter());

            // `003b`. Reports the DATABASE principal the pipeline holds while serving a request.
            services.AddSingleton<IStartupFilter>(new Audit.Probe.LeastPrivilegeProbeStartupFilter());

            // `004`'s probes. Authenticated, unlike the other two.
            services.AddSingleton<IStartupFilter>(new Auth.AuthProbeStartupFilter());

            // `008`. Registered as IInterceptor, which is the seam AddInfrastructure enumerates —
            // production registers nothing under that interface, so this is the only thing it
            // finds. Singleton, because the counter spans requests and the probe reads a delta.
            services.AddSingleton<QueryCountingInterceptor>();
            services.AddSingleton<Microsoft.EntityFrameworkCore.Diagnostics.IInterceptor>(
                provider => provider.GetRequiredService<QueryCountingInterceptor>());

            // The probe's handler and validator live in THIS assembly, and
            // AddApplication only scans Wasl.Application — so without these the probe
            // request finds no handler and the pipeline throws, which surfaces as a 500
            // and looks exactly like the error contract being broken. Registering the
            // test assembly puts the probe inside the real pipeline rather than beside it.
            services.AddMediatR(configuration =>
                configuration.RegisterServicesFromAssembly(typeof(ProbeCommand).Assembly));

            services.AddValidatorsFromAssembly(
                typeof(ProbeCommandValidator).Assembly, includeInternalTypes: true);
        });
    }
    // ── `004` credentials and tokens ─────────────────────────────────────────────────────
    //
    // Test-only values, and they are HERE rather than in each test class so there is exactly one
    // place a password lives — the alternative is the same literal in twelve files and a rename
    // that misses three of them.

    /// <summary>40 bytes, so the 32-byte HS256 minimum is met by a value, not by a skipped check.</summary>
    public const string TestSigningKey = "integration-tests-only-signing-key-40b!!";

    /// <summary>
    /// The `wasl_app` password for this run. `003b` Q-C.
    /// </summary>
    /// <remarks>
    /// Generated per run rather than committed, so no credential exists anywhere — not in the
    /// repository, not in CI configuration, not in a secret store. The container is created and
    /// destroyed by this fixture, so nothing outside the process ever needs to know it.
    /// </remarks>
    public static readonly string AppPassword =
        "Wasl#" + Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(12));

    /// <summary>
    /// The DDL connection, for tests that assert about the SCHEMA rather than about behaviour.
    /// </summary>
    /// <remarks>
    /// <b>`003b` Q-B, and this is what it predicted.</b> Four tests read <c>sys.indexes</c> or
    /// create a throwaway table, and all four went red the moment requests started running as
    /// <c>wasl_app</c> — the restricted principal has no <c>VIEW DEFINITION</c> and no DDL, which
    /// is correct, because the application never inspects its own schema.
    /// <br/>
    /// <b>The fix is not to widen the principal.</b> Granting metadata rights so a test can pass
    /// would give production a permission only the suite wanted, which is the shape of every
    /// least-privilege system that ends up privileged. Schema assertions are a DBA activity and
    /// use the DBA connection; everything that exercises the APPLICATION keeps the restricted one,
    /// which is what makes AC-6 mean anything.
    /// </remarks>
    public string MigratorConnectionString => _database.GetConnectionString();

    /// <summary>The container's connection string, re-pointed at the restricted principal.</summary>
    private string RestrictedConnectionString() =>
        new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(_database.GetConnectionString())
        {
            UserID = Wasl.Infrastructure.Persistence.LeastPrivilegeProvisioner.AppUser,
            Password = AppPassword,
        }.ConnectionString;

    public const string ManagerPassword = "Manager#2026";

    public const string AgentPassword = "Agent#2026";

    /// <summary>The second Agent, seeded by `011` so BR-2.3's "someone else" is a colleague.</summary>
    public const string AgentTwoPassword = "Agent2#2026";

    /// <summary>The seeded Manager's bearer token, obtained through the real endpoint.</summary>
    /// <remarks>
    /// <b>Issued by signing in, not by constructing a JWT in the test project.</b> A hand-built
    /// token would be signed by the test and validated by the application, so every ticket test
    /// would pass while <c>POST /api/auth/token</c> was broken — and the endpoint that every
    /// other endpoint depends on would be the one thing nothing exercised.
    /// </remarks>
    public string ManagerToken { get; private set; } = string.Empty;

    public string AgentToken { get; private set; } = string.Empty;

    /// <summary>The second Agent's token. `011` AC-4 needs a ticket owned by a colleague.</summary>
    public string AgentTwoToken { get; private set; } = string.Empty;

    /// <summary>A client carrying the seeded Manager's token.</summary>
    public HttpClient CreateManagerClient() => CreateClientWith(ManagerToken);

    /// <summary>A client carrying the seeded Agent's token.</summary>
    public HttpClient CreateAgentClient() => CreateClientWith(AgentToken);

    /// <summary>A client carrying the second seeded Agent's token.</summary>
    public HttpClient CreateAgentTwoClient() => CreateClientWith(AgentTwoToken);

    /// <summary>
    /// A Manager's client that pins every request to English. `005`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Why this exists.</b> `004` seeds the Manager with <c>PreferredLanguage = "ar"</c> and
    /// mints it into the token, and `005` registered the provider that reads it. From that
    /// commit on, every server-authored sentence on a Manager's request is Arabic — which is
    /// BR-8.4 working exactly as specified, and which broke a dozen tests that had been
    /// asserting English sentences without ever saying they wanted English.
    /// </para>
    /// <para>
    /// <b>Pinned with <c>?culture=</c> rather than with a header</b>, because the header would
    /// lose: BR-8.4 ranks the claim above <c>Accept-Language</c> and the query string above
    /// both. BR-8.5 says the query parameter exists for testing and for sharing a link in a
    /// known language — this is the first use, and it is the intended one.
    /// </para>
    /// <para>
    /// <b>Applied by a handler rather than at each call site</b>, so a test that asserts an
    /// English sentence cannot forget it — and so that "this test is about the English
    /// catalogue" is stated once, in the client it asks for, rather than repeated in fifteen
    /// URLs where one could quietly go missing.
    /// </para>
    /// </remarks>
    public HttpClient CreateEnglishManagerClient()
    {
        var client = CreateDefaultClient(new PinCultureHandler("en"));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ManagerToken);

        return client;
    }

    /// <summary>Appends <c>?culture=</c> to every request. See CreateEnglishManagerClient.</summary>
    private sealed class PinCultureHandler(string culture) : DelegatingHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var uri = request.RequestUri!;
            var separator = string.IsNullOrEmpty(uri.Query) ? '?' : '&';

            request.RequestUri = new Uri(
                $"{uri.GetLeftPart(UriPartial.Path)}{uri.Query}{separator}culture={culture}",
                uri.IsAbsoluteUri ? UriKind.Absolute : UriKind.Relative);

            return base.SendAsync(request, cancellationToken);
        }
    }

    /// <summary>
    /// Opens a query-count measurement window. `008` AC-11, and general.
    /// </summary>
    /// <remarks>
    /// <c>using var probe = factory.CountQueries();</c> then do the thing, then read
    /// <c>probe.Count</c>. It throws rather than returning zero if the interceptor is not
    /// attached, because zero satisfies every "no more than N" assertion.
    /// </remarks>
    public QueryCountProbe CountQueries() =>
        new(Services.GetRequiredService<QueryCountingInterceptor>());

    private HttpClient CreateClientWith(string token)
    {
        var client = CreateClient();

        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        return client;
    }

    private async Task<string> SignInAsync(string email, string password)
    {
        var response = await CreateClient()
            .PostAsJsonAsync("/api/auth/token", new { email, password });

        if (!response.IsSuccessStatusCode)
        {
            // Named loudly. Every authenticated test depends on this call, so a failure here
            // otherwise surfaces as twenty-six unrelated 401s.
            throw new InvalidOperationException(
                $"Sign-in failed for {email} during test-host initialisation: "
                + $"{(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        }

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        return body.GetProperty("accessToken").GetString()!;
    }
}
