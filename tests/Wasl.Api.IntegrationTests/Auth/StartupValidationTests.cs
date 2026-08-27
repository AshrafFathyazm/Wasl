using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Wasl.Infrastructure;

namespace Wasl.Api.IntegrationTests.Auth;

/// <summary>
/// The application refuses to start when it is configured insecurely. `004` AC-11, AC-12.
/// </summary>
/// <remarks>
/// <para>
/// <b>No container and no collection fixture.</b> Every test here fails during host construction,
/// before any database is touched, so the connection string is a syntactically valid value pointing
/// nowhere. Joining the shared collection would make these the slowest tests in the suite for no
/// reason.
/// </para>
/// <para>
/// <b>These are the criteria that keep a default from existing.</b> A missing signing key without
/// this check means either a random key per restart — every token invalid after a deploy, with no
/// error anywhere — or a hard-coded fallback, which is a signing key in a public repository.
/// </para>
/// </remarks>
public sealed class StartupValidationTests
{
    private const string Unreachable =
        "Server=(localdb)\\nowhere;Database=Wasl;Trusted_Connection=True";

    [Fact]
    public void A_missing_signing_key_fails_the_host_and_names_the_configuration_key()
    {
        var thrown = Build(signingKey: null);

        thrown.Message.Should().Contain("Jwt:SigningKey");
        thrown.Message.Should().Contain("user-secrets");
    }

    /// <summary>
    /// AC-11's second half. A short key is padded by the library rather than refused, so without
    /// this the application runs on a weaker key than its configuration appears to claim.
    /// </summary>
    [Fact]
    public void A_signing_key_shorter_than_thirty_two_bytes_fails_the_host()
    {
        var thrown = Build(signingKey: "twenty-bytes-exactly");

        thrown.Message.Should().Contain("32 bytes");
    }

    /// <summary>
    /// AC-11, third half and the one that matters most: the message must not echo the value.
    /// </summary>
    /// <remarks>
    /// A startup exception reaches a console, a container log, and usually an aggregator. A message
    /// that includes the key puts the signing key in all three at once, which is worse than the
    /// misconfiguration it is reporting.
    /// </remarks>
    [Fact]
    public void The_startup_failure_never_echoes_the_value()
    {
        const string secret = "a-key-that-must-never-appear-in-any-log-abc";

        var thrown = Build(signingKey: secret, managerPassword: null);

        thrown.Message.Should().NotContain(secret);
        thrown.Message.Should().NotContain("Manager#2026");
    }

    [Theory]
    [InlineData("Seed:ManagerPassword")]
    [InlineData("Seed:AgentPassword")]
    public void A_missing_seed_password_fails_the_host(string expectedKeyInMessage)
    {
        var thrown = expectedKeyInMessage.EndsWith("ManagerPassword")
            ? Build(managerPassword: null)
            : Build(agentPassword: null);

        thrown.Message.Should().Contain(expectedKeyInMessage);
        thrown.Message.Should().Contain(
            "no default", "a default password is a committed credential");
    }

    /// <summary>
    /// Builds the host with one value withheld and returns what it threw.
    /// </summary>
    /// <remarks>
    /// <c>WebApplicationFactory</c> builds lazily, so <c>Services</c> is what forces it. An empty
    /// string rather than an absent setting for the withheld value: <c>UseSetting</c> has no
    /// removal, and the validators treat null, empty, and whitespace identically — which is itself
    /// the behaviour worth having, because a variable set to nothing is the common real mistake.
    /// </remarks>
    private static Exception Build(
        string? signingKey = WaslApiFactory.TestSigningKey,
        string? managerPassword = WaslApiFactory.ManagerPassword,
        string? agentPassword = WaslApiFactory.AgentPassword)
    {
        var factory = new MisconfiguredHost(signingKey, managerPassword, agentPassword);

        var thrown = Record.Exception(() => _ = factory.Services);

        thrown.Should().NotBeNull("the host must refuse to start rather than start insecurely");

        return thrown!;
    }

    private sealed class MisconfiguredHost(
        string? signingKey,
        string? managerPassword,
        string? agentPassword) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting(
                $"ConnectionStrings:{Wasl.Infrastructure.DependencyInjection.ConnectionStringName}", Unreachable);

            builder.UseSetting("Jwt:SigningKey", signingKey ?? string.Empty);
            builder.UseSetting("Seed:ManagerPassword", managerPassword ?? string.Empty);
            builder.UseSetting("Seed:AgentPassword", agentPassword ?? string.Empty);
        }
    }
}
