using Wasl.Application.Common.Messaging;
using Wasl.Application.Features.Customers.GetCustomerById;
using Wasl.Domain.Audit;

namespace Wasl.Application.Features.Customers.UpdateCustomer;

/// <summary>
/// <c>PUT /api/customers/{id}</c>. `017`'s frozen contract, built by `035`.
/// </summary>
/// <remarks>
/// <para>
/// <b>IT REPLACES; IT DOES NOT MERGE.</b> The contract says so in words, and it names the
/// consequence: an omitted or <c>null</c> optional field is <b>cleared</b>, so
/// <c>{ fullName, email, expectedVersion }</c> alone sets phone, company and notes to
/// <c>null</c>. That is "the only failure on this endpoint that produces no error at all: the
/// request succeeds, returns <c>200</c>, and four fields are gone."
/// </para>
/// <para>
/// <b><c>PATCH</c> is deliberately not offered</b> — `017` <c>plan.md</c>, Risks. A merge
/// endpoint cannot distinguish "leave it alone" from "clear it" without a second convention on
/// the wire, and the screen that consumes this always holds every field anyway.
/// </para>
/// <para>
/// <b>No <c>Id</c> in the body, no <c>isActive</c>, no timestamps, no <c>version</c>.</b> The id
/// comes from the route; the rest are server-owned and are on `CLAUDE.md`'s mass-assignment list
/// by name. <c>ExpectedVersion</c> is the one version-shaped field a client may send, and it is
/// an assertion about what the client READ rather than a value it wants stored.
/// </para>
/// <para>
/// <b>Returns <see cref="CustomerProfile"/> — `008`'s DTO, the same one create returns.</b> The
/// contract requires the response to be the full resource with a NEW version that is immediately
/// usable as the next <c>expectedVersion</c> (AC-23), and the cheapest way to keep three shapes
/// identical is for them to be one type.
/// </para>
/// </remarks>
public sealed record UpdateCustomerCommand(
    Guid Id,
    string FullName,
    string ExpectedVersion,
    string? Email = null,
    string? Phone = null,
    string? CompanyName = null,
    string? Notes = null) : IAuditableCommand<CustomerProfile>
{
    /// <summary><c>Customer.Updated</c>, from BR-9's naming table.</summary>
    public string AuditAction => "Customer.Updated";

    /// <summary>
    /// The customer being updated, identified by id and name.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The id is known here, unlike on a create — the route carries it — so it is used even when
    /// the command fails. A denial or a conflict is worth an audit row that names WHICH customer
    /// somebody tried to change.
    /// </para>
    /// <para>
    /// <b>The label is the name from the REQUEST, not from the stored row.</b> On a successful
    /// update they are the same; on a rejected one the request's name is what the actor typed,
    /// which is the fact the row is recording. Reading the stored row here would also mean a
    /// query inside a description.
    /// </para>
    /// <para>
    /// <b>Never the email or the phone</b>, for the reason `007` recorded: a rejected duplicate
    /// would otherwise write the contact details of a person the caller was told nothing about
    /// (BR-4.7).
    /// </para>
    /// </remarks>
    public AuditTarget DescribeTarget(CustomerProfile? response) =>
        new("Customer", Id, FullName);
}
