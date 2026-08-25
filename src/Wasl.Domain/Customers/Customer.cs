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
}
