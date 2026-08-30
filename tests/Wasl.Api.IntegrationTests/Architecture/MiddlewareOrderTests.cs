using FluentAssertions;

namespace Wasl.Api.IntegrationTests.Architecture;

/// <summary>
/// The middleware order ADR-007 §4 calls the single most likely defect in this build.
/// `004` AC-21.
/// </summary>
/// <remarks>
/// <para>
/// <b>A test over the SOURCE of <c>Program.cs</c>, and it is a weak test on purpose.</b>
/// ASP.NET Core exposes no ordered list of middleware at runtime — the pipeline is a closure built
/// by nested delegates, and nothing can be enumerated after <c>Build()</c>. So the choice is a
/// source scan or no test at all.
/// </para>
/// <para>
/// <b>Why it is worth having anyway.</b> The defect it catches is silent: with
/// <c>UseRequestLocalization</c> before <c>UseAuthentication</c>, the culture provider runs before
/// there is a user to read a preference from, so a signed-in Arabic user gets English and no
/// error appears anywhere — not in a log, not in a response, not in a failing test. A grep is a
/// poor tool that catches a defect no better tool can see.
/// </para>
/// <para>
/// It will not catch a reorder done by extracting the calls into a helper method. That is the
/// stated limit, and the comment block in <c>Program.cs</c> is the second line of defence.
/// </para>
/// </remarks>
public sealed class MiddlewareOrderTests
{
    private static readonly string Source = File.ReadAllText(ProgramPath());

    [Fact]
    public void Authentication_is_registered_before_authorization()
    {
        Position("app.UseAuthentication()")
            .Should().BeLessThan(Position("app.UseAuthorization()"),
                "authorization has nothing to authorize until authentication has run");
    }

    /// <summary>The one ADR-007 names.</summary>
    [Fact]
    public void Authentication_is_registered_before_request_localization()
    {
        Position("app.UseAuthentication()")
            .Should().BeLessThan(Position("app.UseRequestLocalization("),
                "the culture provider cannot read a user's PreferredLanguage before the user "
                + "exists, and the failure is silent: Arabic users get English and nothing "
                + "reports it (ADR-007 §4)");
    }

    /// <summary>
    /// AND localization before authorization. `005` AC-2, closed by `002b`.
    /// </summary>
    /// <remarks>
    /// <b>ADR-007 fixes only the half above; this half is `005`'s addition and it is what makes a
    /// `401` and a `403` translatable at all.</b> `004b`'s AuthDenialResultHandler produces those
    /// two bodies INSIDE UseAuthorization, so with localization registered after it the middleware
    /// never runs for a denial: no culture resolved, no Content-Language, and the title served in
    /// whatever the process default happens to be.
    /// <br/>
    /// <b>Both orderings fail silently</b>, which is the whole reason for a source guard. `005`
    /// control 1 measured it: seven tests red, header `null`, Arabic title back to English — and
    /// the build green throughout. ADR-007 does not forbid the old position, so nothing but this
    /// stops someone restoring it.
    /// </remarks>
    [Fact]
    public void Request_localization_is_registered_before_authorization()
    {
        Position("app.UseRequestLocalization(")
            .Should().BeLessThan(Position("app.UseAuthorization()"),
                "the 401 and the 403 are produced inside UseAuthorization, so localization has to "
                + "have run before it or those two responses can never be translated");
    }

    /// <summary>
    /// The exception handler stays first. `002`'s criterion, re-asserted because `004` inserted
    /// three calls directly beneath it.
    /// </summary>
    [Fact]
    public void The_exception_handler_stays_ahead_of_everything_it_must_catch()
    {
        var handler = Position("app.UseExceptionHandler()");

        handler.Should().BeLessThan(Position("app.UseAuthentication()"));
        handler.Should().BeLessThan(Position("app.MapControllers()"));
    }

    private static int Position(string call)
    {
        var index = Source.IndexOf(call, StringComparison.Ordinal);

        index.Should().BeGreaterThanOrEqualTo(0,
            $"Program.cs must contain {call} — if it was renamed or extracted into a helper, this "
            + "test needs updating rather than deleting, because the constraint still holds");

        return index;
    }

    /// <summary>
    /// Walks up from the test binary to the repository root.
    /// </summary>
    /// <remarks>
    /// A relative path from the output directory would break the moment the target framework or
    /// configuration changed. Looking for the solution file finds the root wherever the binary is.
    /// </remarks>
    private static string ProgramPath()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        // *.slnx as well as *.sln — this repository uses the newer XML solution format, and a
        // pattern of "*.sln" does not match "Wasl.slnx". Found by the test failing on its first
        // run with "the repository root must be findable", which is the message earning its keep.
        while (directory is not null
            && !directory.EnumerateFiles("*.sln").Any()
            && !directory.EnumerateFiles("*.slnx").Any())
        {
            directory = directory.Parent;
        }

        directory.Should().NotBeNull("the repository root must be findable from the test binary");

        return Path.Combine(directory!.FullName, "src", "Wasl.Api", "Program.cs");
    }
}
