using MediatR;
using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Common.Messaging;
using Wasl.Domain.Audit;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Customers;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Audit.Probe;

/// <summary>
/// The commands and query that give `003`'s pipeline a real consumer. `research.md` R-12.
/// </summary>
/// <remarks>
/// <para>
/// Test project only, mapped onto the test host. <c>Wasl.Api</c> gains no endpoint, no command,
/// and no dead type — a <c>Development</c>-only probe endpoint in <c>src/</c> was rejected
/// because a route that exists in one environment is a route promoted by accident.
/// </para>
/// <para>
/// They mutate a <c>Customer</c>, because <c>Customers</c> is the only business table that
/// exists at Phase 0.
/// </para>
/// </remarks>
internal sealed record SucceedingProbeCommand(Guid CustomerId, string NewCompanyName)
    : IAuditableCommand<ProbeResult>
{
    public string AuditAction => "Customer.ProbeSucceeded";

    /// <summary>
    /// Reads the id from the response when there is one, and falls back to the command's own
    /// field when there is not — the shape `research.md` R-8 requires so a denied command still
    /// names its target.
    /// </summary>
    public AuditTarget DescribeTarget(ProbeResult? response) =>
        new("Customer", response?.CustomerId ?? CustomerId, response?.Label ?? "probe-customer");
}

/// <summary>Mutates, then throws. AC-9: the row survives, the mutation does not.</summary>
internal sealed record FailingProbeCommand(Guid CustomerId) : IAuditableCommand<ProbeResult>
{
    public string AuditAction => "Customer.ProbeFailed";

    public AuditTarget DescribeTarget(ProbeResult? response) =>
        new("Customer", CustomerId, "probe-customer");
}

/// <summary>
/// Throws a <c>forbidden</c>-coded domain exception. AC-8 — the half that is invisible when
/// wrong.
/// </summary>
internal sealed record DeniedProbeCommand(Guid CustomerId) : IAuditableCommand<ProbeResult>
{
    public string AuditAction => "Customer.ProbeDenied";

    public AuditTarget DescribeTarget(ProbeResult? response) =>
        new("Customer", CustomerId, "probe-customer");
}

/// <summary>
/// Sets a property to the value it already holds. AC-18 — a no-op write must produce no entry.
/// </summary>
internal sealed record NoOpProbeCommand(Guid CustomerId) : IAuditableCommand<ProbeResult>
{
    public string AuditAction => "Customer.ProbeNoOp";

    public AuditTarget DescribeTarget(ProbeResult? response) =>
        new("Customer", CustomerId, "probe-customer");
}

/// <summary>
/// Saves twice. The accumulator must merge both diffs into one document and one row (AC-25).
/// </summary>
internal sealed record TwiceSavingProbeCommand(Guid CustomerId) : IAuditableCommand<ProbeResult>
{
    public string AuditAction => "Customer.ProbeSavedTwice";

    public AuditTarget DescribeTarget(ProbeResult? response) =>
        new("Customer", CustomerId, "probe-customer");
}

/// <summary>
/// Not an <see cref="ICommand"/>. AC-16 — a query opens no transaction and writes no row.
/// </summary>
internal sealed record ProbeQuery : IRequest<ProbeResult>;

internal sealed record ProbeResult(Guid CustomerId, string Label, bool HadTransaction);

internal sealed class SucceedingProbeHandler(WaslDbContext context)
    : IRequestHandler<SucceedingProbeCommand, ProbeResult>
{
    public async Task<ProbeResult> Handle(SucceedingProbeCommand request, CancellationToken cancellationToken)
    {
        var customer = await context.Customers.SingleAsync(c => c.Id == request.CustomerId, cancellationToken);

        CustomerProbeWriter.SetCompanyName(customer, request.NewCompanyName);
        await context.SaveChangesAsync(cancellationToken);

        return new ProbeResult(customer.Id, customer.FullName, context.Database.CurrentTransaction is not null);
    }
}

internal sealed class FailingProbeHandler(WaslDbContext context)
    : IRequestHandler<FailingProbeCommand, ProbeResult>
{
    public async Task<ProbeResult> Handle(FailingProbeCommand request, CancellationToken cancellationToken)
    {
        var customer = await context.Customers.SingleAsync(c => c.Id == request.CustomerId, cancellationToken);

        CustomerProbeWriter.SetCompanyName(customer, "this must not survive");
        await context.SaveChangesAsync(cancellationToken);

        // Thrown AFTER a committed-to-the-transaction change, which is what makes AC-9 a real
        // assertion: the row must exist and the mutation must not.
        throw new InvalidOperationException("Probe.FailedAfterMutating");
    }
}

internal sealed class DeniedProbeHandler(WaslDbContext context)
    : IRequestHandler<DeniedProbeCommand, ProbeResult>
{
    public async Task<ProbeResult> Handle(DeniedProbeCommand request, CancellationToken cancellationToken)
    {
        var customer = await context.Customers.SingleAsync(c => c.Id == request.CustomerId, cancellationToken);

        CustomerProbeWriter.SetCompanyName(customer, "this must not survive either");
        await context.SaveChangesAsync(cancellationToken);

        // A data-dependent denial raised inside the handler — BR-6's "is this user the
        // assignee?" shape. This is the only kind of denial the pipeline can see, because a
        // middleware 403 throws nothing (spec.md Q-4).
        throw new ForbiddenProbeException();
    }
}

internal sealed class NoOpProbeHandler(WaslDbContext context)
    : IRequestHandler<NoOpProbeCommand, ProbeResult>
{
    public async Task<ProbeResult> Handle(NoOpProbeCommand request, CancellationToken cancellationToken)
    {
        var customer = await context.Customers.SingleAsync(c => c.Id == request.CustomerId, cancellationToken);

        // Assigned, so EF marks the property Modified — with an identical value. AC-18 is
        // about the diff comparing values rather than trusting the flag.
        CustomerProbeWriter.SetCompanyName(customer, customer.CompanyName);
        await context.SaveChangesAsync(cancellationToken);

        return new ProbeResult(customer.Id, customer.FullName, true);
    }
}

internal sealed class TwiceSavingProbeHandler(WaslDbContext context)
    : IRequestHandler<TwiceSavingProbeCommand, ProbeResult>
{
    public async Task<ProbeResult> Handle(TwiceSavingProbeCommand request, CancellationToken cancellationToken)
    {
        var customer = await context.Customers.SingleAsync(c => c.Id == request.CustomerId, cancellationToken);

        CustomerProbeWriter.SetCompanyName(customer, "first save");
        await context.SaveChangesAsync(cancellationToken);

        CustomerProbeWriter.SetNotes(customer, "second save");
        await context.SaveChangesAsync(cancellationToken);

        return new ProbeResult(customer.Id, customer.FullName, true);
    }
}

internal sealed class ProbeQueryHandler(WaslDbContext context) : IRequestHandler<ProbeQuery, ProbeResult>
{
    public Task<ProbeResult> Handle(ProbeQuery request, CancellationToken cancellationToken) =>
        // The assertion is the flag: a query must observe no ambient transaction, because
        // TransactionBehaviour's constraint excludes it (AC-16).
        Task.FromResult(new ProbeResult(
            Guid.Empty, "query", context.Database.CurrentTransaction is not null));
}

/// <summary>
/// A denial the classifier must map to <c>Denied</c> rather than <c>Failed</c>.
/// </summary>
internal sealed class ForbiddenProbeException()
    : DomainException(DomainErrorCodes.Forbidden, "Probe.Forbidden");

/// <summary>
/// Sets private-setter properties on <c>Customer</c>.
/// </summary>
/// <remarks>
/// <c>Customer</c> is a shell until `007` gives it a factory and its invariants, so there is
/// no legitimate way to change it yet. Reflection here is confined to the test project and to
/// this one class — the alternative was adding a public mutator to a domain entity for a
/// test's benefit, which is how an entity becomes a bag.
/// </remarks>
internal static class CustomerProbeWriter
{
    public static void SetCompanyName(Customer customer, string? value) =>
        Set(customer, nameof(Customer.CompanyName), value);

    public static void SetNotes(Customer customer, string? value) =>
        Set(customer, nameof(Customer.Notes), value);

    private static void Set(Customer customer, string property, object? value) =>
        typeof(Customer).GetProperty(property)!.SetValue(customer, value);
}
