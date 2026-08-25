using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Wasl.Domain.Audit;

namespace Wasl.Infrastructure.Persistence.Audit;

/// <summary>
/// Captures the field-level diff from the change tracker <b>before</b> <c>SaveChanges</c>
/// accepts it, into <see cref="AuditDiffAccumulator"/>. BR-9.8.
/// </summary>
/// <remarks>
/// <para>
/// <b>This is the single most likely way this feature ships broken, and this class is the
/// answer to it</b> (`research.md` R-1). The change tracker knows what changed only until
/// <c>SaveChanges</c> accepts the changes; after that every entry is <c>Unchanged</c> and
/// <c>OriginalValues</c> equals <c>CurrentValues</c>. A behaviour reading the tracker after
/// <c>await next()</c> gets an <b>empty diff, not an error</b> — the row still exists,
/// <c>SELECT COUNT(*)</c> still returns 1, and every test that counts rows stays green.
/// AC-18 and AC-19 assert on content for exactly this reason.
/// </para>
/// <para>
/// <b>It captures and decides nothing.</b> ADR-008 rejects a <c>SaveChangesInterceptor</c>
/// that determines audit intent, and that objection holds: an interceptor sees
/// <c>UPDATE tickets SET status = 'Open'</c> and cannot tell a triage from a reopen. The
/// action comes from <c>IAuditableCommand.AuditAction</c>, the outcome from the classifier,
/// the entity from the command. This answers one narrow question — <i>which properties changed
/// value on this save</i> — which the change tracker is the only correct source for.
/// </para>
/// <para>
/// It also writes nothing. <c>IAuditWriter</c> writes; this only fills a list.
/// </para>
/// </remarks>
internal sealed class AuditDiffInterceptor(AuditDiffAccumulator accumulator) : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData, InterceptionResult<int> result)
    {
        Capture(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Capture(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void Capture(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        var captured = context.ChangeTracker
            .Entries()
            // The audit row itself is excluded, or every audit row would record the writing
            // of an audit row — and on the success path that write is inside the same
            // transaction, so it would appear in its own diff.
            .Where(entry => entry.Entity is not AuditEntry)
            .Where(entry => entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .SelectMany(Describe)
            .ToArray();

        if (captured.Length > 0)
        {
            accumulator.Add(captured);
        }
    }

    private static IEnumerable<AuditFieldChange> Describe(EntityEntry entry)
    {
        var entity = entry.Metadata.ClrType.Name;
        var id = PrimaryKeyGuid(entry);

        foreach (var property in entry.Properties)
        {
            // Shadow properties and the key itself are structural, not business changes. The
            // key on an insert is already the `id` on every entry.
            if (property.Metadata.IsPrimaryKey() || property.Metadata.IsShadowProperty())
            {
                continue;
            }

            var (before, after) = entry.State switch
            {
                EntityState.Added => (null, Format(property.CurrentValue)),
                EntityState.Deleted => (Format(property.OriginalValue), null),
                _ => (Format(property.OriginalValue), Format(property.CurrentValue)),
            };

            // AC-18. EF marks a property Modified when it is assigned, whether or not the
            // value differs — so `customer.Email = customer.Email` produces a Modified
            // property with identical values. Comparing the values, not the flag, is what
            // keeps a no-op write out of the diff; including it would bury the field that
            // actually changed.
            if (entry.State is EntityState.Modified && before == after)
            {
                continue;
            }

            // A create whose property is null changed nothing worth recording. Without this,
            // every insert carries an entry per unset optional column.
            if (entry.State is EntityState.Added && after is null)
            {
                continue;
            }

            yield return new AuditFieldChange(entity, id, property.Metadata.Name, before, after);
        }
    }

    private static Guid? PrimaryKeyGuid(EntityEntry entry) =>
        entry.Properties
            .Where(property => property.Metadata.IsPrimaryKey())
            .Select(property => property.CurrentValue)
            .OfType<Guid>()
            .Select(value => (Guid?)value)
            .FirstOrDefault();

    /// <summary>
    /// One string form per value, culture-independent.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b><see cref="CultureInfo.InvariantCulture"/> is not a detail.</b> The same command run
    /// under <c>Accept-Language: ar</c> must produce byte-identical <c>Changes</c> (AC-22),
    /// and a decimal formatted under a culture that uses <c>,</c> as its separator — or a date
    /// under a non-Gregorian calendar — would break that silently, in a column nobody reads
    /// until an incident.
    /// </para>
    /// <para>
    /// Dates use round-trip <c>"O"</c> so a stored timestamp can be parsed back exactly. Byte
    /// arrays — <c>rowversion</c> — are excluded rather than formatted: a concurrency token
    /// changes on every write, so including it would add a meaningless entry to every diff.
    /// </para>
    /// </remarks>
    private static string? Format(object? value) => value switch
    {
        null => null,
        string text => text,
        byte[] => null,
        DateTime date => date.ToString("O", CultureInfo.InvariantCulture),
        DateTimeOffset offset => offset.ToString("O", CultureInfo.InvariantCulture),
        IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString(),
    };
}
