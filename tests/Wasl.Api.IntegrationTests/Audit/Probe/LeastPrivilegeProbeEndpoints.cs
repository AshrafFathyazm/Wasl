using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Audit.Probe;

/// <summary>
/// Answers "who is this process connected as, right now, serving a request?" `003b` AC-2.
/// </summary>
/// <remarks>
/// <para>
/// <b>A probe endpoint rather than a test-owned connection, and the distinction is the feature.</b>
/// A test that opens its own connection with the restricted credentials proves what the test can
/// do. The failure this guards against is the *application* holding a principal more powerful than
/// intended — a connection string edited in `appsettings`, a fallback added "temporarily", a
/// deployment that reuses the migrator string. None of those change what a test connection proves,
/// and all of them change what this endpoint returns.
/// </para>
/// <para>
/// Test-only, mapped from the fixture, and never in <c>src/</c> — the same rule `002`'s error
/// probes and `004`'s auth probes follow. An endpoint that reports the server's own database
/// privileges is not something to ship.
/// </para>
/// <para>
/// It resolves the request-scoped <c>WaslDbContext</c>, so it reads the connection the pipeline
/// actually uses rather than one composed from configuration.
/// </para>
/// </remarks>
internal static class LeastPrivilegeProbeEndpoints
{
    public const string PrincipalPath = "/__probe/db/principal";

    public static void Map(IEndpointRouteBuilder routes) =>
        routes.MapGet(PrincipalPath, async (WaslDbContext context) =>
        {
            var connection = context.Database.GetDbConnection();

            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT
                    USER_NAME()                                              AS [user],
                    ISNULL(IS_SRVROLEMEMBER('sysadmin'), 0)                  AS isSysadmin,
                    ISNULL(IS_ROLEMEMBER('db_owner'), 0)                     AS isDbOwner,
                    ISNULL(HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','UPDATE'), 0) AS canUpdateAuditLog,
                    ISNULL(HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','DELETE'), 0) AS canDeleteAuditLog,
                    ISNULL(HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','INSERT'), 0) AS canInsertAuditLog
                """;

            await context.Database.OpenConnectionAsync();

            await using var reader = await command.ExecuteReaderAsync();
            await reader.ReadAsync();

            return Results.Ok(new
            {
                user = reader.GetString(0),
                isSysadmin = reader.GetInt32(1),
                isDbOwner = reader.GetInt32(2),
                canUpdateAuditLog = reader.GetInt32(3),
                canDeleteAuditLog = reader.GetInt32(4),
                canInsertAuditLog = reader.GetInt32(5),
            });
        });
}

/// <summary>Maps the probe into the real pipeline.</summary>
internal sealed class LeastPrivilegeProbeStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) =>
        app =>
        {
            next(app);
            app.UseEndpoints(LeastPrivilegeProbeEndpoints.Map);
        };
}
