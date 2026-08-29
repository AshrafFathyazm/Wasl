namespace Wasl.Domain.Customers;

/// <summary>
/// A customer of the support organisation. A record, not a user — there is no customer
/// login in the MVP (01-product-spec.md).
/// </summary>
/// <remarks>
/// Deliberately a shell in feature 001. It gets its factory, its value objects, and the
/// at-least-one-contact invariant (BR-4.1) in feature 007, where they are specified and
/// tested. What it has now is private setters, so it cannot drift into a mutable bag
/// before then.
/// </remarks>
public sealed class Customer
{
    // EF Core materialises through this. Nothing else should.
    private Customer()
    {
    }

    public Guid Id { get; private set; }

    public string FullName { get; private set; } = null!;

    public string? Email { get; private set; }

    public string? PhoneE164 { get; private set; }

    public string? CompanyName { get; private set; }

    public string? Notes { get; private set; }

    public bool IsActive { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    /// <summary>
    /// SQL Server <c>rowversion</c>. Maintained by the database, never by application
    /// code — ADR-006 as amended by ADR-013.
    /// </summary>
    public byte[] RowVersion { get; private set; } = null!;
    /// <summary>
    /// The only way to create a customer. `007`, BR-4.1 to BR-4.3.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>It takes ALREADY-NORMALISED contact values.</b> The handler calls
    /// <see cref="ContactNormalisation"/> first, because a null return from those methods has to
    /// become a `400` naming a field, and only the boundary knows the field's name. This factory
    /// therefore refuses an un-normalised value rather than normalising it a second time — one
    /// place decides the stored form, and it is not this one.
    /// </para>
    /// <para>
    /// <b>BR-4.1 is enforced here as well as by the validator and by
    /// <c>CK_Customers_Contact</c>.</b> Three layers for one rule looks excessive until the reason
    /// is named for each: the validator produces the `400` with a field name, this makes the
    /// invariant true for every caller including a seeder or an importer, and the check constraint
    /// is what stops a row existing that no code path would have written.
    /// </para>
    /// <para>
    /// <b>No <c>Id</c>, no timestamps and no <c>IsActive</c> parameter.</b> The id is generated
    /// here so it exists before <c>SaveChanges</c>; the timestamps are stamped by
    /// <c>WaslDbContext.SaveChangesAsync</c> — in a loop of their own, because <see cref="Customer"/>
    /// is <b>not</b> an <c>IAuditableEntity</c> and has no actor columns, which is why nothing
    /// stamped them until `007` created the first customer through the application; and
    /// <c>IsActive</c> is set to <c>true</c> explicitly rather than
    /// left to a database default — `001` shipped `HasDefaultValue(true)` here and it was removed,
    /// because EF applies a default whenever the property holds the CLR default and for
    /// <c>bool</c> that is <c>false</c>.
    /// </para>
    /// </remarks>
    /// <param name="normalisedEmail">From <c>ContactNormalisation.Email</c>, or null.</param>
    /// <param name="normalisedPhone">From <c>ContactNormalisation.Phone</c>, or null.</param>
    public static Customer Create(
        string fullName,
        string? normalisedEmail,
        string? normalisedPhone,
        string? companyName = null,
        string? notes = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fullName);

        if (normalisedEmail is null && normalisedPhone is null)
        {
            // BR-4.1. Not a validation exception: the validator has already produced the `400`
            // with both field names by the time a request reaches here, so this is the guard
            // against a caller that is not a request.
            throw new InvalidOperationException(
                "A customer requires an email address or a phone number (BR-4.1). The caller must "
                + "normalise and validate both before calling Create.");
        }

        return new Customer
        {
            Id = Guid.CreateVersion7(),

            // Trimmed but not otherwise touched. A name is displayed verbatim (BR-8.10) and is
            // deliberately NOT part of the duplicate rule (BR-4.6) — two people can share one.
            FullName = fullName.Trim(),
            Email = normalisedEmail,
            PhoneE164 = normalisedPhone,
            CompanyName = string.IsNullOrWhiteSpace(companyName) ? null : companyName.Trim(),
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            IsActive = true,
        };
    }
}