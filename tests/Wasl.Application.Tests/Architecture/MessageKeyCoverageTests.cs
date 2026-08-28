using System.Reflection;
using System.Text.RegularExpressions;
using FluentAssertions;
using Wasl.Application.Common.Messaging;

namespace Wasl.Application.Tests.Architecture;

/// <summary>
/// Every message key this codebase authors has a message behind it. `004b`.
/// </summary>
/// <remarks>
/// <para>
/// <b>The runtime guard is not enough, and this is the build-time half.</b>
/// <c>ResourceKeyLeakTests</c> asserts that no error response *it can reach* renders a key — which
/// is real evidence and is bounded by the paths the suite exercises. A key raised only on a rare
/// branch would still ship unresolved.
/// </para>
/// <para>
/// This scans the source instead: every string literal in <c>Wasl.Application</c> and
/// <c>Wasl.Domain</c> shaped like a message key must appear in the catalogue. It costs no
/// database and no container, and it fails on the commit that introduces the key rather than on
/// the request that renders it.
/// </para>
/// <para>
/// <b>Why this was written the day it was written.</b> `002` chose to resolve an unknown key by
/// returning the key — correct at runtime, because a missing translation must not turn a `400`
/// into a `500`. The cost is a well-formed response that says nothing, and it shipped three
/// times: `012` AC-3 caught one `409`, the frontend lane caught a `401` on the login screen, and
/// the guard written for that second one immediately found that **every** validation message in
/// the API was unresolved — seventeen keys, every form field on every screen.
/// </para>
/// </remarks>
public sealed class MessageKeyCoverageTests
{
    /// <summary><c>Validation.Ticket.SubjectRequired</c>, <c>Error.Auth.InvalidCredentials</c>.</summary>
    private static readonly Regex MessageKey =
        new(@"^(Validation|Error)\.[A-Za-z0-9]+(\.[A-Za-z0-9]+)+$", RegexOptions.Compiled);

    /// <summary>
    /// Read from the catalogue at runtime through reflection rather than duplicated here.
    /// </summary>
    /// <remarks>
    /// <c>StaticProblemMessageSource</c> lives in <c>Wasl.Api</c>, which this project does not
    /// reference — the dependency would point the wrong way. So the catalogue is read from the
    /// file, which is also what keeps this test honest: it checks what is written down, not what a
    /// second copy in the test project claims is written down.
    /// </remarks>
    private static IReadOnlySet<string> Catalogue()
    {
        var source = File.ReadAllText(Path.Combine(
            RepositoryRoot(), "src", "Wasl.Api", "Common", "Errors", "StaticProblemMessageSource.cs"));

        return Regex.Matches(source, @"\[""([^""]+)""\]\s*=")
            .Select(match => match.Groups[1].Value)
            .ToHashSet(StringComparer.Ordinal);
    }

    [Fact]
    public void Every_message_key_raised_in_code_has_a_message_in_the_catalogue()
    {
        var catalogue = Catalogue();
        var missing = new SortedSet<string>(StringComparer.Ordinal);

        foreach (var file in SourceFiles())
        {
            foreach (Match match in Regex.Matches(File.ReadAllText(file), @"""([^""\s]+)"""))
            {
                var literal = match.Groups[1].Value;

                if (MessageKey.IsMatch(literal) && !catalogue.Contains(literal))
                {
                    missing.Add(literal);
                }
            }
        }

        missing.Should().BeEmpty(
            "a key with no message is rendered VERBATIM to the user — the message source returns "
            + "the key rather than throwing, deliberately, so nothing fails and the response is "
            + "well-formed and useless. Add each to StaticProblemMessageSource");
    }

    /// <summary>
    /// The reverse direction is deliberately <b>not</b> asserted.
    /// </summary>
    /// <remarks>
    /// A catalogue entry with no raiser is harmless — `002` registered titles for statuses it did
    /// not yet raise, on purpose, so the contract was complete before the code was. Failing on an
    /// unused key would punish exactly that discipline.
    /// </remarks>
    [Fact]
    public void An_unused_catalogue_entry_is_allowed()
    {
        Catalogue().Should().NotBeEmpty();
    }

    private static IEnumerable<string> SourceFiles()
    {
        var root = RepositoryRoot();

        foreach (var project in new[] { "Wasl.Application", "Wasl.Domain" })
        {
            var directory = Path.Combine(root, "src", project);

            foreach (var file in Directory.EnumerateFiles(directory, "*.cs", SearchOption.AllDirectories))
            {
                if (!file.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")
                    && !file.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
                {
                    yield return file;
                }
            }
        }
    }

    /// <summary>
    /// Walks up to the solution file — <c>*.slnx</c> as well as <c>*.sln</c>.
    /// </summary>
    /// <remarks>
    /// `004`'s <c>MiddlewareOrderTests</c> matched only <c>*.sln</c> and failed on its first run,
    /// because this repository uses the newer XML solution format. Same helper, same fix.
    /// </remarks>
    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null
            && !directory.EnumerateFiles("*.sln").Any()
            && !directory.EnumerateFiles("*.slnx").Any())
        {
            directory = directory.Parent;
        }

        directory.Should().NotBeNull("the repository root must be findable from the test binary");

        return directory!.FullName;
    }

    /// <summary>A sanity check on the scanner itself, so a broken regex cannot pass silently.</summary>
    /// <remarks>
    /// `001` shipped an architecture test that was a false negative until someone broke it on
    /// purpose. A scanner that matches nothing reports success — this asserts it matches the
    /// things it is supposed to and rejects the things it is not.
    /// </remarks>
    [Theory]
    [InlineData("Validation.Ticket.SubjectRequired", true)]
    [InlineData("Error.Auth.InvalidCredentials", true)]
    [InlineData("Error.Ticket.Closed", true)]
    [InlineData("Enter a subject.", false)]
    [InlineData("Email or password is incorrect.", false)]
    [InlineData("Ticket.Assigned", false)]
    [InlineData("errors/validation", false)]
    public void The_scanner_recognises_a_key_and_not_a_sentence(string candidate, bool isKey)
    {
        MessageKey.IsMatch(candidate).Should().Be(isKey);
    }
}
