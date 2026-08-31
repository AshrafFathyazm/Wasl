using System.Xml.Linq;
using FluentAssertions;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Api.IntegrationTests.Localization;

/// <summary>
/// `015` AC-10's other half: the accepted-value lists in the catalogue must name **every** member
/// of the enum they describe, in both languages.
/// </summary>
/// <remarks>
/// <para>
/// <b>This test is the reason a hard-coded list in a <c>.resx</c> is acceptable at all.</b> AC-10
/// asks the <c>400</c> to list what the parameter accepts. The validation path resolves a message
/// key with no arguments — <c>ProblemDetailsFactory</c> calls <c>Resolve(context, key)</c>, and
/// only a <c>DomainException</c> can carry <c>MessageArguments</c> — so threading the live enum
/// names into the sentence would mean changing `002`'s error plumbing to add a filter. The values
/// are static per parameter, so the catalogue holds them and this asserts they stay true.
/// </para>
/// <para>
/// <b>Without it, this is `009`'s defect waiting to happen.</b> `009` transcribed enum members
/// from a contract example by hand and shipped two invented ones and two wrong values, in an enum
/// that compiled. A member added to <c>TicketStatus</c> tomorrow would leave the message naming
/// five of six accepted values — and every existing test would stay green, because they all assert
/// the message is *present* or that the six they know about are named.
/// </para>
/// <para>
/// <b>The member names are asserted in the ARABIC message too, unlocalized.</b> BR-8 never
/// translates an enum value: a client branching on <c>Status</c> reads the same six strings in
/// every language, and a translated list would be unusable in a URL.
/// </para>
/// </remarks>
public sealed class TicketFilterMessageTests
{
    private const string EnglishFile = "SharedResource.resx";
    private const string ArabicFile = "SharedResource.ar.resx";

    private static Dictionary<string, string> Read(string fileName)
    {
        var path = Path.Combine(CatalogueParityTests.CatalogueDirectoryPath, fileName);

        File.Exists(path).Should().BeTrue($"{fileName} must exist at {path}");

        return XDocument.Load(path).Root!
            .Elements("data")
            .ToDictionary(
                data => data.Attribute("name")!.Value,
                data => data.Element("value")?.Value ?? string.Empty,
                StringComparer.Ordinal);
    }

    private static void AssertNamesEveryMember<TEnum>(string key)
        where TEnum : struct, Enum
    {
        var names = Enum.GetNames<TEnum>();

        names.Should().NotBeEmpty("an enum with no members would make this test vacuous");

        foreach (var (file, catalogue) in new[]
                 {
                     (EnglishFile, Read(EnglishFile)),
                     (ArabicFile, Read(ArabicFile)),
                 })
        {
            catalogue.Should().ContainKey(key,
                $"{file} must carry {key} — `CLAUDE.md`: add the message in the same commit as the key");

            var message = catalogue[key];

            foreach (var name in names)
            {
                message.Should().Contain(name,
                    $"{file}'s {key} must name every accepted value, and {typeof(TEnum).Name}.{name} "
                    + "is missing. A message that lists five of six sends a client guessing about "
                    + "the sixth, and no other test in the suite can see the omission");
            }
        }
    }

    [Fact]
    public void The_status_filter_message_names_every_status() =>
        AssertNamesEveryMember<TicketStatus>("Validation.TicketFilter.StatusInvalid");

    [Fact]
    public void The_priority_filter_message_names_every_priority() =>
        AssertNamesEveryMember<TicketPriority>("Validation.TicketFilter.PriorityInvalid");

    [Fact]
    public void The_category_filter_message_names_every_category() =>
        AssertNamesEveryMember<TicketCategory>("Validation.TicketFilter.CategoryInvalid");

    [Fact]
    public void The_channel_filter_message_names_every_channel() =>
        AssertNamesEveryMember<CommunicationChannel>("Validation.TicketFilter.ChannelInvalid");

    /// <summary>
    /// The assignee message has no enum behind it, so it is asserted against the two literals the
    /// contract accepts.
    /// </summary>
    [Fact]
    public void The_assignee_filter_message_names_both_accepted_tokens()
    {
        foreach (var (file, catalogue) in new[]
                 {
                     (EnglishFile, Read(EnglishFile)),
                     (ArabicFile, Read(ArabicFile)),
                 })
        {
            var key = "Validation.TicketFilter.AssigneeInvalid";

            catalogue.Should().ContainKey(key, $"{file} must carry {key}");

            catalogue[key].Should().Contain("me").And.Contain("unassigned",
                $"{file}'s {key} must name both accepted forms — a client told only that the "
                + "value was wrong has nowhere to go");
        }
    }
}
