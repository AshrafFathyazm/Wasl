using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
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
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["ConnectionStrings:Wasl"] = _database.GetConnectionString(),
                }));
    }
}
