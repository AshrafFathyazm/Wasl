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
        // `013`. Registered by hand because MediatR scans Wasl.Application only, so a handler in
        // this project is invisible to it. The same situation `003` met with its two behaviours,
        // and the same answer: register the one type rather than scanning a second assembly and
        // pulling every internal class in this project into the container.
        services.AddScoped<
            MediatR.IRequestHandler<
                Wasl.Application.Features.Tickets.GetTimeline.GetTicketTimelineQuery,
                Wasl.Application.Features.Tickets.GetTimeline.TimelinePage>,
            Queries.TicketTimelineQuery>();

        // `004b`. SINGLETON — the counts must outlive a request, which is the whole point.
        // In-memory and per-process: two instances behind a load balancer each count to ten, and a
        // restart forgets everything. Stated in the type's own remarks rather than implied, because
        // the honest claim is that it slows a script, not that it stops a determined attacker.
        services.AddSingleton<ISignInThrottle, Auth.InMemorySignInThrottle>();

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
            .AddInterceptors(provider.GetRequiredService<AuditDiffInterceptor>())

            // ── The seam the integration suite hangs a query counter on ──────────────
            //
            // Anything registered in DI as IInterceptor is added here too. Production registers
            // NOTHING as IInterceptor — AuditDiffInterceptor is registered as its concrete type
            // above, so this resolves to an empty sequence at run time and costs one enumeration
            // at startup.
            //
            // It exists because `008` AC-11 — and `013` AC-14, `010`'s same-query projection, and
            // `020`'s per-widget aggregate — assert that a query does not issue one round trip per
            // row, and **nothing in this codebase could assert that**. Every such criterion was
            // met by reading the LINQ, which is not verification. A DbCommandInterceptor counting
            // commands is the only way to measure it, and it has to be attached where the context
            // is configured.
            //
            // The alternative was for the test host to call AddDbContext a second time, which
            // duplicates the connection string, the migrations assembly and the audit
            // interceptor — three things that would then have to be kept in step with this method
            // by whoever edits it, without being reminded.
            //
            // Same category as `Program` being public for WebApplicationFactory: a named,
            // commented seam rather than a hidden one.
            .AddInterceptors(provider.GetServices<Microsoft.EntityFrameworkCore.Diagnostics.IInterceptor>()));

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
