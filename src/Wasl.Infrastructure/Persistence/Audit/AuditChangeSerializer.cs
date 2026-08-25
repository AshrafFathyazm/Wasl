using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Unicode;
using Wasl.Domain.Audit;

namespace Wasl.Infrastructure.Persistence.Audit;

/// <summary>
/// Turns captured changes into the <c>Changes</c> JSON document, applying BR-9.7 redaction and
/// the deterministic ordering AC-19 requires.
/// </summary>
internal static class AuditChangeSerializer
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,

        // null is null, not omitted. `before: null` on a create is meaningful and different
        // from an absent key — a reader must be able to tell "this field was set from nothing"
        // from "this field was not part of the change".
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,

        // Arabic is stored readable rather than as علي.
        //
        // The default encoder escapes every non-ASCII character. That round-trips correctly,
        // so AC-24 would pass either way — but until `019` exists, SQL *is* the read interface
        // (`contracts/README.md`), and a forensic column a human cannot read during an incident
        // has lost most of its value. This is the narrow encoder, not
        // UnsafeRelaxedJsonEscaping: HTML-sensitive characters stay escaped, so a value
        // reaching `019`'s UI cannot carry markup out of this column.
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.BasicLatin, UnicodeRanges.Arabic),

        WriteIndented = false,
    };

    /// <summary>
    /// The document for these changes, or <c>null</c> when there are none.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b><c>null</c>, never <c>[]</c>.</b> A command that changed nothing and a command whose
    /// diff was lost must not look the same in the table. <c>null</c> means "no tracked
    /// change"; <c>[]</c> would be indistinguishable from the `research.md` R-1 failure, where
    /// the diff was read after <c>SaveChanges</c> had already accepted it.
    /// </para>
    /// <para>
    /// <b>Ordered by entity, then id, then field</b> — and ordered with
    /// <see cref="StringComparer.Ordinal"/>, not the current culture. Determinism is what lets
    /// AC-19 compare two runs byte-for-byte instead of parsing, and a culture-sensitive sort
    /// would reorder the same input under <c>Accept-Language: ar</c>, breaking AC-22 in a way
    /// that reads as a serialisation bug.
    /// </para>
    /// </remarks>
    public static string? Serialize(IReadOnlyList<AuditFieldChange> changes)
    {
        if (changes.Count == 0)
        {
            return null;
        }

        var ordered = changes
            .Select(AuditRedaction.Apply)
            .OrderBy(change => change.Entity, StringComparer.Ordinal)
            .ThenBy(change => change.Id)
            .ThenBy(change => change.Field, StringComparer.Ordinal)
            .Select(change => new ChangeRecord(change.Entity, change.Id, change.Field, change.Before, change.After))
            .ToArray();

        return JsonSerializer.Serialize(ordered, Options);
    }

    /// <summary>
    /// The wire shape. A separate type from <see cref="AuditFieldChange"/> so the JSON keys
    /// `019` reads are declared here, in the one place that writes them, rather than being a
    /// property of a domain record that could be renamed for a domain reason.
    /// </summary>
    private sealed record ChangeRecord(
        string Entity, Guid? Id, string Field, string? Before, string? After);
}
