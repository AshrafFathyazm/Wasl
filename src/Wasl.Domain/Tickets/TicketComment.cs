using Wasl.Domain.Communications;

namespace Wasl.Domain.Tickets;

/// <summary>
/// One comment on a ticket. Append-only. `013`, BR-5.
/// </summary>
/// <remarks>
/// <para>
/// <b>No update method and no delete, and that is BR-5.3 expressed as an absence.</b> Every
/// property has a private setter and the only way in is <see cref="Create"/>. AC-13 asserts that
/// no endpoint exists to edit or delete one; this type is why writing such an endpoint would
/// require changing the entity first, which is a visible act rather than an oversight.
/// </para>
/// <para>
/// <b>Not an <c>IAuditableEntity</c>.</b> Same reason as <see cref="TicketHistoryEntry"/>: there
/// is no <c>UpdatedAtUtc</c> to maintain on a row that is never updated, and the actor column is
/// <see cref="AuthorUserId"/> — "who wrote this" rather than "who last edited this row". The
/// author is stamped by <c>WaslDbContext.SaveChangesAsync</c> alongside the history row's, in the
/// second loop `011` added after finding every history actor was null.
/// </para>
/// <para>
/// <b><see cref="Body"/> never reaches <c>dbo.AuditLog</c>.</b> `003` registered
/// <c>TicketComment.Body</c> and <c>TicketComments.Body</c> in <c>AuditRedaction</c> before any
/// comment existed — both spellings, because the entity and the table are named differently and a
/// redaction rule that depends on which name the caller happened to have is not a rule. `013` is
/// the first feature that can prove the rule fires, and AC-18 does it by searching every column of
/// the row for a distinctive string rather than by reading the redaction list.
/// </para>
/// </remarks>
public sealed class TicketComment
{
    /// <summary>BR-5.1. Matches the column, and matches `String.length` on the client.</summary>
    public const int BodyMaxLength = 4000;

    // EF Core materialises through this. Nothing else should.
    private TicketComment()
    {
    }

    public Guid Id { get; private set; }

    public Guid TicketId { get; private set; }

    /// <summary>
    /// From the token, never from the request body (AC-15).
    /// </summary>
    /// <remarks>
    /// Non-nullable, unlike <c>TicketHistoryEntry.PerformedByUserId</c>. A history row can
    /// legitimately have no actor — <c>--seed</c> writes such rows, because seeding is not
    /// something a person did — but a comment is by definition written by someone, and a comment
    /// with no author is a row the timeline cannot render honestly.
    /// </remarks>
    public Guid AuthorUserId { get; private set; }

    public string Body { get; private set; } = null!;

    /// <summary>
    /// BR-5.4. Visible to every support user, marked distinctly in the UI.
    /// </summary>
    /// <remarks>
    /// <b>It exists now so a customer-facing view can be added later without a data migration.</b>
    /// There is no customer login, so nothing is hidden from anyone today — and that is precisely
    /// why the flag has to be captured today: retrofitting it would mean deciding, for every
    /// comment already written, whether it was meant for the customer.
    /// </remarks>
    public bool IsInternal { get; private set; }

    /// <summary>FR-3.3. The channel this comment arrived through, when it arrived through one.</summary>
    /// <remarks>
    /// Nullable, because a comment typed into the application by an agent came through no channel
    /// at all. Storing <c>Email</c> as a default would be inventing a fact about where it came
    /// from.
    /// </remarks>
    public CommunicationChannel? Channel { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// The only way to create one.
    /// </summary>
    /// <param name="createdAtUtc">
    /// From <c>IRequestTimestamp</c>, never <c>DateTime.UtcNow</c> — and here that is
    /// load-bearing rather than a convention. The comment and its <c>CommentAdded</c> history row
    /// are written in one request, so they receive the <b>same</b> instant, which means every
    /// comment produces two timeline entries with a byte-identical timestamp. AC-10's tie-break is
    /// therefore exercised by every single comment rather than by a contrived test.
    /// </param>
    /// <remarks>
    /// <b>The body is trimmed here and validated in the validator.</b> Trimming is normalisation
    /// and belongs with the data; deciding that an empty body is a `400` with a field name belongs
    /// at the boundary, because only the boundary can say which field. The database keeps
    /// <c>CK_TicketComments_Body</c> as the guarantee of last resort for a caller that is not the
    /// API — with the cost stated: reaching it is a `DbUpdateException`, and therefore a `500`.
    /// </remarks>
    public static TicketComment Create(
        Guid ticketId,
        string body,
        DateTime createdAtUtc,
        bool isInternal = false,
        CommunicationChannel? channel = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(body);

        return new TicketComment
        {
            Id = Guid.CreateVersion7(),
            TicketId = ticketId,
            Body = body.Trim(),
            IsInternal = isInternal,
            Channel = channel,
            CreatedAtUtc = createdAtUtc,

            // AuthorUserId is deliberately NOT set here. WaslDbContext.SaveChangesAsync stamps it
            // from ICurrentUser, the same way it stamps a history row's actor — so a comment
            // cannot be attributed to anyone the server did not authenticate, and no handler has
            // to remember to pass it. AC-15.
        };
    }
}
