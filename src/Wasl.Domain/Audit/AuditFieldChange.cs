namespace Wasl.Domain.Audit;

/// <summary>
/// One element of the <c>Changes</c> array: a single field that actually changed value.
/// </summary>
/// <remarks>
/// <para>
/// The JSON envelope is <c>entity</c>, <c>id</c>, <c>field</c>, <c>before</c>, <c>after</c> —
/// lowercase and fixed, because `019` reads them and BR-8.7 puts machine-readable keys
/// outside localisation. The serialiser owns that naming; this type owns the shape.
/// </para>
/// <para>
/// <see cref="Field"/> is the CLR property name, unchanged. It is an identifier, not a label:
/// translating it would make the stored data locale-dependent, which is the same mistake as
/// localising an enum value.
/// </para>
/// <para>
/// <b>Values are strings, including for numbers and dates.</b> The column is one JSON
/// document over many entity types, so a typed representation would need the reader to know
/// each field's CLR type before it could parse the row — and `019` reads with
/// <c>OPENJSON</c>. <c>null</c> stays <c>null</c> and never becomes <c>""</c>: on a create,
/// <c>before: null</c> is meaningful.
/// </para>
/// </remarks>
public sealed record AuditFieldChange(string Entity, Guid? Id, string Field, string? Before, string? After);
