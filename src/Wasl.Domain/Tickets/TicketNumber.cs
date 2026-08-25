using System.Globalization;

namespace Wasl.Domain.Tickets;

/// <summary>
/// Formats the human-readable ticket number, <c>TCK-{yyyy}-{000000}</c>.
/// </summary>
/// <remarks>
/// Pure and static. The value it formats comes from a database sequence, because atomicity
/// under concurrency is the one thing a sequence provides and nothing in the domain can
/// (`research.md`). This class owns the shape; `Wasl.Infrastructure` owns the number.
/// </remarks>
public static class TicketNumber
{
    /// <summary>The prefix. Quoted aloud and pasted between systems, so it never varies.</summary>
    public const string Prefix = "TCK";

    /// <summary>Digits in the sequence part, zero-padded.</summary>
    public const int SequenceDigits = 6;

    /// <summary>
    /// <c>TCK-2026-000042</c>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b><see cref="CultureInfo.InvariantCulture"/> is load-bearing, not defensive.</b> BR-8.13
    /// requires Latin digits in every locale: under <c>ar-SA</c> the default formatter can emit
    /// Arabic-Indic digits and a non-Gregorian year, and the result would be a ticket number
    /// that differs by who created it. It is quoted on the phone and pasted between systems —
    /// two renderings of one identifier is worse than an ugly one.
    /// </para>
    /// <para>
    /// The sequence is <b>not</b> reset per year. The year is informational; the sequence is
    /// what makes the number unique. A per-year reset would give <c>TCK-2026-000001</c> and
    /// <c>TCK-2027-000001</c> the same numeric part, and anything sorting on it would
    /// interleave them.
    /// </para>
    /// <para>
    /// Past 999999 the format <b>widens</b> rather than wrapping. A wrapped number collides
    /// with one the unique index already holds, and that failure arrives years later with no
    /// clue why. A seventh digit is ugly and correct.
    /// </para>
    /// </remarks>
    public static string Format(int year, long sequence)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(sequence, 1);

        return string.Create(
            CultureInfo.InvariantCulture,
            $"{Prefix}-{year:D4}-{sequence.ToString($"D{SequenceDigits}", CultureInfo.InvariantCulture)}");
    }
}
