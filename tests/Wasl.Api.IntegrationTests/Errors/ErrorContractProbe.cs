using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using MediatR;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Api.IntegrationTests.Errors;

/// <summary>
/// A test-only endpoint set that raises each failure mode, so the envelope can be asserted
/// against the frozen contract before any product endpoint exists.
/// </summary>
/// <remarks>
/// <para>
/// These live in the <b>test</b> project and are mapped only by <c>WaslApiFactory</c>. They
/// are not in <c>src/</c> and never ship. The alternative — waiting for `007` to assert the
/// error contract — would mean the contract is unverified for the whole of `002`, which is
/// the feature whose entire job is that contract.
/// </para>
/// <para>
/// This is also the honest answer to "MediatR has no consumer in this feature": it has one
/// here, and it is a test consumer. <c>research.md</c> R-10 says so rather than pretending
/// otherwise.
/// </para>
/// </remarks>
internal static class ErrorContractProbe
{
    public const string DomainRulePath = "/__probe/domain-rule";
    public const string DuplicatePath = "/__probe/duplicate";
    public const string UnregisteredPath = "/__probe/unregistered-code";
    public const string UnhandledPath = "/__probe/unhandled";
    public const string ValidatedPath = "/__probe/validated";

    public static void Map(Microsoft.AspNetCore.Routing.IEndpointRouteBuilder routes)
    {
        // AllowAnonymous, because `004` made RequireAuthenticatedUser the fallback policy and
        // these are test scaffolding rather than product surface. Requiring a token here would
        // make every probe return 401 and would test the fallback instead of the envelope.
        // AC-10 asserts the PRODUCTION anonymous set separately, on a host without these.
        routes = routes.MapGroup(string.Empty).AllowAnonymous();

        routes.MapGet(DomainRulePath, (HttpContext _) =>
            throw new InvariantViolationException("Probe.InvariantBroken"));

        routes.MapGet(DuplicatePath, (HttpContext _) =>
            throw new DuplicateValueException(
                DomainErrorCodes.DuplicateCustomer, "email", "Error.DuplicateCustomer.Title"));

        routes.MapGet(UnregisteredPath, (HttpContext _) =>
            throw new ProbeUnregisteredException());

        routes.MapGet(UnhandledPath, (HttpContext _) =>
            throw new InvalidOperationException(
                @"Probe: an unhandled fault carrying a secret — Password=hunter2; Server=.SQLEXPRESS"));

        routes.MapPost(ValidatedPath, async (ProbeCommand command, ISender sender) =>
            Results.Ok(await sender.Send(command)));
    }
}

/// <summary>A domain exception whose code is deliberately absent from the registry.</summary>
internal sealed class ProbeUnregisteredException()
    : DomainException("probe-code-that-is-not-registered", "Probe.Unregistered");

internal sealed record ProbeCommand(string FullName, string Email) : IRequest<string>;

internal sealed class ProbeCommandHandler : IRequestHandler<ProbeCommand, string>
{
    public static bool WasInvoked { get; private set; }

    public static void Reset() => WasInvoked = false;

    public Task<string> Handle(ProbeCommand request, CancellationToken cancellationToken)
    {
        WasInvoked = true;
        return Task.FromResult("handled");
    }
}

/// <summary>
/// Every message is a symbolic KEY, never a sentence — the rule AC-17 enforces over every
/// registered validator.
/// </summary>
internal sealed class ProbeCommandValidator : AbstractValidator<ProbeCommand>
{
    public ProbeCommandValidator()
    {
        RuleFor(command => command.FullName)
            .NotEmpty().WithMessage("Probe.FullName.Required")
            .MaximumLength(200).WithMessage("Probe.FullName.TooLong");

        // Two rules on one field, so a single field can produce two messages (AC-6).
        RuleFor(command => command.Email)
            .NotEmpty().WithMessage("Probe.Email.Required")
            .EmailAddress().WithMessage("Probe.Email.Invalid");
    }
}
