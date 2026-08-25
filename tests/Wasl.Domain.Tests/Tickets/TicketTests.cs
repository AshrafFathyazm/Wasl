using System.Globalization;
using System.Reflection;
using FluentAssertions;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Domain.Tests.Tickets;

/// <summary>AC-3, BR-8.13. The number's shape, and the culture trap.</summary>
public sealed class TicketNumberTests
{
    [Theory]
    [InlineData(2026, 1, "TCK-2026-000001")]
    [InlineData(2026, 42, "TCK-2026-000042")]
    [InlineData(2026, 999999, "TCK-2026-999999")]
    [InlineData(2027, 1000000, "TCK-2027-1000000")]
    public void The_format_pads_to_six_digits_and_widens_rather_than_wrapping(
        int year, long sequence, string expected)
    {
        TicketNumber.Format(year, sequence).Should().Be(expected,
            "past 999999 a seventh digit is ugly and correct. Wrapping would hand out a number "
            + "the unique index already holds, years later, with no clue why");
    }

    /// <summary>
    /// BR-8.13. The one test that would have caught a real localisation defect.
    /// </summary>
    /// <remarks>
    /// Under <c>ar-SA</c> a default-formatted integer can render in Arabic-Indic digits and a
    /// year can render in a non-Gregorian calendar. The number is quoted on the phone and pasted
    /// between systems, so two renderings of one identifier is worse than an ugly one.
    /// </remarks>
    [Theory]
    [InlineData("ar-SA")]
    [InlineData("ar-EG")]
    [InlineData("de-DE")]
    public void The_format_is_identical_under_every_culture(string culture)
    {
        var previous = CultureInfo.CurrentCulture;

        try
        {
            CultureInfo.CurrentCulture = new CultureInfo(culture);

            TicketNumber.Format(2026, 42).Should().Be("TCK-2026-000042",
                "Latin digits and a Gregorian year in every locale (BR-8.13)");
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void A_sequence_below_one_is_rejected(long sequence)
    {
        var act = () => TicketNumber.Format(2026, sequence);

        act.Should().Throw<ArgumentOutOfRangeException>(
            "the sequence starts at 1. A zero means the caller never drew a value, and "
            + "TCK-2026-000000 would look like a real ticket");
    }
}

/// <summary>The entity's invariants and the shape AC-2 requires.</summary>
public sealed class TicketTests
{
    private static readonly DateTime Created = new(2026, 8, 25, 9, 30, 0, DateTimeKind.Utc);

    private static Ticket Valid(string subject = "Cannot sign in", string description = "No reset email") =>
        Ticket.Create(
            customerId: Guid.NewGuid(),
            ticketNumber: "TCK-2026-000042",
            subject: subject,
            description: description,
            category: TicketCategory.Technical,
            priority: TicketPriority.High,
            channel: CommunicationChannel.WhatsApp);

    /// <summary>AC-2, BR-1.1.</summary>
    [Fact]
    public void A_new_ticket_starts_new_and_unassigned()
    {
        var ticket = Valid();

        ticket.Status.Should().Be(TicketStatus.New);
        ticket.AssignedToUserId.Should().BeNull(
            "BR-2.7 keeps triage and ownership separate — creating a ticket never assigns it");
        ticket.IsEscalated.Should().BeFalse();
        ticket.ClosedAtUtc.Should().BeNull();
    }

    /// <summary>AC-10, computed rather than stored.</summary>
    [Fact]
    public void A_new_ticket_allows_open_and_closed()
    {
        Valid().AllowedTransitions.Should().Equal([TicketStatus.Open, TicketStatus.Closed]);
    }

    /// <summary>
    /// The factory stamps nothing, and that is the design rather than an oversight.
    /// </summary>
    /// <remarks>
    /// <c>WaslDbContext.SaveChangesAsync</c> sets all four before saving. Asserting the
    /// <b>absence</b> here is what stops someone "fixing" the factory by adding
    /// <c>CreatedAtUtc = DateTime.UtcNow</c> — which would compile, look like a repair, and give
    /// the row two writers whose values differ by microseconds.
    /// </remarks>
    [Fact]
    public void The_factory_stamps_no_timestamp_and_no_actor()
    {
        var ticket = Valid();

        ticket.CreatedAtUtc.Should().Be(default);
        ticket.UpdatedAtUtc.Should().Be(default);
        ticket.CreatedByUserId.Should().BeNull();
        ticket.UpdatedByUserId.Should().BeNull(
            "the stamps a handler is responsible for are the stamps one handler will forget. "
            + "SaveChangesAsync applies them — see IAuditableEntity");
    }

    /// <summary>
    /// The contract that makes the stamping possible at all.
    /// </summary>
    [Fact]
    public void A_ticket_is_an_auditable_entity()
    {
        Valid().Should().BeAssignableTo<Wasl.Domain.Common.IAuditableEntity>(
            "the DbContext stamps by this interface. A ticket that stopped implementing it would "
            + "silently stop being stamped, and nothing else would fail");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void A_blank_subject_is_rejected(string subject)
    {
        var act = () => Valid(subject: subject);

        act.Should().Throw<ArgumentException>("AC-7 — whitespace is not a subject");
    }

    [Theory]
    [InlineData("")]
    [InlineData("  \t ")]
    public void A_blank_description_is_rejected(string description)
    {
        var act = () => Valid(description: description);

        act.Should().Throw<ArgumentException>("AC-7");
    }

    [Fact]
    public void Subject_and_description_are_trimmed()
    {
        var ticket = Valid(subject: "  padded  ", description: "  also padded  ");

        ticket.Subject.Should().Be("padded");
        ticket.Description.Should().Be("also padded",
            "trimmed once, here, rather than in the validator and the handler and the endpoint");
    }

    [Fact]
    public void A_ticket_must_belong_to_a_customer()
    {
        var act = () => Ticket.Create(
            Guid.Empty, "TCK-2026-000001", "s", "d",
            TicketCategory.General, TicketPriority.Normal, CommunicationChannel.Email);

        act.Should().Throw<ArgumentException>("spec.md A-1 — exactly one customer, always");
    }

    [Fact]
    public void Arabic_text_survives_construction_unchanged()
    {
        const string arabic = "لا يمكنني تسجيل الدخول";

        Valid(subject: arabic).Subject.Should().Be(arabic,
            "the column is nvarchar; this asserts nothing in the domain mangles it first");
    }

    [Fact]
    public void No_property_can_be_set_from_outside_the_entity()
    {
        typeof(Ticket)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(property => property.SetMethod is { IsPublic: true })
            .Select(property => property.Name)
            .Should().BeEmpty(
                "011, 012 and 016 each add a method rather than a setter, so the entity keeps "
                + "deciding what may happen to it");
    }

    [Fact]
    public void There_is_no_public_constructor()
    {
        typeof(Ticket).GetConstructors(BindingFlags.Public | BindingFlags.Instance)
            .Should().BeEmpty("Ticket.Create is the only way in");
    }

    /// <summary>The history row AC-9 requires.</summary>
    [Fact]
    public void The_created_history_row_records_the_starting_status_and_no_previous_one()
    {
        var ticketId = Guid.NewGuid();

        var entry = TicketHistoryEntry.Created(ticketId, Created);

        entry.TicketId.Should().Be(ticketId);
        entry.EventType.Should().Be(TicketHistoryEventType.Created);
        entry.NewValue.Should().Be("New");
        entry.OldValue.Should().BeNull(
            "a create has no previous state, and writing \"None\" would invent one");
        entry.PerformedByUserId.Should().BeNull("no identity until 004");
        entry.PerformedAtUtc.Should().Be(Created);
    }
}
