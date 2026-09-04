using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Customers.CreateCustomer;
using Wasl.Application.Features.Customers.GetCustomerById;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Customers;

namespace Wasl.Application.Features.Customers.UpdateCustomer;

/// <summary>
/// `017`'s three ordered checks: the row exists, the version matches, the contacts are free.
/// </summary>
/// <remarks>
/// <para>
/// <b>THE ORDER IS THE FEATURE, and `012` measured why.</b> The version is checked BEFORE the
/// duplicate rule. Swap them and a stale client that also happens to collide gets
/// <c>duplicate-customer</c> — it is told to change the email, does, and its next request is
/// refused for being stale anyway. Two round trips to learn the first fact. The version says
/// "you are looking at an old copy"; nothing else the caller could fix matters until they refetch.
/// </para>
/// <para>
/// <b>The duplicate pre-check EXCLUDES this customer</b> (<c>c.Id != request.Id</c>). Without
/// that, saving a customer without changing their email finds their own row and answers `409` —
/// the endpoint would refuse every no-op save. BR-4.4 and BR-4.5 scope the rule to a
/// <b>different</b> active customer, and the filtered unique indexes exclude the row being
/// updated for free, so only this pre-check needs to be told.
/// </para>
/// <para>
/// <b>The <c>409</c>s come from <see cref="DuplicateCustomer"/>, `007`'s pair</b> — not from a
/// similar-looking exception constructed here. Q-D requires the pre-check's answer and the index
/// violation's translated answer to be indistinguishable to a client, and two call sites of one
/// method is the only way to guarantee that.
/// </para>
/// </remarks>
internal sealed class UpdateCustomerCommandHandler(IApplicationDbContext context)
    : IRequestHandler<UpdateCustomerCommand, CustomerProfile>
{
    public async Task<CustomerProfile> Handle(
        UpdateCustomerCommand request,
        CancellationToken cancellationToken)
    {
        // TRACKED, unlike `008`'s read: this one is going to be mutated. A projection would be
        // cheaper and could not be saved.
        var customer = await context.FirstOrDefaultAsync(
            context.Customers.Where(c => c.Id == request.Id), cancellationToken)
            ?? throw new NotFoundException("Error.Customer.NotFound");

        // CHECK ONE. See the note above on why it precedes the duplicate rule.
        //
        // `Convert.FromBase64String` cannot throw here: the validator ran first, capped the length
        // and proved the string decodes. That ordering is asserted, not assumed — a malformed
        // token is a `400` from the validator, never an exception from this line.
        if (!customer.RowVersion.AsSpan().SequenceEqual(
            Convert.FromBase64String(request.ExpectedVersion)))
        {
            throw new ConcurrencyConflictException();
        }

        // BR-4.2, BR-4.3. Normalised once, and everything below uses these values — the lookup,
        // the entity, the stored row. Comparing a raw input against a stored normalised one is how
        // a duplicate rule misses the duplicate it exists to catch (`007`).
        var email = ContactNormalisation.Email(request.Email);
        var phone = ContactNormalisation.Phone(request.Phone);

        // CHECK TWO. Email first and then stop — one conflict is enough to act on, and naming both
        // tells the caller more about a record they were told nothing about (BR-4.7).
        if (email is not null && await context.AnyAsync(
            context.Customers.Where(c => c.IsActive && c.Id != request.Id && c.Email == email),
            cancellationToken))
        {
            throw DuplicateCustomer.Email();
        }

        if (phone is not null && await context.AnyAsync(
            context.Customers.Where(c => c.IsActive && c.Id != request.Id && c.PhoneE164 == phone),
            cancellationToken))
        {
            throw DuplicateCustomer.Phone();
        }

        // BR-4.1 is enforced inside this call as well as by the validator and by
        // CK_Customers_Contact — three layers, each with its own reason, exactly as `007` recorded
        // them for the factory.
        customer.Update(request.FullName, email, phone, request.CompanyName, request.Notes);

        // The audit row goes in this transaction, and `UpdatedAtUtc` plus the actor are stamped
        // here. A unique-index violation surfaces as a DuplicateValueException, translated in
        // WaslDbContext — so no catch and no EF Core reference is needed in this layer.
        await context.SaveChangesAsync(cancellationToken);

        // A NEW version, and the contract requires it to be immediately usable as the next
        // `expectedVersion` (AC-23). `SaveChangesAsync` refreshes `RowVersion` from the database,
        // so this reads the value the row now carries rather than the one it arrived with — which
        // is why this projection is built after the save and not before it.
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
