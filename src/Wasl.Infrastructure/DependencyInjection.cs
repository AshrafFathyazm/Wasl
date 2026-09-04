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
    /// <summary>The RUNTIME connection. `wasl_app`, restricted. `003b`.</summary>
    public const string ConnectionStringName = "Wasl";

    /// <summary>
    /// The DDL connection, and <b>the only place in the codebase that names it</b>. `003b` Q-A.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>It is read at the call site — by <c>--provision</c>, <c>--seed</c> and the integration
    /// fixture — and is never registered in the container.</b> Nothing can inject what nothing
    /// registers: there is no keyed service for it, no <c>IMigratorConnection</c>, and no
    /// <c>GetService</c> that returns it. A <c>DbContext</c> resolvable from a request scope with
    /// DDL rights is a <c>DbContext</c> that can drop the audit table.
    /// </para>
    /// <para>
    /// <b>And there is no fallback.</b> A missing or refused runtime connection is a failure, never
    /// a silent promotion to this one — retrying a denied permission with a privileged principal
    /// turns a permissions defect into privilege escalation, and it would read as resilience.
    /// </para>
    /// <para>
    /// The product owner attached this as a condition to the two-string ruling, in these terms:
    /// <i>a second connection string that exists inside the application is a second connection
    /// string somebody will use.</i> `003b` AC-14 fails the build if <c>AddInfrastructure</c> is
    /// handed this one.
    /// </para>
    /// </remarks>
    public const string MigratorConnectionStringName = "WaslMigrator";

    /// <summary>What ships in `appsettings.Development.json` where a password would go.</summary>
    /// <remarks>
    /// A committed file cannot hold the credential, and an EMPTY password would connect as an
    /// integrated-auth user on some machines and fail confusingly on others. An obviously invalid
    /// sentinel fails the same way everywhere, and this class turns it into a sentence.
    /// </remarks>
    public const string PlaceholderPassword = "REPLACED_BY_USER_SECRET";

    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString(ConnectionStringName)
            ?? throw new InvalidOperationException(
                $"Connection string '{ConnectionStringName}' is not configured. "
                + "See specs/001-solution-skeleton/quickstart.md.");

        // `003b`. The development file ships a placeholder rather than a password, because a real
        // one there would be a credential in source control. Detected explicitly so a fresh clone
        // gets a sentence naming what to set, instead of SQL Server's "Login failed for user
        // 'wasl_app'" — which reads as a broken database rather than an unfinished setup.
        if (connectionString.Contains(PlaceholderPassword, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Connection string '{ConnectionStringName}' still contains the placeholder "
                + $"'{PlaceholderPassword}'. Set the real one, which is never committed: "
                + "dotnet user-secrets -p src/Wasl.Api set \"Database:AppPassword\" \"<a password>\" "
                + $"then set \"ConnectionStrings:{ConnectionStringName}\" with the same password "
                + "and User Id=wasl_app, then run: "
                + "dotnet run --project src/Wasl.Api -- --provision. "
                + "See specs/003b-audit-least-privilege and quickstart.md.");
        }

        // `003b` AC-14. The runtime container must never be handed the DDL connection, and this is
        // the cheapest place to make that structural rather than remembered: swap the two strings
        // in configuration and the host refuses to start, instead of serving every request as a
        // principal that can drop the audit table.
        //
        // Compared by VALUE, not by key name. Reading the wrong key is one way to arrive here; the
        // other is somebody pasting the migrator's value under the runtime's name, and only a
        // value comparison catches both.
        var migratorConnectionString = configuration.GetConnectionString(MigratorConnectionStringName);

        if (migratorConnectionString is { Length: > 0 }
            && string.Equals(connectionString, migratorConnectionString, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Connection string '{ConnectionStringName}' is identical to "
                + $"'{MigratorConnectionStringName}'. The runtime connection must use the "
                + $"restricted '{Persistence.LeastPrivilegeProvisioner.AppUser}' principal; the "
                + "migrator connection carries DDL rights and belongs only to --provision, "
                + "--seed and the integration fixture. See specs/003b-audit-least-privilege.");
        }

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

        // `036` §3.5. Scoped, and it takes the context FACTORY rather than the request's context
        // — see IdempotencyStore for why: a reservation must outlive the rollback of the command
        // it guards, which a context enrolled in that command's transaction cannot do.
        services.AddScoped<IIdempotencyStore, Persistence.Idempotency.IdempotencyStore>();

        // Singleton: it holds one cached dummy hash and no per-request state (`004`).
        services.AddSingleton<IPasswordHasher, IdentityPasswordHasher>();

        // `005` placement cleanup: signing a JWT is an implementation of an Application
        // abstraction, so JwtAccessTokenIssuer lives here and is registered here. Wasl.Api keeps
        // the half that is genuinely an HTTP concern — the bearer handler that VALIDATES the
        // token — and it binds the shared JwtOptions that both sides read.
        //
        // Scoped rather than singleton, unchanged from where it came from: it takes TimeProvider
        // and is used once per sign-in.
        services.AddScoped<IAccessTokenIssuer, Auth.JwtAccessTokenIssuer>();
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
