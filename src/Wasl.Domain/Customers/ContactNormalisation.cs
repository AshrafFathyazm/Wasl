using System.Text.RegularExpressions;

namespace Wasl.Domain.Customers;

/// <summary>
/// BR-4.2 and BR-4.3 — the one place an email or a phone number is put into its stored form.
/// `007`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Static helpers rather than <c>EmailAddress</c> and <c>PhoneNumber</c> value objects</b>, on a
/// ruling recorded in `12-delivery-log.md` and reflected in `CLAUDE.md`'s structure block — which
/// named those two types before this decision was taken.
/// </para>
/// <para>
/// A value object earns its place by making an invalid instance impossible to construct. Here the
/// entity already has private setters and exactly one factory, so there is a single place an
/// invalid value could enter and it is already closed. Against that, two wrappers would cost an EF
/// value converter each and a conversion on every read — `008`'s two projections, `009`'s duplicate
/// lookup, `018` later — while carrying no invariant <see cref="Customer.Create"/> does not
/// already enforce.
/// </para>
/// <para>
/// <b>Normalisation is separated from validation deliberately.</b> These methods answer "what is
/// the stored form of this?" and return <c>null</c> when there is no answer; deciding that a null
/// answer is a `400` naming a field belongs at the boundary, because only the boundary knows the
/// field's name. The same split `012` draws for its note rule and `013` for its body rule.
/// </para>
/// </remarks>
public static partial class ContactNormalisation
{
    /// <summary>The E.164 maximum, and the column's width.</summary>
    public const int PhoneMaxDigits = 15;

    /// <summary>
    /// Short enough to reject a typo, long enough for the shortest real international numbers.
    /// </summary>
    public const int PhoneMinDigits = 8;

    /// <summary>
    /// BR-4.2. Trimmed and lowercased, or <c>null</c> when there is nothing there.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Invariant culture, not the current one.</b> <c>ToLower()</c> on a Turkish locale maps
    /// <c>I</c> to <c>ı</c>, so <c>ALI@…</c> and <c>ali@…</c> would stop matching on a server whose
    /// culture happened to differ from the one the row was written on. A duplicate rule that
    /// depends on the machine's locale is not a rule.
    /// </para>
    /// <para>
    /// <b>This runs even though <c>Customers.Email</c> carries a case-insensitive collation</b>, so
    /// the unique index would catch <c>ALI@EXAMPLE.COM</c> on its own. The normalisation is for the
    /// stored value: the frozen contract describes <c>email</c> as the normalised form, `008`
    /// returns whatever is stored, and AC-19 reads it back to prove this ran — because AC-9 would
    /// pass on the collation alone.
    /// </para>
    /// </remarks>
    public static string? Email(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();

    /// <summary>
    /// BR-4.3. E.164 — a leading <c>+</c> and digits only — or <c>null</c> when the input cannot
    /// be put into that form.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Formatting is stripped; a country is never inferred.</b> Spaces, dashes, parentheses and
    /// dots are removed, and what remains must already be international. A local number such as
    /// <c>0501234567</c> returns <c>null</c> and becomes a `400` naming <c>phone</c> (AC-7).
    /// </para>
    /// <para>
    /// <b>Guessing the country was rejected explicitly</b> (`spec.md` Q-B). Deciding that
    /// <c>0501234567</c> is Saudi is a business rule nobody has stated, and being wrong writes an
    /// unreachable number into a record whose entire purpose is that its owner can be reached. The
    /// user is told to include the country code instead, which is a smaller cost than a silently
    /// wrong number — and `017` can revisit it with a stated default region.
    /// </para>
    /// <para>
    /// <b>Returns null rather than throwing</b>, for the reason above: the caller names the field.
    /// </para>
    /// </remarks>
    public static string? Phone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
        {
            return null;
        }

        var stripped = Formatting().Replace(phone, string.Empty);

        return E164().IsMatch(stripped) ? stripped : null;
    }

    /// <summary>Whether a non-empty phone was supplied but could not be normalised. AC-7.</summary>
    /// <remarks>
    /// The distinction the validator needs: "absent" is legal when an email is present (BR-4.1),
    /// while "present and unparseable" is always a `400`. Without this the two collapse, and a
    /// customer with a malformed phone and no email would be reported as missing a contact method
    /// — true, and not the useful half of the truth.
    /// </remarks>
    public static bool IsUnparseablePhone(string? phone) =>
        !string.IsNullOrWhiteSpace(phone) && Phone(phone) is null;

    /// <summary>Characters people put in phone numbers that carry no information.</summary>
    [GeneratedRegex(@"[\s\-\(\)\.]")]
    private static partial Regex Formatting();

    /// <summary>
    /// A leading <c>+</c> and 8 to 15 digits.
    /// </summary>
    /// <remarks>
    /// Anchored at both ends, so <c>+966 5012 3456 ext 7</c> is refused rather than truncated —
    /// storing the first fifteen characters of something a person typed is how a record acquires a
    /// number that dials the wrong place.
    /// </remarks>
    /// <remarks>
    /// The bounds are written literally rather than interpolated from
    /// <see cref="PhoneMinDigits"/> and <see cref="PhoneMaxDigits"/>: <c>GeneratedRegex</c> is a
    /// source generator and its argument must be a compile-time constant, which an interpolated
    /// string is not. <c>ThePatternMatchesTheDeclaredBounds</c> asserts the two agree, so the
    /// duplication cannot drift silently.
    /// </remarks>
    [GeneratedRegex(@"^\+\d{8,15}$")]
    private static partial Regex E164();
}
