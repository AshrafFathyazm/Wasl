using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace Wasl.Api.IntegrationTests;

/// <summary>
/// TEST-001-06. Asserts the shape frozen in
/// <c>specs/001-solution-skeleton/contracts/health-api.md</c>, not merely that the
/// endpoint answers.
/// </summary>
public sealed class HealthEndpointTests(WaslApiFactory factory) : IClassFixture<WaslApiFactory>
{
    [Fact]
    public async Task Health_WhenDatabaseIsReachable_Returns200AndTheContractShape()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/health", CancellationToken.None);

        response.StatusCode.Should().Be(HttpStatusCode.OK, "AC-4");
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/json");

        using var document = JsonDocument.Parse(
            await response.Content.ReadAsStringAsync(CancellationToken.None));
        var root = document.RootElement;

        root.GetProperty("status").GetString().Should().Be("Healthy");
        root.GetProperty("totalDurationMs").GetInt32().Should().BeGreaterThanOrEqualTo(0);

        var checks = root.GetProperty("checks").EnumerateArray().ToArray();

        checks.Select(check => check.GetProperty("name").GetString())
            .Should().BeEquivalentTo(["self", "database"],
                "the contract names both checks; a liveness-only endpoint answers the "
                + "least useful question during an incident");

        foreach (var check in checks)
        {
            check.GetProperty("status").GetString().Should().Be("Healthy");
            check.TryGetProperty("description", out _).Should().BeFalse(
                "the contract says description is present only on a non-healthy check, "
                + "and a null property is not the same as an absent one");
        }
    }

    [Fact]
    public async Task Health_RequiresNoAuthentication()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/health", CancellationToken.None);

        response.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized, "AC-4");
        response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }
}
