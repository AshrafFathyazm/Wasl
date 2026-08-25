using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Wasl.Api.Health;

/// <summary>
/// Writes the response shape frozen in
/// <c>specs/001-solution-skeleton/contracts/health-api.md</c>.
/// </summary>
/// <remarks>
/// The default ASP.NET Core writer emits only the overall status word, which answers
/// "is it up?" and not "what is broken?" — and the second question is the one asked
/// during an incident.
/// </remarks>
internal static class HealthReportWriter
{
    // The contract says `description` is present only on a non-healthy check. A null
    // property is not the same as an absent one, so it is omitted rather than emitted
    // as null.
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static Task Write(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json";

        var payload = new
        {
            status = report.Status.ToString(),
            totalDurationMs = (int)report.TotalDuration.TotalMilliseconds,
            checks = report.Entries.Select(entry => new
            {
                name = entry.Key,
                status = entry.Value.Status.ToString(),
                durationMs = (int)entry.Value.Duration.TotalMilliseconds,

                // Present only when something is wrong, and never the exception message:
                // ProblemDetails.detail rules apply here too — no stack trace, no SQL,
                // no connection string.
                description = entry.Value.Status == HealthStatus.Healthy
                    ? null
                    : entry.Value.Description ?? "The check reported a failure.",
            }),
        };

        return context.Response.WriteAsync(JsonSerializer.Serialize(payload, Options));
    }
}
