namespace Wasl.Api.Contracts.Customers;

/// <summary>
/// The body of <c>PUT /api/customers/{id}</c>. `017`'s frozen contract, built by `035`.
/// </summary>
/// <remarks>
/// <para>
/// <b>NO <c>Id</c> HERE.</b> The id comes from the route, and a body that also carried one would
/// give a caller two places to say which customer they mean — and therefore a way to disagree
/// with itself. `CLAUDE.md`'s mass-assignment row lists <c>Id</c> among the server-owned fields
/// for exactly this reason.
/// </para>
/// <para>
/// <b><c>ExpectedVersion</c> is required and has no default.</b> Every other optional field
/// defaults to <c>null</c> because a <c>PUT</c> clears what it omits; this one cannot, because a
/// missing version has to be a `400`. Giving it a default would turn a client that forgot it into
/// a last-write-wins client, and nothing would say so.
/// </para>
/// <para>
/// <b><c>FullName</c> and <c>ExpectedVersion</c> are non-nullable and that is NOT what makes them
/// required.</b> `002c` set
/// <c>SuppressImplicitRequiredAttributeForNonNullableReferenceTypes</c>, so the model binder no
/// longer refuses a missing non-nullable member — the check moved into FluentValidation, where the
/// message is a catalogue key rather than the framework's English. <c>RequiredMemberCoverageTests</c>
/// is what stops that setting turning a missing field into a `500`: it requires every
/// non-nullable member of every command to have a validator rule.
/// </para>
/// </remarks>
public sealed record UpdateCustomerRequest(
    string FullName,
    string ExpectedVersion,
    string? Email = null,
    string? Phone = null,
    string? CompanyName = null,
    string? Notes = null);
