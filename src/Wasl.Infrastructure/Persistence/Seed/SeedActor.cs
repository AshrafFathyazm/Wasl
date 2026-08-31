using Wasl.Application.Common.Abstractions;

namespace Wasl.Infrastructure.Persistence.Seed;

/// <summary>
/// The identity a seed run acts as — <b>a real seeded user, never an invented one</b>.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why this exists at all.</b> A comment cannot be written from outside the pipeline without
/// losing the two things a seeded comment is for: its <c>CommentAdded</c> history row and its
/// audit row. And it cannot be written THROUGH the pipeline without an actor —
/// <c>TicketComment.AuthorUserId</c> is non-nullable with a foreign key, and
/// <c>Ticket.AddComment</c> stamps it from <c>ICurrentUser</c>. With no principal the seeder
/// would write <c>Guid.Empty</c> and meet <c>Error Number:547</c>, which is exactly what
/// `009`'s fabricated assignee id did when `004` gave the column its FK.
/// </para>
/// <para>
/// <b>ADR-005 is not being bent, and the distinction is the whole justification.</b> ADR-005
/// rejects <i>inventing</i> an identity — a seeded "system" user, a constant claim, a header.
/// This is the opposite: it carries the id, email and role of a support user that
/// <c>SupportUserSeeder</c> actually created and that a person actually signs in as. The rows
/// it authors are attributed to the Manager, which is true — the demo data IS that Manager's
/// work, and it is indistinguishable from the rows produced by clicking through the product.
/// </para>
/// <para>
/// <b>It is registered only when a seed switch is present, and the process exits before
/// serving.</b> <c>Program.cs</c> adds it after <c>AddPresentation</c> so it wins over
/// <c>HttpCurrentUser</c>, and only inside <c>if (args.Contains(…))</c>. A serving host never
/// composes it, so there is no path by which a request could be attributed to it.
/// </para>
/// <para>
/// <b>Mutable, and a singleton, because <c>ICurrentUser</c> is synchronous.</b> The identity has
/// to be read from the database — the seeded ids are generated, not constants — and no property
/// getter can await. The seeder sets it once before sending anything.
/// </para>
/// </remarks>
public sealed class SeedActor : ICurrentUser
{
    public Guid? UserId { get; private set; }

    public string? Email { get; private set; }

    public string? Role { get; private set; }

    /// <summary>
    /// Adopts a real support user. Called once by the seeder before the first command.
    /// </summary>
    /// <remarks>
    /// Throws on an empty id rather than accepting one: <c>Guid.Empty</c> is precisely the value
    /// that would slip past a nullable check and then fail on a foreign key several commands
    /// later, with a message about a constraint rather than about an identity.
    /// </remarks>
    public void Become(Guid userId, string email, string role)
    {
        if (userId == Guid.Empty)
        {
            throw new InvalidOperationException(
                "SeedActor was handed an empty user id. It must adopt a REAL seeded support "
                + "user — an empty id is not a missing identity, it is a foreign-key violation "
                + "several commands from now. Run --seed first so SupportUserSeeder has written "
                + "them.");
        }

        UserId = userId;
        Email = email;
        Role = role;
    }
}
