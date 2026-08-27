using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Application.Common.Abstractions;
using Wasl.Infrastructure.Persistence;
using Wasl.Infrastructure.Auth;
using Wasl.Infrastructure.Persistence.Audit;

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

        // The clock, registered by the layer that reads it. Injected once so nothing anywhere
        // calls DateTime.UtcNow inline and a test can substitute a fake without touching the code
        // under test. It was in Program.cs, which meant the presentation layer supplied a
        // dependency only the persistence layer used.
        services.AddSingleton(TimeProvider.System);

        // Scoped, so it spans the request. The interceptor fills it across however many
        // SaveChanges calls the handler makes, and AuditBehaviour reads it once at the end.
        services.AddScoped<AuditDiffAccumulator>();
        services.AddScoped<AuditDiffInterceptor>();

        services.AddDbContext<WaslDbContext>((provider, options) => options
            .UseSqlServer(
                connectionString,
                sql => sql.MigrationsAssembly(typeof(WaslDbContext).Assembly.FullName))
            // Resolved from the provider rather than constructed here, because the
            // interceptor holds the scoped accumulator. A `new AuditDiffInterceptor(...)`
            // would need its own accumulator and would capture into a list nobody reads —
            // producing an empty diff on every command, which is research.md R-1's silent
            // failure arriving by a different route.
            .AddInterceptors(provider.GetRequiredService<AuditDiffInterceptor>()));

        // The second connection BR-9.4's failure path writes on (research.md R-2). A factory,
        // not another AddDbContext: the point is a context whose lifetime and connection are
        // independent of the request's, so it can commit while the request's rolls back.
        services.AddDbContextFactory<WaslDbContext>((provider, options) => options
            .UseSqlServer(
                connectionString,
                sql => sql.MigrationsAssembly(typeof(WaslDbContext).Assembly.FullName)),
            lifetime: ServiceLifetime.Scoped);

        // The Application layer resolves the interface; only this layer knows the type.
        services.AddScoped<IApplicationDbContext>(
            provider => provider.GetRequiredService<WaslDbContext>());

        services.AddScoped<IAuditWriter, AuditWriter>();

        // Singleton: it holds one cached dummy hash and no per-request state (`004`).
        services.AddSingleton<IPasswordHasher, IdentityPasswordHasher>();
        services.AddScoped<ITicketNumberGenerator, SequenceTicketNumberGenerator>();

        // Scoped, which is what makes one request one instant. See IRequestTimestamp.
        services.AddScoped<IRequestTimestamp, RequestTimestamp>();

        // ── The behaviours are NOT registered here, and that is the point ────────────────
        //
        // MediatR orders behaviours by registration order, and Program.cs calls
        // AddInfrastructure BEFORE AddApplication. Registering TransactionBehaviour and
        // AuditBehaviour here would put them ahead of `002`'s ValidationBehaviour, giving
        // Transaction → Audit → Validation — so a 400 would open a transaction and write an
        // audit row for every mistyped form, breaking spec.md Q-3 and AC-15 with nothing
        // thrown and a green suite.
        //
        // That inversion was OBSERVED, not deduced (research.md R-15). All three are
        // registered once, in declared order, by Wasl.Api's AddWaslPipeline().

        // This layer owns the DbContext, so this layer declares the check on it. In Program.cs it
        // made the presentation layer name WaslDbContext — the one Infrastructure type that had
        // leaked upward.
        services.AddHealthChecks().AddDbContextCheck<WaslDbContext>("database");

        return services;
    }
}
