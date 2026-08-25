namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// The addressed resource does not exist. Mapped to <c>404 errors/not-found</c> by `002`'s
/// factory.
/// </summary>
/// <remarks>
/// <para>
/// <b>Added by `009`, and `002` had already prepared for it.</b> `002` shipped
/// <c>DomainErrorCodes.NotFound</c> and its registry row but no exception type, because nothing
/// could raise one — there was no resource to address. `009` is the first feature that can:
/// AC-4's unknown <c>customerId</c>.
/// </para>
/// <para>
/// <b>It carries no identifier and no entity name in its message key.</b> A `404` that
/// distinguishes "no such customer" from "a customer you are not permitted to see" is an
/// enumeration oracle — BR-4.4 makes the same choice for duplicates, where the response names
/// the field and nothing else. The key is chosen by the caller so it can say
/// <c>Error.Ticket.CustomerNotFound</c> without the response ever containing an id.
/// </para>
/// </remarks>
public sealed class NotFoundException(string messageKey, params object[] messageArguments)
    : DomainException(DomainErrorCodes.NotFound, messageKey, messageArguments);
