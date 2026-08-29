using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Customers.GetCustomerById;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Customers;

namespace Wasl.Application.Features.Customers.CreateCustomer;

/// <summary>
/// BR-4's duplicate rule, the friendly half. `007` AC-1, AC-8 to AC-13.
/// </summary>
/// <remarks>
/// <para>
/// <b>BR-4.8 says the rule is enforced twice, and each half does a different job.</b> The check
/// below produces the `409` that names the conflicting field; the unique index is what makes two
/// simultaneous requests safe. Neither is redundant: without the check a duplicate is a
/// <c>DbUpdateException</c> and therefore a `500`, and without the index two racing requests both
/// pass the check and both insert.
/// </para>
/// <para>
/// <b>The index's violation is translated into the same exception this method throws</b>, in
/// <c>WaslDbContext.SaveChangesAsync</c> — so the loser of a race gets a body identical to the
/// one a sequential duplicate gets. A client cannot tell which of two requests it was, and a
/// difference between the two paths would leak timing (`spec.md` Q-D).
/// </para>
/// </remarks>
internal sealed class CreateCustomerCommandHandler(IApplicationDbContext context)
    : IRequestHandler<CreateCustomerCommand, CustomerProfile>
{
    public async Task<CustomerProfile> Handle(
        CreateCustomerCommand request,
        CancellationToken cancellationToken)
    {
        // BR-4.2, BR-4.3. Normalised once, here, and everything below — the duplicate lookup, the
        // entity, the stored row — uses the same values. Comparing a raw input against a stored
        // normalised one is how a duplicate rule misses the duplicate it exists to catch.
        var email = ContactNormalisation.Email(request.Email);
        var phone = ContactNormalisation.Phone(request.Phone);

        // AC-8, AC-9. Email first and then stop, which the edge-case register asks for: reporting
        // one conflict is enough to act on, and naming both would tell the caller more about a
        // record they were told nothing about.
        //
        // `IsActive` is in both predicates because BR-4.4 and BR-4.5 scope the rule to ACTIVE
        // customers — the same halves the filtered indexes carry, and they have to agree or the
        // check and the index disagree about what a duplicate is.
        if (email is not null && await context.AnyAsync(
            context.Customers.Where(c => c.IsActive && c.Email == email), cancellationToken))
        {
            throw DuplicateCustomer.Email();
        }

        if (phone is not null && await context.AnyAsync(
            context.Customers.Where(c => c.IsActive && c.PhoneE164 == phone), cancellationToken))
        {
            throw DuplicateCustomer.Phone();
        }

        var customer = Customer.Create(
            request.FullName, email, phone, request.CompanyName, request.Notes);

        context.Add(customer);

        // The audit row goes in this transaction too, and the timestamps and actor are stamped
        // here. A unique-index violation surfaces from this call as a DuplicateValueException,
        // translated in WaslDbContext — so the catch that would otherwise be needed here, and the
        // EF Core reference it would require, both stay out of this layer.
        await context.SaveChangesAsync(cancellationToken);

        // AC-14. The same DTO `008`'s GET returns, so the resource at the Location header is
        // byte-identical to this body rather than merely similar.
        return new CustomerProfile(
            customer.Id,
            customer.FullName,
            customer.Email,
            customer.PhoneE164,
            customer.CompanyName,
            customer.Notes,
            customer.IsActive,
            customer.CreatedAtUtc,
            customer.UpdatedAtUtc,
            Convert.ToBase64String(customer.RowVersion));
    }
}

/// <summary>
/// The two duplicate exceptions, built in one place. BR-4.4, BR-4.5, BR-4.7.
/// </summary>
/// <remarks>
/// <b>Here rather than inline, because two call sites raise each of them:</b> this handler's
/// pre-check, and <c>WaslDbContext</c>'s translation of the index violation. Q-D requires the two
/// paths to be indistinguishable to a client, and the cheapest way to guarantee that is for both
/// to call the same method rather than to construct a similar-looking exception each.
/// </remarks>
public static class DuplicateCustomer
{
    /// <summary>The index whose violation means an email collided.</summary>
    public const string EmailIndex = "UX_Customers_Email_Active";

    /// <summary>The index whose violation means a phone collided.</summary>
    public const string PhoneIndex = "UX_Customers_Phone_Active";

    /// <summary>
    /// AC-8, AC-12. Names the field and nothing else.
    /// </summary>
    /// <remarks>
    /// No id, no name, no other detail about the existing customer — BR-4.7. The `409` says which
    /// field collided and stops; `008`'s search is how the caller finds the record, if they are
    /// entitled to.
    /// </remarks>
    public static DuplicateValueException Email() => new(
        DomainErrorCodes.DuplicateCustomer, "email", "Error.Customer.DuplicateEmail");

    /// <summary>AC-10, AC-12.</summary>
    public static DuplicateValueException Phone() => new(
        DomainErrorCodes.DuplicateCustomer, "phone", "Error.Customer.DuplicatePhone");
}
