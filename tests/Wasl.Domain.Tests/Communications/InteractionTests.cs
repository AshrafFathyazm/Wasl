using FluentAssertions;
using Wasl.Domain.Communications;

namespace Wasl.Domain.Tests.Communications;

/// <summary>
/// <c>Interaction.Send</c> — the outcome pairing and the snapshot rules. `021`.
/// </summary>
/// <remarks>
/// <para>
/// No database and no provider. The entity records an outcome it is <i>told</i>: the provider call
/// has already returned by the time <c>Send</c> runs, which is what keeps
/// <c>ICommunicationProvider</c> out of <c>Wasl.Domain</c>.
/// </para>
/// <para>
/// <b>The outcome pairing is enforced in three places and this tests the middle one.</b>
/// <c>SendOutcome</c>'s factories catch a PROVIDER returning an inconsistent pair,
/// <c>Interaction.Send</c> catches a HANDLER passing one, and
/// <c>CK_Interactions_Outcome</c> catches anything reaching the table by another route. Three
/// layers, one rule, per constitution III — and each catches a mistake the others cannot see.
/// </para>
/// </remarks>
public sealed class InteractionTests
{
    private static readonly DateTime Now = new(2026, 9, 8, 12, 0, 0, DateTimeKind.Utc);

    private static readonly Guid Ticket = Guid.CreateVersion7();

    private static readonly Guid Sender = Guid.CreateVersion7();

    private static Interaction Accepted(string body = "Your invoice has been corrected.") =>
        Interaction.Send(
            ticketId: Ticket,
            channel: CommunicationChannel.Email,
            recipientAddress: "ali@example.com",
            body: body,
            providerName: "Mock",
            providerMessageId: "mock-1",
            deliveryStatus: DeliveryStatus.Accepted,
            failureCode: null,
            sentByUserId: Sender,
            createdAtUtc: Now);

    // ── The happy path, and what it sets ────────────────────────────────────────

    [Fact]
    public void An_accepted_send_records_every_field()
    {
        var interaction = Accepted();

        interaction.TicketId.Should().Be(Ticket);
        interaction.Channel.Should().Be(CommunicationChannel.Email);
        interaction.RecipientAddress.Should().Be("ali@example.com");
        interaction.ProviderName.Should().Be("Mock");
        interaction.ProviderMessageId.Should().Be("mock-1");
        interaction.DeliveryStatus.Should().Be(DeliveryStatus.Accepted);
        interaction.FailureCode.Should().BeNull();
        interaction.SentByUserId.Should().Be(Sender);
        interaction.CreatedAtUtc.Should().Be(Now);
    }

    /// <summary>
    /// <c>Direction</c> is set here and nowhere else, and it is always outbound.
    /// </summary>
    /// <remarks>
    /// There is no parameter for it. <c>InteractionDirection.Inbound</c> exists so the column
    /// carries information and so US-013 is a dropped check constraint rather than a migration of
    /// every row — but no code path in this release can write one, and this is the entity half of
    /// that claim. <c>CK_Interactions_Direction</c> is the database half.
    /// </remarks>
    [Fact]
    public void Direction_is_always_outbound_and_takes_no_parameter()
    {
        Accepted().Direction.Should().Be(InteractionDirection.Outbound);

        typeof(Interaction).GetMethod(nameof(Interaction.Send))!
            .GetParameters()
            .Should().NotContain(
                parameter => parameter.ParameterType == typeof(InteractionDirection),
                "a direction parameter would make an inbound row expressible in code, and the "
                + "check constraint would then be the only thing stopping it");
    }

    // ── AC-7's shape: a failed send is a real row ──────────────────────────────

    [Fact]
    public void A_failed_send_carries_a_code_and_no_provider_id()
    {
        var interaction = Interaction.Send(
            Ticket, CommunicationChannel.Sms, "+966501234567", "Your invoice.",
            "Mock", null, DeliveryStatus.Failed, "MockConfiguredFailure", Sender, Now);

        interaction.DeliveryStatus.Should().Be(DeliveryStatus.Failed);
        interaction.FailureCode.Should().Be("MockConfiguredFailure");
        interaction.ProviderMessageId.Should().BeNull();

        interaction.Body.Should().Be(
            "Your invoice.",
            "the row exists and keeps the message — AC-7. A 5xx would take the record of the "
            + "attempt with it, leaving a support agent nothing to show");
    }

    // ── The pairing, both directions ───────────────────────────────────────────

    /// <summary>
    /// The two rows that would read as fact and be wrong.
    /// </summary>
    /// <remarks>
    /// <b>An <c>Accepted</c> row with no provider id looks delivered</b> and cannot be chased up
    /// with the provider — it is the one wrong answer nobody double-checks. A <c>Failed</c> row
    /// carrying one is a contradiction somebody will resolve in favour of the wrong half.
    /// </remarks>
    [Theory]
    [InlineData(DeliveryStatus.Accepted, null, null, "accepted with no provider id")]
    [InlineData(DeliveryStatus.Accepted, "mock-1", "SomeCode", "accepted with a failure code")]
    [InlineData(DeliveryStatus.Accepted, "", null, "accepted with a blank provider id")]
    [InlineData(DeliveryStatus.Failed, null, null, "failed with no code")]
    [InlineData(DeliveryStatus.Failed, "mock-1", "SomeCode", "failed with a provider id")]
    [InlineData(DeliveryStatus.Failed, null, "  ", "failed with a blank code")]
    public void An_inconsistent_outcome_pair_is_refused(
        DeliveryStatus status, string? providerMessageId, string? failureCode, string because)
    {
        var send = () => Interaction.Send(
            Ticket, CommunicationChannel.Email, "ali@example.com", "Body.",
            "Mock", providerMessageId, status, failureCode, Sender, Now);

        send.Should().Throw<ArgumentException>(because);
    }

    /// <summary>
    /// <c>ArgumentException</c> and not a domain exception, deliberately.
    /// </summary>
    /// <remarks>
    /// An inconsistent outcome pair is not a business rule a user can violate — it is a
    /// programming error in this codebase, and it should read as a `500` with a stack trace rather
    /// than as a polite `409`. Every user-reachable refusal (a closed ticket, no address for the
    /// channel) is decided in the handler <i>before</i> this is called.
    /// </remarks>
    [Fact]
    public void The_pairing_failure_is_not_a_domain_exception()
    {
        var send = () => Interaction.Send(
            Ticket, CommunicationChannel.Email, "ali@example.com", "Body.",
            "Mock", null, DeliveryStatus.Accepted, null, Sender, Now);

        send.Should().Throw<ArgumentException>()
            .And.Should().NotBeAssignableTo<Wasl.Domain.Common.Exceptions.DomainException>(
                "a 409 here would tell the user to fix something that is not their doing");
    }

    // ── Trimming, and Arabic ───────────────────────────────────────────────────

    [Fact]
    public void The_body_and_the_recipient_are_trimmed()
    {
        var interaction = Interaction.Send(
            Ticket, CommunicationChannel.Email, "  ali@example.com  ", "  Corrected.  ",
            "  Mock  ", "mock-1", DeliveryStatus.Accepted, null, Sender, Now);

        interaction.Body.Should().Be("Corrected.");
        interaction.RecipientAddress.Should().Be("ali@example.com");
        interaction.ProviderName.Should().Be("Mock");
    }

    /// <summary>
    /// Arabic survives the entity untouched — the CLR half of AC-10.
    /// </summary>
    /// <remarks>
    /// The database half is the integration test, and it is the one that would catch `varchar`.
    /// This catches the thing a `varchar` test cannot: an entity that normalised, re-encoded or
    /// case-folded the text on its way in. The stored value must be the manager's own words.
    /// </remarks>
    [Fact]
    public void Arabic_is_stored_byte_identical()
    {
        const string arabic = "تم تصحيح فاتورتك. نعتذر عن التأخير.";

        Accepted(arabic).Body.Should().Be(arabic);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\r\n")]
    public void An_empty_body_is_refused(string body)
    {
        var send = () => Accepted(body);

        send.Should().Throw<ArgumentException>(
            "two layers, one rule: the validator produces the readable 400, and this is what "
            + "stops a second caller writing a message with nothing in it");
    }

    [Fact]
    public void A_body_over_the_maximum_is_refused()
    {
        var send = () => Accepted(new string('x', Interaction.BodyMaxLength + 1));

        send.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void A_body_at_exactly_the_maximum_is_accepted()
    {
        var body = new string('x', Interaction.BodyMaxLength);

        Accepted(body).Body.Should().Be(
            body, "4000 exactly is valid — a `<` comparison would refuse a legitimate message");
    }

    [Fact]
    public void An_empty_recipient_is_refused()
    {
        var send = () => Interaction.Send(
            Ticket, CommunicationChannel.Email, "   ", "Body.",
            "Mock", "mock-1", DeliveryStatus.Accepted, null, Sender, Now);

        send.Should().Throw<ArgumentException>(
            "the friendly version is AC-12's 409; this is the guarantee. An empty recipient is "
            + "the row a naive handler writes when the customer has no address for the channel");
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void A_missing_ticket_or_sender_is_refused(bool emptyTicket, bool emptySender)
    {
        var send = () => Interaction.Send(
            emptyTicket ? Guid.Empty : Ticket,
            CommunicationChannel.Email, "ali@example.com", "Body.",
            "Mock", "mock-1", DeliveryStatus.Accepted, null,
            emptySender ? Guid.Empty : Sender,
            Now);

        send.Should().Throw<ArgumentException>();
    }

    // ── Append-only, expressed as an absence ───────────────────────────────────

    /// <summary>
    /// No mutator, and no public setter. The same shape as <c>TicketComment</c>.
    /// </summary>
    /// <remarks>
    /// <b>NOT enforced by a database <c>DENY</c>, unlike <c>AuditLog</c> (BR-9.5)</b>, and spec
    /// Q-E rules on that deliberately: <c>DeliveryStatus</c> is precisely the column a real
    /// provider's asynchronous callback would later update, so a deny now is a grant that has to
    /// be revoked. Append-only here is a property of the code path — which is what this test
    /// asserts, and it is the honest scope of the claim.
    /// </remarks>
    [Fact]
    public void There_is_no_way_to_change_an_interaction_after_it_is_created()
    {
        typeof(Interaction).GetProperties()
            .Where(property => property.SetMethod is { IsPublic: true })
            .Should().BeEmpty("every setter is private — Send is the only way in");

        typeof(Interaction).GetMethods()
            .Where(method => method.IsPublic && !method.IsStatic && !method.IsSpecialName)
            .Where(method => method.DeclaringType == typeof(Interaction))
            .Should().BeEmpty(
                "no MarkDelivered and no Update. A method to change delivery status is what "
                + "US-013's callback would add, and adding it is a visible act");
    }
}
