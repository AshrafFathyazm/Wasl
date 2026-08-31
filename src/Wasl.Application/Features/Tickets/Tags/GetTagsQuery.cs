using MediatR;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Application.Features.Tickets.Tags;

/// <summary>
/// <c>GET /api/tags</c> — the tag vocabulary. `034`'s read half, added 2026-08-31.
/// </summary>
/// <remarks>
/// <para>
/// <b>`034` built attach and detach and nothing that returns the set they attach FROM.</b> Its
/// Q-3 ruled the tags are *"a managed set, seeded, with no admin UI this feature"* — which makes
/// a read endpoint the only way a client can offer them. Without it the picker would have to
/// carry a hard-coded list of ids, and the seeded names are Arabic user content that a client
/// must not be inventing.
/// </para>
/// <para>
/// <b>Not an <c>ICommand</c></b>, so no transaction and no audit row — a read is not audited
/// (`003` AC-16).
/// </para>
/// <para>
/// <b>No paging, and the same reasoning `011` used for <c>GET /api/support-users</c>:</b> the set
/// is seeded and bounded, so a page control nobody can use is worse than none. `--seed` writes
/// eight. If tag management ever ships this becomes paged, and that is a breaking change recorded
/// here rather than designed around.
/// </para>
/// <para>
/// <b>Active only.</b> <c>Tag.IsActive</c> exists and nothing can currently clear it, which is
/// exactly when a filter is cheapest to add: adding it later would silently change results for
/// anyone who had built a habit on them — `008` Q-1's ruling, applied again.
/// </para>
/// </remarks>
public sealed record GetTagsQuery : IRequest<IReadOnlyList<TagSummary>>;

internal sealed class GetTagsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetTagsQuery, IReadOnlyList<TagSummary>>
{
    public async Task<IReadOnlyList<TagSummary>> Handle(
        GetTagsQuery request,
        CancellationToken cancellationToken) =>
        await context.ToListAsync(
            context.Tags
                .Where(tag => tag.IsActive)

                // Ordered in SQL, and the ordering is the DATABASE collation's — which does not
                // follow `Accept-Language`. A mixed Arabic and English set therefore looks
                // correctly ordered in one language and arbitrary in the other, and a client that
                // needs locale-correct order sorts with `Intl.Collator`. Identical to the note
                // `011` put on `GET /api/support-users`, and it is the same trap.
                .OrderBy(tag => tag.Name)
                .Select(tag => new TagSummary(tag.Id, tag.Name)),
            cancellationToken);
}
