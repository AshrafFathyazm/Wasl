using MediatR;

namespace Wasl.Application.Features.Customers.GetCustomerById;

/// <summary>
/// <c>GET /api/customers/{id}</c>. US-002. `008` AC-1, AC-2, AC-3.
/// </summary>
/// <remarks>
/// Not an <c>ICommand</c> — no transaction, no audit row, structurally.
/// </remarks>
public sealed record GetCustomerByIdQuery(Guid Id) : IRequest<CustomerProfile>;

/// <summary>
/// The full customer record. `008` AC-1.
/// </summary>
/// <remarks>
/// <para>
/// <b>Wider than <c>CustomerListItem</c>, and deliberately so.</b> The profile is where a client
/// needs <c>notes</c>, <c>updatedAtUtc</c> and <c>version</c>: it is one row, it is the edit
/// surface `017` will build on, and `version` is the concurrency token that edit will send back.
/// A list carries none of them — 2000 characters of notes on twenty rows of every page, and an
/// <c>isActive</c> that is always <c>true</c> because the list filters on it.
/// </para>
/// <para>
/// <b><c>IsActive</c> is here and not on the list</b> for the opposite reason: Q-3 says the profile
/// returns an inactive customer, because a ticket may reference one and a `404` would break that
/// link. So the client needs to know, and it can only know if the field is present.
/// </para>
/// </remarks>
public sealed record CustomerProfile(
    Guid Id,
    string FullName,
    string? Email,
    string? Phone,
    string? CompanyName,
    string? Notes,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    string Version);
