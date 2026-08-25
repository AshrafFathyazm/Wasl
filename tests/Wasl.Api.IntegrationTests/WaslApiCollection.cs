namespace Wasl.Api.IntegrationTests;

/// <summary>
/// One <see cref="WaslApiFactory"/> — and therefore one SQL Server container — shared by every
/// integration test class.
/// </summary>
/// <remarks>
/// <para>
/// <b>This exists because the alternative ran out of memory.</b> <c>IClassFixture</c> creates a
/// fixture instance <i>per test class</i>, so seven classes meant seven containers starting
/// concurrently, each wanting around 2 GB. The suite failed with
/// <c>System.OutOfMemoryException</c> — and the failures landed on unrelated assertions, so it
/// read as a validation bug rather than as resource exhaustion.
/// </para>
/// <para>
/// It was invisible until the whole suite ran together: every class passed under
/// <c>--filter</c>, because one class is one container. That is the shape of the defect worth
/// naming — a green filtered run is not evidence about the suite.
/// </para>
/// <para>
/// <b>The cost is accepted, and it is real:</b> a collection runs its classes sequentially, so
/// the integration suite no longer parallelises across classes. It also means tests share a
/// database, which is why every assertion here scopes itself — by ticket id, by customer id, or
/// by audit action — rather than counting rows in a table. A test that asserted
/// <c>COUNT(*) = 1</c> over the whole of <c>AuditLog</c> would have been fine with one container
/// per class and is wrong now; none does.
/// </para>
/// </remarks>
[CollectionDefinition(Name)]
public sealed class WaslApiCollection : ICollectionFixture<WaslApiFactory>
{
    public const string Name = "Wasl API";
}
