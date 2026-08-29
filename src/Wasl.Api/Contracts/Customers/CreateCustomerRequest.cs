namespace Wasl.Api.Contracts.Customers;

/// <summary>
/// The request body, exactly as `contracts/customers-api.md` freezes it. `007`.
/// </summary>
/// <remarks>
/// <para>
/// <b>What is missing is the specification.</b> There is no <c>id</c>, no <c>isActive</c>, no
/// <c>createdAtUtc</c> and no <c>version</c> — `CLAUDE.md`'s mass-assignment row names all four as
/// server-owned, and the way to make a field unsettable is for it not to exist on the type a
/// client binds to. A check that rejects them would be a check somebody can forget; an absent
/// property cannot be forgotten.
/// </para>
/// <para>
/// <c>phone</c> on the wire, <c>PhoneE164</c> in the entity: the contract names the field for the
/// client and the entity names the format for the reader.
/// </para>
/// <para>
/// Both contact fields are optional <b>individually</b> and BR-4.1 requires one of them, which is
/// a rule about the pair and therefore lives in the validator — a nullable property cannot express
/// "at least one of these two".
/// </para>
/// </remarks>
public sealed record CreateCustomerRequest(
    string FullName,
    string? Email = null,
    string? Phone = null,
    string? CompanyName = null,
    string? Notes = null);
