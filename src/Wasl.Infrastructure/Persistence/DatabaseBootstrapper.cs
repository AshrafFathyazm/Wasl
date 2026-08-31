using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Microsoft.Extensions.Configuration;

namespace Wasl.Infrastructure.Persistence;

/// <summary>
/// Applies migrations and provisions the restricted principal. `003b`.
/// </summary>
/// <remarks>
/// <para>
/// <b>The only place a <c>WaslDbContext</c> is built on the migrator connection</b>, and it builds
/// one by hand rather than resolving it. The container holds exactly one <c>WaslDbContext</c>
/// registration and it is the restricted runtime one — so this cannot be reached from a request,
/// because nothing in a request can construct it and nothing registers it.
/// </para>
/// <para>
/// Called by <c>--provision</c>, by <c>--seed</c>, and by the integration fixture. Nowhere else.
/// </para>
/// <para>
/// <b>Order matters and is not obvious.</b> Migrations run first, because the grants name tables
/// and a sequence that must already exist; provisioning runs second and is idempotent, so a
/// database migrated before this feature existed picks up its permissions on the next run.
/// </para>
/// </remarks>
public static class DatabaseBootstrapper
{
    /// <summary>Migrates the schema, then creates and permissions <c>wasl_app</c>.</summary>
    public static async Task RunAsync(
        IConfiguration configuration,
        CancellationToken cancellationToken = default)
    {
        var connectionString = MigratorConnectionString(configuration);

        // A WaslDbContext, constructed by hand with inert stubs for its two request-scoped
        // dependencies.
        //
        // `003b` first tried a separate MigrationDbContext, on the argument that a context able to
        // run DDL *and* stamp audit actors is a category error. **The suite disproved it in one
        // run:** EF resolves migrations by the `[DbContext(typeof(...))]` attribute the scaffolder
        // writes, so a different context type finds ZERO migrations, creates only
        // __EFMigrationsHistory, and reports success. Every request then failed with
        // `Invalid object name 'SupportUsers'` — no permissions error, because there were no
        // tables to be refused.
        //
        // The stubs are safe for the same reason the argument was wrong: those two dependencies
        // are read by SaveChanges stamping, and a migration calls no SaveChanges. Nothing here
        // can write an audit row, because nothing here writes a row.
        var options = new DbContextOptionsBuilder<WaslDbContext>()
            .UseSqlServer(
                connectionString,
                sql => sql.MigrationsAssembly(typeof(WaslDbContext).Assembly.FullName))
            .Options;

        await using (var context = new WaslDbContext(options, MigrationClock.Instance, NoActor.Instance))
        {
            await context.Database.MigrateAsync(cancellationToken);
        }

        await LeastPrivilegeProvisioner.ProvisionAsync(
            connectionString,
            LeastPrivilegeProvisioner.ReadPassword(configuration),
            cancellationToken);

        // Found 2026-08-31: everything above can succeed while the application still cannot log
        // in, because CREATE LOGIN is skipped for a login that already exists on this SERVER and
        // the password is only written at creation. Verified rather than repaired — see
        // VerifyRuntimeLoginAsync for why, and specs/003b-audit-least-privilege for the
        // measurement. This is the last thing --provision does, so a success message means the
        // principal it just configured actually works.
        await LeastPrivilegeProvisioner.VerifyRuntimeLoginAsync(
            RuntimeConnectionString(configuration),
            cancellationToken);
    }

    /// <summary>
    /// Reads the RUNTIME connection string, for the post-provision verification only.
    /// </summary>
    /// <remarks>
    /// <c>AddInfrastructure</c> has already refused to start if this is missing, a placeholder, or
    /// identical to the migrator's — so by the time <c>--provision</c> runs it is present and
    /// distinct. It is read again here rather than passed in because the verification belongs to
    /// provisioning, not to the caller: a <c>--provision</c> that reports success without checking
    /// is the defect this exists to close.
    /// </remarks>
    private static string RuntimeConnectionString(IConfiguration configuration) =>
        configuration.GetConnectionString(DependencyInjection.ConnectionStringName)
            ?? throw new InvalidOperationException(
                $"Connection string '{DependencyInjection.ConnectionStringName}' is not "
                + "configured, so provisioning cannot verify that the principal it created works. "
                + "See specs/001-solution-skeleton/quickstart.md.");

    /// <summary>
    /// Reads the migrator connection string, refusing rather than falling back.
    /// </summary>
    /// <remarks>
    /// <b>No fallback to the runtime string, deliberately</b> (`003b` Q-A's condition). Falling
    /// back would mean a machine with no migrator configured silently attempts DDL as the
    /// restricted principal — which fails with a permissions error that reads like a broken
    /// migration, or worse, succeeds because somebody widened the runtime principal to make the
    /// error go away.
    /// </remarks>
    public static string MigratorConnectionString(IConfiguration configuration) =>
        configuration.GetConnectionString(DependencyInjection.MigratorConnectionStringName)
            ?? throw new InvalidOperationException(
                $"Connection string '{DependencyInjection.MigratorConnectionStringName}' is not "
                + "configured. It carries the DDL rights that --provision, --seed and the "
                + "integration fixture need, and the runtime connection deliberately does not "
                + "carry them. There is no fallback: see specs/003b-audit-least-privilege.");
}

/// <summary>
/// The clock a migration does not use. `003b`.
/// </summary>
/// <remarks>
/// <c>WaslDbContext</c> reads <c>IRequestTimestamp</c> only when stamping entities inside
/// <c>SaveChangesAsync</c>, and a migration calls none. Throwing rather than returning a value
/// makes that a fact rather than a hope: if a code path ever does stamp something on this
/// context, it fails loudly here instead of writing an invented instant into a real column.
/// </remarks>
internal sealed class MigrationClock : IRequestTimestamp
{
    public static readonly MigrationClock Instance = new();

    public DateTimeOffset UtcNow => throw new InvalidOperationException(
        "A migration asked for the request timestamp. Migrations do not call SaveChanges, so "
        + "this path should not exist — see DatabaseBootstrapper.");
}

/// <summary>The actor a migration does not have. `003b`.</summary>
/// <remarks>
/// Nulls rather than a fabricated identity, and the reason is ADR-005: this project rejected a
/// seeded "system" user by name, and `004` closed its audit gap by building a real identity
/// rather than inventing one. A migration genuinely has no actor, and says so.
/// </remarks>
internal sealed class NoActor : ICurrentUser
{
    public static readonly NoActor Instance = new();

    public Guid? UserId => null;

    public string? Email => null;

    public string? Role => null;
}
