using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Application.Features.Customers.GetCustomerById;

/// <summary>
/// One customer, by id. `008` AC-1, AC-2.
/// </summary>
internal sealed class GetCustomerByIdQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetCustomerByIdQuery, CustomerProfile>
{
    public async Task<CustomerProfile> Handle(
        GetCustomerByIdQuery request,
        CancellationToken cancellationToken)
    {
        // No IsActive filter, and that is Q-3 rather than an omission: a ticket can reference a
        // deactivated customer, and answering 404 would break that link — the ticket would show a
        // customer the API says does not exist. The list filters (Q-1); the profile does not.
        var customer = await context.FirstOrDefaultAsync(
            context.Customers
                .Where(candidate => candidate.Id == request.Id)
                .Select(candidate => new CustomerProfile(
                    candidate.Id,
                    candidate.FullName,
                    candidate.Email,
                    candidate.PhoneE164,
                    candidate.CompanyName,
                    candidate.Notes,
                    candidate.IsActive,
                    candidate.CreatedAtUtc,
                    candidate.UpdatedAtUtc,

                    // Base64 rowversion, the same token `011` and `012` accept back as
                    // expectedVersion. Projected here so `017` needs no second read to edit.
                    Convert.ToBase64String(candidate.RowVersion))),
            cancellationToken);

        // AC-2. The message key names no id and no field — the same choice BR-4.4 forces for
        // duplicates, and the reason is the same: a 404 that distinguishes "no such customer" from
        // "a customer you may not see" is an enumeration oracle. There is no visibility rule here
        // (A-2), so nothing is being hidden today; the shape is what stops that changing quietly.
        return customer ?? throw new NotFoundException("Error.Customer.NotFound");
    }
}
