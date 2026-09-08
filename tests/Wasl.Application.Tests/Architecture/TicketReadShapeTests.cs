using System.Text.RegularExpressions;
using FluentAssertions;

namespace Wasl.Application.Tests.Architecture;

/// <summary>
/// One assembler for the ticket detail read shape, enforced. `016`.
/// </summary>
/// <remarks>
/// <para>
/// <b>This guard exists because the same defect arrived three times through three different
/// doors, and each time the reasoning was correct.</b>
/// <c>CreateTicketCommandHandler.Map</c> is the one mapping every ticket response goes through,
/// which is right — the contract says a `GET` on the `Location` returns the same resource, so two
/// mappings would be two shapes to keep in step. But it grew five optional parameters, one per
/// feature, and every one of them was optional for an honest reason: a create has no assignee
/// (BR-2.7), no tags, and no escalation.
/// </para>
/// <para>
/// The consequence, measured on 2026-09-08 across <c>Map</c>'s five call sites:
/// </para>
/// <code>
/// endpoint                            assignee   tags     escalatedBy  canEscalate
/// POST   /api/tickets                 n/a        n/a      n/a          MISSING
/// GET    /api/tickets/{id}            ok         ok       ok           ok
/// PUT    /api/tickets/{id}/assignee   ok         MISSING  MISSING      MISSING
/// PUT    /api/tickets/{id}/status     MISSING    MISSING  MISSING      MISSING
/// POST   /api/tickets/{id}/escalate   ok         MISSING  ok           ok
/// </code>
/// <para>
/// Eleven missing fields. Three of them were live contract violations — `011` left
/// <c>assignee</c> off the status response, `012` left it off its own, `034` left <c>tags</c> off
/// three — and both frozen contracts say the body "is <c>TicketDetailResponse</c>".
/// </para>
/// <para>
/// <b>What made them invisible is a rule that is itself correct:</b> `026` §5 forbids a screen
/// rendering a ticket from a write response, so the client refetches, the wrong body is never
/// displayed, and every test asserting the transition or the assignment passes. A default of
/// <c>null</c> on an optional parameter is indistinguishable from a deliberate <c>null</c> at the
/// call site, and the compiler has nothing to say about it.
/// </para>
/// <para>
/// So the fix is structural rather than a habit: <c>TicketDetailReader.ReadAsync</c> assembles all
/// five arguments from the ticket and the token and cannot omit one, and this test fails the build
/// if a second direct caller of <c>Map</c> appears. <b>Adding a field to the read shape is now a
/// one-file change</b>, which is the property the five call sites did not have.
/// </para>
/// </remarks>
public class TicketReadShapeTests
{
    /// <summary>
    /// The create is the one permitted direct caller, and it is named rather than counted.
    /// </summary>
    /// <remarks>
    /// A count would pass if someone deleted the create's call and added their own. The exemption
    /// is a path so the failure message can say which file broke the rule.
    /// </remarks>
    private const string PermittedCaller =
        "Features/Tickets/CreateTicket/CreateTicketCommandHandler.cs";

    /// <summary>The assembler. The only other file allowed to name <c>Map</c>.</summary>
    private const string Assembler = "Features/Tickets/TicketDetailReader.cs";

    /// <summary>
    /// <c>CreateTicketCommandHandler.Map(</c>, however it is qualified or wrapped.
    /// </summary>
    /// <remarks>
    /// Matches the bare <c>Map(</c> too, but only when preceded by the class name or by
    /// <c>CreateTicketCommandHandler.</c> — an unqualified <c>Map(</c> from inside the create's own
    /// file is the permitted caller anyway, and matching every method called <c>Map</c> anywhere
    /// would make this test about something else.
    /// </remarks>
    private static readonly Regex MapCall = new(
        @"CreateTicketCommandHandler\s*\.\s*Map\s*\(", RegexOptions.Compiled);

    [Fact]
    public void Only_the_create_and_the_reader_build_the_ticket_read_shape_directly()
    {
        var offenders = new SortedSet<string>(StringComparer.Ordinal);

        foreach (var file in ApplicationSourceFiles())
        {
            var relative = Relative(file);

            if (relative == PermittedCaller || relative == Assembler)
            {
                continue;
            }

            if (MapCall.IsMatch(File.ReadAllText(file)))
            {
                offenders.Add(relative);
            }
        }

        offenders.Should().BeEmpty(
            "every endpoint that returns a ticket must go through TicketDetailReader.ReadAsync, "
            + "which cannot omit one of Map's five optional arguments. Calling Map directly is "
            + "how `011`, `012` and `034` each shipped a response missing a field its own frozen "
            + "contract promised — eleven fields across five call sites, and no build error. "
            + $"Offending files: {string.Join(", ", offenders)}");
    }

    /// <summary>
    /// The reader supplies all five, so a field added to the shape reaches every endpoint.
    /// </summary>
    /// <remarks>
    /// The test above stops a SECOND assembler appearing; this one stops the SINGLE assembler
    /// being incomplete. Without it, someone could add a sixth optional parameter to <c>Map</c>,
    /// leave the reader not passing it, and satisfy the guard while reintroducing the whole
    /// defect — one call site instead of five, which is better and is not fixed.
    /// </remarks>
    [Fact]
    public void The_reader_supplies_every_optional_argument_of_the_mapping()
    {
        var mapper = File.ReadAllText(
            Path.Combine(ApplicationRoot(), PermittedCaller.Replace('/', Path.DirectorySeparatorChar)));

        var reader = File.ReadAllText(
            Path.Combine(ApplicationRoot(), Assembler.Replace('/', Path.DirectorySeparatorChar)));

        // The parameter list of `internal static CreateTicketResult Map(` up to its `) =>`.
        var signature = Regex.Match(
            mapper,
            @"internal static CreateTicketResult Map\((?<parameters>.*?)\)\s*=>",
            RegexOptions.Singleline);

        signature.Success.Should().BeTrue(
            "the mapping's signature must be findable in "
            + $"{PermittedCaller} — a regex that matches nothing would report success here, "
            + "which is the failure mode `037`'s measuring tool had");

        // Optional parameters only: `name = default`. The three required ones (ticket, customer)
        // cannot be forgotten, because omitting one does not compile.
        var optional = Regex.Matches(
                StripComments(signature.Groups["parameters"].Value),
                @"(?<name>\w+)\s*=\s*[^,)]+")
            .Select(match => match.Groups["name"].Value)
            .ToList();

        optional.Should().HaveCountGreaterThan(
            2,
            "the mapping is supposed to have several optional parameters — `assignee` (011), "
            + "`tags` (034), `escalatedBy` and `callerIsManager` (016). Finding none or one means "
            + "the parameter regex stopped matching, not that the problem went away");

        var readerCall = Regex.Match(
            reader,
            @"CreateTicketCommandHandler\s*\.\s*Map\((?<arguments>.*?)\);",
            RegexOptions.Singleline);

        readerCall.Success.Should().BeTrue(
            $"{Assembler} must call the mapping — it is the assembler, and a reader that does not "
            + "reach the mapping is not assembling anything");

        var arguments = StripComments(readerCall.Groups["arguments"].Value);

        // Each optional parameter has to be *reachable* in the reader's call — either named
        // explicitly or supplied positionally from a local whose name matches. The reader is
        // written so both hold, which is what makes this assertion cheap to satisfy honestly.
        foreach (var parameter in optional)
        {
            arguments.Should().MatchRegex(
                $@"\b{Regex.Escape(parameter)}\b|\b{Regex.Escape(Local(parameter))}\b",
                $"TicketDetailReader must supply `{parameter}`. It is the only assembler, so a "
                + "value it does not pass is a field NO endpoint returns — the same defect as "
                + "before, with one call site instead of five");
        }
    }

    /// <summary>
    /// The local the reader holds a given argument in, where the two names differ.
    /// </summary>
    /// <remarks>
    /// Only one does: <c>callerIsManager</c> is supplied as <c>currentUser.IsManager()</c>, because
    /// the answer is derived rather than held. Mapped explicitly rather than matched loosely — a
    /// substring rule would let <c>tags</c> be satisfied by the word "tags" in a comment, and the
    /// comments here are long.
    /// </remarks>
    private static string Local(string parameter) => parameter switch
    {
        "callerIsManager" => "IsManager",
        _ => parameter,
    };

    /// <summary>
    /// Comments out, so prose cannot satisfy or break either assertion.
    /// </summary>
    /// <remarks>
    /// `027` had both halves of this happen: an absence guard went red on the word it was
    /// searching for appearing in <c>useTranslation</c>, and a sidebar guard went red on the
    /// comment explaining the declaration it forbade. Both files here carry long comments that
    /// name every parameter, so without this the second test passes on the prose alone.
    /// </remarks>
    private static string StripComments(string source) =>
        Regex.Replace(
            Regex.Replace(source, @"/\*.*?\*/", " ", RegexOptions.Singleline),
            @"//[^\r\n]*",
            " ");

    /// <summary>Proof the stripper ran, so the two tests above are not reading prose.</summary>
    [Fact]
    public void The_comment_stripper_removes_both_comment_forms()
    {
        StripComments("a /* tags */ b").Should().NotContain("tags");
        StripComments("a // tags\r\nb").Should().NotContain("tags");
        StripComments("a /* x */ b").Should().Contain("b", "code outside the comment survives");
    }

    private static IEnumerable<string> ApplicationSourceFiles() =>
        Directory.EnumerateFiles(ApplicationRoot(), "*.cs", SearchOption.AllDirectories)
            .Where(file =>
                !file.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")
                && !file.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"));

    private static string Relative(string file) =>
        Path.GetRelativePath(ApplicationRoot(), file).Replace(Path.DirectorySeparatorChar, '/');

    private static string ApplicationRoot()
    {
        var root = Path.Combine(RepositoryRoot(), "src", "Wasl.Application");

        Directory.Exists(root).Should().BeTrue(
            $"the Application project must be at {root} — a path that resolves to nothing would "
            + "make both tests above pass over an empty file set, which is the opposite of what "
            + "they are for");

        return root;
    }

    /// <summary>
    /// Walks up to the solution file — <c>*.slnx</c> as well as <c>*.sln</c>.
    /// </summary>
    /// <remarks>
    /// Same helper, same reason, as <c>MessageKeyCoverageTests</c>: `004`'s
    /// <c>MiddlewareOrderTests</c> matched only <c>*.sln</c> and failed on its first run, because
    /// this repository uses the newer XML solution format.
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
}
