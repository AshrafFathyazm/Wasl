using System.Reflection;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Application.Common.Behaviours;

namespace Wasl.Application;

/// <summary>
/// One entry point for this layer, mirroring <c>Wasl.Infrastructure.AddInfrastructure</c>.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = Assembly.GetExecutingAssembly();

        services.AddValidatorsFromAssembly(assembly, includeInternalTypes: true);

        services.AddMediatR(configuration =>
        {
            configuration.RegisterServicesFromAssembly(assembly);

            // ── Behaviour order. Registration order IS execution order. ──────────────
            //
            // Written down rather than discovered, because getting it wrong fails
            // quietly: a request that should have been rejected gets audited as an
            // attempt, or a validation failure rolls back a transaction that never
            // needed opening.
            //
            //   1. Validation    reject before anything else happens
            //   2. Transaction   003 — opens AFTER validation, so an invalid request
            //                    never opens one
            //   3. Audit         003 — inside the transaction, so BR-9.3 holds: the
            //                    audit row is absent when the change rolls back
            //
            // 003 inserts its two here, in that order. The slot is commented rather
            // than left to be inferred (AC-20 asserts the final sequence).
            configuration.AddOpenBehavior(typeof(ValidationBehaviour<,>));
        });

        return services;
    }
}
