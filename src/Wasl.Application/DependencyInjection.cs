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

            // ── No behaviour is registered here. Removed by 003, for a reason. ────────
            //
            // `002` registered ValidationBehaviour on this line, and the comment that
            // was here reserved the next two slots for 003 — which was the right
            // instinct while one project did the registering, and not enough once two
            // did.
            //
            // MediatR orders behaviours by REGISTRATION order, and Program.cs calls
            // AddInfrastructure BEFORE AddApplication. So 003's two behaviours,
            // registered in their own project, would have landed ahead of this one:
            // Transaction → Audit → Validation. A 400 would then open a transaction and
            // write an audit row for every mistyped form — breaking spec.md Q-3 and
            // AC-15 with nothing thrown and a green suite. That inversion was observed,
            // not deduced (003 research.md R-15).
            //
            // All three now live in ONE ordered list, in
            // src/Wasl.Api/Common/WaslPipeline.cs, which AC-15 asserts against. This
            // method keeps what belongs to it: handler discovery and validators.
        });

        return services;
    }
}
