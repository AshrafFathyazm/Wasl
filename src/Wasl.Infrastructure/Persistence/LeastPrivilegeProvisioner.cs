using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace Wasl.Infrastructure.Persistence;

/// <summary>
/// Creates the restricted runtime principal and its permissions. `003b`, BR-9.5.
/// </summary>
/// <remarks>
/// <para>
/// <b>Run on the MIGRATOR connection, and only ever by <c>--provision</c>, <c>--seed</c>, or the
/// integration fixture.</b> It is not registered in the container and nothing in a request can
/// reach it — see <c>DependencyInjection.MigratorConnectionStringName</c> for why that is
/// structural rather than tidy.
/// </para>
/// <para>
/// <b>Not an EF migration, and the reason is the password.</b> A migration file is committed, and
/// <c>migrationBuilder.Sql()</c> takes a static string — so putting <c>CREATE LOGIN … WITH
/// PASSWORD</c> in one would either commit a credential or invent a placeholder that every
/// deployment forgets to change. `004` established that a secret has no default and the host
/// refuses to start without it; the same rule cannot be honoured by a file in source control.
/// The trade is recorded as a deviation: <c>dotnet ef database update</c> alone no longer
/// produces a working application, and <c>--provision</c> is the second step.
/// </para>
/// <para>
/// <b>Idempotent throughout.</b> It runs on every <c>--seed</c> and on every integration run, and
/// a second run must be a no-op rather than an error — otherwise the first thing anyone does is
/// stop running it.
/// </para>
/// </remarks>
public static class LeastPrivilegeProvisioner
{
    /// <summary>The restricted principal the application connects as at runtime.</summary>
    public const string AppUser = "wasl_app";

    /// <summary>Where the password comes from. No default, by rule.</summary>
    public const string PasswordKey = "Database:AppPassword";

    /// <summary>
    /// Creates the login, the user, the grants and the denies. Safe to run repeatedly.
    /// </summary>
    /// <param name="migratorConnectionString">
    /// A connection with DDL and <c>securityadmin</c> rights. Never the runtime one — the runtime
    /// principal is what this method creates, and it cannot create itself.
    /// </param>
    /// <param name="password">The <c>wasl_app</c> password. Must not be empty.</param>
    public static async Task ProvisionAsync(
        string migratorConnectionString,
        string password,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(migratorConnectionString);
        ArgumentException.ThrowIfNullOrWhiteSpace(password);

        var database = new SqlConnectionStringBuilder(migratorConnectionString).InitialCatalog;

        if (string.IsNullOrWhiteSpace(database))
        {
            throw new InvalidOperationException(
                "The migrator connection string must name a database. Provisioning grants "
                + "permissions on specific objects and cannot guess which catalogue they are in.");
        }

        await using var connection = new SqlConnection(migratorConnectionString);
        await connection.OpenAsync(cancellationToken);

        // The password is passed as a PARAMETER into sp_executesql rather than concatenated into
        // the CREATE LOGIN text. EF1002 is an analyser rule in this repository for the same
        // reason, and a password is the worst possible thing to interpolate: a quote in it would
        // turn a credential into a syntax error at best and an injection at worst.
        await ExecuteAsync(connection, """
            IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @user)
            BEGIN
                DECLARE @sql nvarchar(max) =
                    N'CREATE LOGIN ' + QUOTENAME(@user) + N' WITH PASSWORD = ' + QUOTENAME(@password, '''')
                    + N', CHECK_POLICY = OFF';
                EXEC sp_executesql @sql;
            END
            """, cancellationToken, ("@user", AppUser), ("@password", password));

        await ExecuteAsync(connection, """
            IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @user)
            BEGIN
                DECLARE @sql nvarchar(max) = N'CREATE USER ' + QUOTENAME(@user) + N' FOR LOGIN ' + QUOTENAME(@user);
                EXEC sp_executesql @sql;
            END
            """, cancellationToken, ("@user", AppUser));

        // db_datareader + db_datawriter rather than a hand-written GRANT per table. A per-table
        // list is a list somebody forgets to extend, and the next feature's table is then a 500
        // that looks like a bug in the feature. The audit log's DENY below is what makes the
        // broad grant safe — and A-2/AC-3 assert that DENY beats the role, because the entire
        // design rests on it.
        await ExecuteAsync(connection, """
            DECLARE @sql nvarchar(max) =
                N'ALTER ROLE db_datareader ADD MEMBER ' + QUOTENAME(@user) + N';'
              + N'ALTER ROLE db_datawriter ADD MEMBER ' + QUOTENAME(@user) + N';';
            EXEC sp_executesql @sql;
            """, cancellationToken, ("@user", AppUser));

        // The sequence. `009` allocates ticket numbers from dbo.TicketNumberSeq, and a sequence
        // is not a table — neither db_datareader nor db_datawriter covers it, so without this
        // every POST /api/tickets fails on a principal that can read and write everything else.
        // Exactly the shape Q-B predicted, which is why AC-6 runs the whole suite rather than a
        // probe on the audit table.
        await ExecuteAsync(connection, """
            IF EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'TicketNumberSeq')
            BEGIN
                DECLARE @sql nvarchar(max) = N'GRANT UPDATE ON OBJECT::dbo.TicketNumberSeq TO ' + QUOTENAME(@user);
                EXEC sp_executesql @sql;
            END
            """, cancellationToken, ("@user", AppUser));

        // ── BR-9.5. The point of the whole feature ────────────────────────────────
        //
        // DENY, not "no GRANT". The user is in db_datawriter, so it HAS update and delete by
        // role; only an explicit DENY overrides that, and DENY beats GRANT everywhere in SQL
        // Server except at column level.
        //
        // SELECT and INSERT are granted explicitly as well. They are already implied by the two
        // roles, and naming them here is what makes the intent readable at the one place a
        // reviewer looks: this table may be appended to and read, and nothing else.
        await ExecuteAsync(connection, """
            IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AuditLog' AND SCHEMA_NAME(schema_id) = 'dbo')
            BEGIN
                DECLARE @sql nvarchar(max) =
                    N'GRANT SELECT, INSERT ON OBJECT::dbo.AuditLog TO ' + QUOTENAME(@user) + N';'
                  + N'DENY UPDATE, DELETE ON OBJECT::dbo.AuditLog TO ' + QUOTENAME(@user) + N';';
                EXEC sp_executesql @sql;
            END
            """, cancellationToken, ("@user", AppUser));
    }

    /// <summary>
    /// Removes everything <see cref="ProvisionAsync"/> creates. `003b` AC-10.
    /// </summary>
    /// <remarks>
    /// `003` recorded that its <c>Down</c> "drops the table and revokes nothing" — correct when
    /// there was nothing to revoke, and not correct now. A dropped database leaves the server
    /// login behind, so both halves are undone here.
    /// </remarks>
    public static async Task DeprovisionAsync(
        string migratorConnectionString,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqlConnection(migratorConnectionString);
        await connection.OpenAsync(cancellationToken);

        await ExecuteAsync(connection, """
            IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @user)
            BEGIN
                DECLARE @sql nvarchar(max) = N'DROP USER ' + QUOTENAME(@user);
                EXEC sp_executesql @sql;
            END
            """, cancellationToken, ("@user", AppUser));

        await ExecuteAsync(connection, """
            IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @user)
            BEGIN
                DECLARE @sql nvarchar(max) = N'DROP LOGIN ' + QUOTENAME(@user);
                EXEC sp_executesql @sql;
            END
            """, cancellationToken, ("@user", AppUser));
    }

    /// <summary>Reads the password, and refuses rather than inventing one. AC-4.</summary>
    /// <remarks>
    /// The rule `004` AC-11 established for <c>Jwt:SigningKey</c>: no default, the host refuses to
    /// start, and the message names the key and never echoes the value. A default password here
    /// would be a credential in source control that every deployment inherits.
    /// </remarks>
    public static string ReadPassword(IConfiguration configuration) =>
        configuration[PasswordKey] is { Length: > 0 } password && !string.IsNullOrWhiteSpace(password)
            ? password
            : throw new InvalidOperationException(
                $"'{PasswordKey}' is not configured. It is the password for the restricted "
                + $"'{AppUser}' principal the application runs as, and it has no default by "
                + "design. Set it with: dotnet user-secrets -p src/Wasl.Api set "
                + $"\"{PasswordKey}\" \"<a password>\"");

    private static async Task ExecuteAsync(
        SqlConnection connection,
        string sql,
        CancellationToken cancellationToken,
        params (string Name, string Value)[] parameters)
    {
        await using var command = new SqlCommand(sql, connection);

        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value);
        }

        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
