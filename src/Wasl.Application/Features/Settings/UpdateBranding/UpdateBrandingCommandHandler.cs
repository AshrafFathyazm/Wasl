using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Settings;

namespace Wasl.Application.Features.Settings.UpdateBranding;

/// <summary>
/// Applies a branding change to the single settings row. `022`.
/// </summary>
/// <remarks>
/// <para>
/// <b>No role check here, and that is BR-6's split, not an omission.</b> "Is the caller a
/// Manager" is role-only, so it is an endpoint policy — <c>WaslPolicies.ManagerOnly</c> on the
/// action. `011` measured what happens when a data-dependent check goes in a policy and what
/// happens when a role check goes in a handler; this one has no data in it at all.
/// </para>
/// <para>
/// <b>The version check runs before the contrast gate.</b> A stale caller is looking at a
/// different stored colour than the server is, so refusing their colour on accessibility grounds
/// would explain the wrong problem — and the refusal carries ratios measured against a state they
/// cannot see. `012` established the ordering and the reason is the same.
/// </para>
/// </remarks>
internal sealed class UpdateBrandingCommandHandler(IApplicationDbContext context)
    : IRequestHandler<UpdateBrandingCommand, BrandingResponse>
{
    public async Task<BrandingResponse> Handle(
        UpdateBrandingCommand request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var settings = await context.FirstOrDefaultAsync(
            context.OrganizationSettings,
            cancellationToken)
            ?? throw new InvalidOperationException(
                "The organisation settings row is missing. The AddOrganizationSettings migration "
                + "has not been applied to this database.");

        if (!VersionMatches(settings, request.ExpectedVersion))
        {
            throw new ConcurrencyConflictException();
        }

        /* THE VALIDATOR ALREADY PROVED THIS PARSES. Re-running the normalisation rather than
         * carrying a parsed value on the command keeps `TryNormalise` the single definition of
         * "what a colour is" — and an exception here would mean the validator and the entity
         * disagree, which is a defect in this codebase rather than something a caller did. */
        if (!BrandContrast.TryNormalise(request.BrandColor, out var normalised))
        {
            throw new InvalidOperationException(
                $"'{request.BrandColor}' reached the handler unparsed. "
                + "UpdateBrandingCommandValidator should have refused it as a 400.");
        }

        var sidebarMode = Enum.Parse<SidebarMode>(request.SidebarMode, ignoreCase: false);

        /* THE GATE, INSIDE THE ENTITY. Throws `InaccessibleBrandColorException` — a `400` with
         * its own `type` and the four measured ratios — or returns whether anything changed. */
        var changed = settings.ChangeBranding(normalised, sidebarMode);

        if (!changed)
        {
            /* AN IDENTICAL SUBMIT. Nothing is written, so the `version` the caller gets back is
             * the one they sent and a second `PUT` with it still succeeds.
             *
             * DEVIATION FROM `spec.md`'s EDGE-CASE TABLE, and it is deliberate. That table says
             * an identical submit writes NO audit row. `AuditBehaviour` writes exactly one row
             * per auditable command, on the success and the failure path alike, and that
             * invariant is what makes a MISSING row always a defect. Suppressing the row here
             * would mean teaching the behaviour to sometimes not write — the one change that
             * makes every future missing row ambiguous.
             *
             * What ships instead: the row is written with `Changes` null, which BR-9.8 already
             * distinguishes from a row that recorded a change. An administrator pressing Save on
             * unchanged values did take an action, and `null` says exactly what happened. */
            return BrandingResponse.From(settings);
        }

        await context.SaveChangesAsync(cancellationToken);

        return BrandingResponse.From(settings);
    }

    /// <summary>
    /// The explicit check that produces a readable <c>409</c>. <b>Not the guarantee</b> — EF
    /// re-checks the <c>rowversion</c> at <c>SaveChangesAsync</c>, and `036` translates that
    /// into the same conflict. The pre-check is the message; the column is the rule.
    /// </summary>
    private static bool VersionMatches(OrganizationSettings settings, string expectedVersion) =>
        settings.RowVersion.AsSpan().SequenceEqual(Convert.FromBase64String(expectedVersion));
}
