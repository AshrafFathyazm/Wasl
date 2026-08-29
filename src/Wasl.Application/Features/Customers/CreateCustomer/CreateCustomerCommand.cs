using Wasl.Application.Common.Messaging;
using Wasl.Application.Features.Customers.GetCustomerById;
using Wasl.Domain.Audit;

namespace Wasl.Application.Features.Customers.CreateCustomer;

/// <summary>
/// <c>POST /api/customers</c>. US-001, BR-4. `007`.
/// </summary>
/// <remarks>
/// <para>
/// <b>No <c>Id</c>, no <c>isActive</c>, no timestamps.</b> All four are server-owned —
/// `CLAUDE.md`'s mass-assignment row lists them by name. The id is generated in the factory, the
/// timestamps and the actor are stamped in <c>SaveChangesAsync</c>, and <c>IsActive</c> is set to
/// <c>true</c> by the factory because `017` is the feature that changes it.
/// </para>
/// <para>
/// <b>Returns <see cref="CustomerProfile"/> — `008`'s DTO, not a new one.</b> The contract says a
/// `GET` on the <c>Location</c> returns the same resource (AC-14), so the two shapes must be
/// identical, and the cheapest way to guarantee that is for them to be the same type. A second
/// record would be a second thing to keep in step, which is what `012` and `013` both declined.
/// </para>
/// </remarks>
public sealed record CreateCustomerCommand(
    string FullName,
    string? Email = null,
    string? Phone = null,
    string? CompanyName = null,
    string? Notes = null) : IAuditableCommand<CustomerProfile>
{
    /// <summary><c>Customer.Created</c>, from BR-9's naming table.</summary>
    public string AuditAction => "Customer.Created";

    /// <summary>
    /// The customer, on success — and on failure, the <b>name</b> and nothing else.
    /// </summary>
    /// <remarks>
    /// <para>
    /// A failed create has no id, so the label is the only thing that can identify the attempt.
    /// The full name is the right choice for it: it is what a person searching the audit log
    /// would type, and it is already not a secret — BR-4.6 says two customers may share one.
    /// </para>
    /// <para>
    /// <b>Never the email or the phone.</b> A rejected duplicate would otherwise write the
    /// contact details of a person the caller was told nothing about — BR-4.7 keeps them out of
    /// the `409` body, and the audit row is the other place they could have leaked.
    /// </para>
    /// </remarks>
    public AuditTarget DescribeTarget(CustomerProfile? response) =>
        new("Customer", response?.Id, FullName);
}
