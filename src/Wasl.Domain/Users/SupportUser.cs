namespace Wasl.Domain.Users;

/// <summary>
/// A member of the support team, and the login identity. `004`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Not an <c>IAuditableEntity</c>, deliberately.</b> Stamping needs <c>ICurrentUser</c>, and
/// <c>ICurrentUser</c> is read from a token that is issued by looking a user up — so making this
/// entity stamped would put the identity service inside the thing that defines identity. It
/// carries <c>CreatedAtUtc</c> as plain data, set once at seeding.
/// </para>
/// <para>
/// <b><see cref="PasswordHash"/> never leaves this type.</b> No endpoint returns it, no log writes
/// it, and BR-9.7's redaction list covers the property name so an audit diff cannot carry it
/// either. The hash format is PBKDF2 in ASP.NET Core Identity's V3 layout, produced by
/// <c>PasswordHasher&lt;SupportUser&gt;</c> — chosen because it is the framework's, so nothing
/// here invents a key-derivation scheme.
/// </para>
/// </remarks>
public sealed class SupportUser
{
    public const int FullNameMaxLength = 200;
    public const int EmailMaxLength = 320;
    public const int PasswordHashMaxLength = 400;

    // EF Core materialises through this. Nothing else should.
    private SupportUser()
    {
    }

    public Guid Id { get; private set; }

    public string FullName { get; private set; } = null!;

    /// <summary>
    /// The login identity. Case-insensitive **by column collation**, not by lowercasing on the
    /// way in — SQL Server cannot index an expression, so `LOWER(Email)` would give a
    /// case-insensitive comparison and an unusable index (ADR-013 row 3).
    /// </summary>
    public string Email { get; private set; } = null!;

    public string PasswordHash { get; private set; } = null!;

    public SupportRole Role { get; private set; }

    /// <summary>`en` or `ar` (BR-8.1). Read with the user row, never filtered on.</summary>
    public string PreferredLanguage { get; private set; } = null!;

    /// <summary>
    /// Checked at sign-in only.
    /// </summary>
    /// <remarks>
    /// A token already issued outlives deactivation by up to its lifetime — `spec.md` Q-F accepts
    /// that rather than adding a per-request user lookup, which would put a database read on
    /// every authenticated call to protect against a case that needs a revocation list to solve
    /// properly.
    /// </remarks>
    public bool IsActive { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// SQL Server <c>rowversion</c>. **No consumer in this feature** — nothing here updates a
    /// user. It exists because the schema says so and because `014` updates
    /// <see cref="PreferredLanguage"/>.
    /// </summary>
    public byte[] RowVersion { get; private set; } = null!;

    /// <summary>
    /// The only way to create a user. Takes an already-hashed password.
    /// </summary>
    /// <remarks>
    /// <b>Hashing happens outside the domain</b>, and that is the boundary rather than a
    /// convenience: <c>PasswordHasher&lt;T&gt;</c> lives in
    /// <c>Microsoft.Extensions.Identity.Core</c>, and <c>Wasl.Domain</c> declares zero packages.
    /// This factory refuses a plaintext-looking value only in the sense that it refuses an empty
    /// one — it cannot tell a hash from a password, so the caller carries that responsibility and
    /// AC-14 is the test that the caller met it.
    /// </remarks>
    public static SupportUser Create(
        string fullName,
        string email,
        string passwordHash,
        SupportRole role,
        DateTime createdAtUtc,
        string preferredLanguage = "en")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fullName);
        ArgumentException.ThrowIfNullOrWhiteSpace(email);
        ArgumentException.ThrowIfNullOrWhiteSpace(passwordHash);
        ArgumentException.ThrowIfNullOrWhiteSpace(preferredLanguage);

        return new SupportUser
        {
            Id = Guid.CreateVersion7(),
            FullName = fullName.Trim(),

            // Trimmed but NOT lowercased. The column's collation decides equality, so storing
            // what the user typed keeps the display value honest — and `MANAGER@WASL.LOCAL`
            // still signs in against a stored `manager@wasl.local` (AC-23).
            Email = email.Trim(),
            PasswordHash = passwordHash,
            Role = role,
            PreferredLanguage = preferredLanguage,
            IsActive = true,
            CreatedAtUtc = createdAtUtc,
        };
    }

    /// <summary>
    /// Stores the language this user reads the interface in. `005b`, FR-5.5.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The first mutator this entity has ever had.</b> Every other property is set once by
    /// <see cref="Create"/> and never changes, which is why they are all `private set` with no
    /// method behind them.
    /// </para>
    /// <para>
    /// <b>The supported list is checked here as well as in the validator, and that is not
    /// duplication.</b> The validator answers a request with a `400` naming the field; this
    /// refuses to construct an invalid state at all, and it is what stops a seeder, a migration,
    /// or a future endpoint storing a value with no catalogue behind it. `007` made the same call
    /// for `Customer` and `CLAUDE.md` records the reasoning: a rule that only exists at the edge
    /// is a rule the next caller does not have.
    /// </para>
    /// <para>
    /// <b>A region tag is refused</b> — `ar-SA` is rejected even though `Accept-Language: ar-SA`
    /// resolves to `ar` when READING. Resolution may fall back; storage may not, because a stored
    /// `ar-SA` is a stored value with no catalogue behind it.
    /// </para>
    /// </remarks>
    public void ChangeLanguage(string language)
    {
        if (!SupportedLanguages.Contains(language, StringComparer.Ordinal))
        {
            throw new ArgumentException(
                $"'{language}' is not a supported interface language.", nameof(language));
        }

        PreferredLanguage = language;
    }

    /// <summary>The two locales this product speaks. BR-8.1.</summary>
    /// <remarks>
    /// Ordinal and case-sensitive: `AR` is refused rather than normalised, because a stored
    /// preference is compared to a catalogue name and normalising here would hide a caller that
    /// is sending the wrong shape.
    /// </remarks>
    public static readonly IReadOnlyList<string> SupportedLanguages = ["en", "ar"];
}
