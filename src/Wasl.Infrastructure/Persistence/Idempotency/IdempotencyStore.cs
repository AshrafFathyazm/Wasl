using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Infrastructure.Persistence.Configurations;

namespace Wasl.Infrastructure.Persistence.Idempotency;

/// <summary>
/// <see cref="IIdempotencyStore"/> over <c>dbo.IdempotencyKeys</c>. `036` §3.5.
/// </summary>
/// <remarks>
/// <para>
/// <b>It writes on its OWN connection, from <see cref="IDbContextFactory{TContext}"/>.</b> The
/// same choice `003`'s failure-path audit writer made, and for a related reason: a reservation
/// that vanished when the command rolled back would let a duplicate through on the retry, and a
/// reservation enrolled in the command's transaction would do exactly that. It also keeps this
/// bookkeeping out of the request context's change tracker, where a tracked reservation could be
/// re-saved by the command's own <c>SaveChanges</c>.
/// </para>
/// <para>
/// <b>It runs BEFORE any transaction exists.</b> The filter that calls it is an MVC action
/// filter, so it executes ahead of the controller and therefore ahead of MediatR and
/// <c>TransactionBehaviour</c>. Nothing here needs to know that; it is written down because the
/// opposite — a store called from inside a handler — would silently join the transaction and
/// undo the paragraph above.
/// </para>
/// </remarks>
internal sealed class IdempotencyStore(
    IDbContextFactory<WaslDbContext> contexts,
    TimeProvider clock) : IIdempotencyStore
{
    /// <summary>
    /// How long a spent key is remembered. `036` Q-5's ruling, 2026-09-05.
    /// </summary>
    /// <remarks>
    /// Twenty-four hours. Long enough to cover a client that retries after a network partition or
    /// a user who leaves a tab open overnight; short enough that the table does not become a
    /// permanent record of every write ever made. A key store with no expiry is a table that
    /// grows forever, which `spec.md`'s edge-case list named before this was built.
    /// </remarks>
    public static readonly TimeSpan Retention = TimeSpan.FromHours(24);

    public async Task<IdempotencyClaim> TryBeginAsync(
        string key, Guid userId, string endpoint, string requestHash, CancellationToken cancellationToken)
    {
        await using var context = await contexts.CreateDbContextAsync(cancellationToken);

        var now = Truncate(clock.GetUtcNow().UtcDateTime);

        // Opportunistic pruning, on the path that is already writing. No background sweep, for
        // the reason `004b` recorded for the sign-in throttle: a timer is a thing that has to be
        // disposed correctly, and this costs one indexed delete on a request that was going to
        // touch this table anyway.
        //
        // Scoped to THIS user, so it seeks the unique index rather than scanning the table — and
        // so one busy caller never pays to clean up after everyone else.
        await context.Set<IdempotencyRecord>()
            .Where(record => record.UserId == userId && record.ExpiresAtUtc < now)
            .ExecuteDeleteAsync(cancellationToken);

        var reservation = IdempotencyRecord.Reserve(key, userId, endpoint, requestHash, now, Retention);

        context.Set<IdempotencyRecord>().Add(reservation);

        try
        {
            // base.SaveChangesAsync, reached through the context this factory built — the override
            // in WaslDbContext stamps IAuditableEntity and translates the three indexes it knows.
            // This index is NOT among them, deliberately: a claimed key is not an error here, it
            // is the normal second delivery, and the answer is below rather than an exception.
            await context.SaveChangesAsync(cancellationToken);

            return new IdempotencyClaim(IdempotencyOutcome.Started);
        }
        catch (DbUpdateException exception) when (IsKeyAlreadyClaimed(exception))
        {
            // THE RACE, and the reason the index is the guarantee. Both deliveries pruned, both
            // built a reservation, and exactly one insert survived. The loser reads what the
            // winner recorded — which, in a true race, is usually nothing yet.
            return await ReadExistingAsync(key, userId, endpoint, requestHash, now, cancellationToken);
        }
    }

    public async Task CompleteAsync(
        string key, Guid userId, string endpoint,
        int statusCode, string responseBody, string? location, CancellationToken cancellationToken)
    {
        await using var context = await contexts.CreateDbContextAsync(cancellationToken);

        var record = await Find(context, key, userId, endpoint)
            .FirstOrDefaultAsync(cancellationToken);

        // Absent means it expired, or something else abandoned it. Nothing to record and nothing
        // to repair: the request already succeeded and its response is already going out. Failing
        // here would turn a completed write into an error the client would retry.
        if (record is null)
        {
            return;
        }

        record.Complete(statusCode, responseBody, location);

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task AbandonAsync(
        string key, Guid userId, string endpoint, CancellationToken cancellationToken)
    {
        await using var context = await contexts.CreateDbContextAsync(cancellationToken);

        // A `400` the client then corrects must not be answered by its own key forever, so a
        // failed request releases the reservation rather than recording the failure. The
        // alternative — storing non-2xx responses too — would make a validation mistake permanent
        // for twenty-four hours and unfixable without minting a new key.
        await Find(context, key, userId, endpoint).ExecuteDeleteAsync(cancellationToken);
    }

    private async Task<IdempotencyClaim> ReadExistingAsync(
        string key, Guid userId, string endpoint, string requestHash, DateTime now,
        CancellationToken cancellationToken)
    {
        await using var context = await contexts.CreateDbContextAsync(cancellationToken);

        var existing = await Find(context, key, userId, endpoint)
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken);

        // Deleted between the failed insert and this read. Rare, and the honest answer is the
        // retryable one — nothing was decided, and the client's next attempt claims the key
        // cleanly.
        if (existing is null || existing.ExpiresAtUtc < now)
        {
            return new IdempotencyClaim(IdempotencyOutcome.InFlight);
        }

        // AC-17, and it is checked BEFORE the completed/in-flight split on purpose: a mismatched
        // body is wrong whichever state the first request reached, and answering "still running"
        // would invite a retry that can only ever be refused.
        //
        // Ordinal, because a hex digest has no culture and a culture-aware comparison here is how
        // two identical hashes stop matching on a machine with a different default.
        if (!string.Equals(existing.RequestHash, requestHash, StringComparison.Ordinal))
        {
            return new IdempotencyClaim(IdempotencyOutcome.BodyMismatch);
        }

        // A null status IS the in-flight marker — see IdempotencyRecord. The first delivery
        // claimed the key and has not finished, so this one is told to come back rather than
        // being handed a response that does not exist yet.
        return existing.StatusCode is { } status
            ? new IdempotencyClaim(IdempotencyOutcome.Replay, status, existing.ResponseBody, existing.Location)
            : new IdempotencyClaim(IdempotencyOutcome.InFlight);
    }

    private static IQueryable<IdempotencyRecord> Find(
        WaslDbContext context, string key, Guid userId, string endpoint) =>
        context.Set<IdempotencyRecord>().Where(record =>
            record.UserId == userId
            && record.Endpoint == endpoint
            && record.KeyValue == key);

    /// <summary>
    /// A unique violation on <see cref="IdempotencyRecordConfiguration.UniqueIndexName"/> and
    /// nothing else.
    /// </summary>
    /// <remarks>
    /// Matched by index NAME, the same rule <c>WaslDbContext.TranslateDuplicate</c> follows and
    /// for the same reason: 2601 and 2627 are reported for ANY unique violation, so keying on the
    /// number would read an unrelated collision as a claimed key and replay a response that
    /// belongs to a different request.
    /// </remarks>
    private static bool IsKeyAlreadyClaimed(DbUpdateException exception) =>
        exception.InnerException is SqlException sql
        && sql.Number is 2601 or 2627
        && sql.Message.Contains(IdempotencyRecordConfiguration.UniqueIndexName, StringComparison.Ordinal);

    /// <summary>
    /// To the millisecond, because every timestamp column in this schema is <c>datetime2(3)</c>.
    /// </summary>
    /// <remarks>
    /// `007` AC-14's rule reaching a table that has no <c>IRequestTimestamp</c> to read from:
    /// this store runs outside the request pipeline's scoped clock on purpose, so it truncates
    /// here rather than storing a value the column will round underneath it.
    /// </remarks>
    private static DateTime Truncate(DateTime value) =>
        new(value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond), value.Kind);
}
