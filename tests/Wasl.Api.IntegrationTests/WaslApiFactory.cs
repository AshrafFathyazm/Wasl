using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Wasl.Api.IntegrationTests.Errors;
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

        using var scope = Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();
        await context.Database.MigrateAsync();
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
        builder.UseSetting(
            $"ConnectionStrings:{DependencyInjection.ConnectionStringName}",
            _database.GetConnectionString());

        // The 002 error-contract probes. Test-only routes, mapped here and never in src/,
        // so the envelope can be asserted against the frozen contract before any product
        // endpoint exists — which matters for the one feature whose whole job IS that
        // contract. They also give MediatR a real consumer in this feature (research.md R-10).
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<IStartupFilter>(new ProbeRouteStartupFilter());

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
}
