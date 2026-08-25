using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Application.Common.Abstractions;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Infrastructure;

/// <summary>
/// One entry point for everything this layer provides, so <c>Program.cs</c> names the
/// connection string and nothing else about the database. That is what keeps the EF Core
/// dependency on the far side of the Application layer rather than in the composition
/// root's business.
/// </summary>
public static class DependencyInjection
{
    public const string ConnectionStringName = "Wasl";

    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString(ConnectionStringName)
            ?? throw new InvalidOperationException(
                $"Connection string '{ConnectionStringName}' is not configured. "
                + "See specs/001-solution-skeleton/quickstart.md.");

        services.AddDbContext<WaslDbContext>(options => options.UseSqlServer(
            connectionString,
            sql => sql.MigrationsAssembly(typeof(WaslDbContext).Assembly.FullName)));

        // The Application layer resolves the interface; only this layer knows the type.
        services.AddScoped<IApplicationDbContext>(
            provider => provider.GetRequiredService<WaslDbContext>());

        return services;
    }
}
