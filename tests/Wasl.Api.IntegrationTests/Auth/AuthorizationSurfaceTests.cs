using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Infrastructure;

namespace Wasl.Api.IntegrationTests.Auth;

/// <summary>
/// Which endpoints are open, enumerated rather than read. `004` AC-10, AC-20.
/// </summary>
/// <remarks>
/// <para>
/// <b>A bare host, without the test project's probes.</b> The shared factory maps three probe
/// route groups, two of them <c>AllowAnonymous</c>, so enumerating its endpoints would report an
/// anonymous surface the product does not have. This host is <c>Program</c> and nothing else,
/// which is the only way "the anonymous set is exactly two" can mean anything.
/// </para>
/// <para>
/// <b>No database is touched.</b> The endpoint data source is built during host construction, so a
/// connection string pointing nowhere is enough — and it keeps this out of the container-bound
/// collection.
/// </para>
/// </remarks>
public sealed class AuthorizationSurfaceTests
{
    /// <summary>AC-10.</summary>
    /// <remarks>
    /// Asserted over <c>EndpointDataSource</c>, not by reading <c>Program.cs</c>. An endpoint added
    /// next month appears here automatically; a grep over source would have to be remembered.
    /// </remarks>
    [Fact]
    public void Every_endpoint_is_authorized_and_exactly_two_are_anonymous()
    {
        using var host = new BareHost();

        var endpoints = host.Services.GetRequiredService<EndpointDataSource>().Endpoints;

        endpoints.Should().NotBeEmpty();

        var anonymous = new List<string>();
        var unprotected = new List<string>();

        foreach (var endpoint in endpoints)
        {
            var name = Describe(endpoint);

            if (endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null)
            {
                anonymous.Add(name);
                continue;
            }

            if (endpoint.Metadata.GetMetadata<IAuthorizeData>() is null)
            {
                unprotected.Add(name);
            }
        }

        unprotected.Should().BeEmpty(
            "an endpoint with neither [Authorize] nor [AllowAnonymous] is a decision nobody made. "
            + "The fallback policy still refuses it at runtime, which is the safety net — but the "
            + "attribute is what makes the intent visible where the endpoint is written");

        anonymous.Should().BeEquivalentTo(
            ["ANY /health", "POST api/auth/token"],
            "signing in cannot require being signed in, and a health probe that answers 401 "
            + "reports a healthy application as unhealthy to a load balancer behaving correctly");
    }

    /// <summary>AC-20, the status half. The audit half is asserted in <c>AuthAuditTests</c>.</summary>
    [Fact]
    public async Task Health_answers_without_an_authorization_header()
    {
        using var host = new BareHost();

        // A real request through the real pipeline. The metadata assertion above proves the opt-out
        // exists; this proves the middleware honours it.
        var response = await host.CreateClient().GetAsync("/health");

        response.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized);
        response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }

    private static string Describe(Endpoint endpoint)
    {
        if (endpoint is not RouteEndpoint route)
        {
            return endpoint.DisplayName ?? "<unnamed>";
        }

        var methods = route.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? [];

        // "ANY" when there is no HttpMethodMetadata. MapHealthChecks constrains no verb, so the
        // methods list comes back empty and the description would start with a bare space.
        return $"{(methods.Count == 0 ? "ANY" : string.Join('|', methods))} {route.RoutePattern.RawText}";
    }

    private sealed class BareHost : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting(
                $"ConnectionStrings:{Wasl.Infrastructure.DependencyInjection.ConnectionStringName}",
                "Server=(localdb)\\nowhere;Database=Wasl;Trusted_Connection=True");

            builder.UseSetting("Jwt:SigningKey", WaslApiFactory.TestSigningKey);
            builder.UseSetting("Seed:ManagerPassword", WaslApiFactory.ManagerPassword);
            builder.UseSetting("Seed:AgentPassword", WaslApiFactory.AgentPassword);
            builder.UseSetting("Seed:AgentTwoPassword", WaslApiFactory.AgentTwoPassword);
        }
    }
}
