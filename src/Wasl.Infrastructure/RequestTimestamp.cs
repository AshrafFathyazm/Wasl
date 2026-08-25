using Wasl.Application.Common.Abstractions;

namespace Wasl.Infrastructure;

/// <summary>
/// Reads <c>TimeProvider</c> once, on first access, and returns that value for the rest of the
/// scope.
/// </summary>
/// <remarks>
/// <para>
/// Registered <b>scoped</b>, which is what makes one scope one instant. Lazily rather than in
/// the constructor, so a request that writes no timestamp never reads the clock.
/// </para>
/// <para>
/// <b>The limit, stated because it is invisible:</b> a scope that lives a long time sees a
/// frozen clock. Nothing in this codebase has one — every scope is a request — but a hosted
/// service or a long-running consumer would need its own scope per unit of work, which is the
/// normal shape for those anyway. It is written here so the first person to add one meets the
/// constraint rather than a stale timestamp.
/// </para>
/// </remarks>
internal sealed class RequestTimestamp(TimeProvider clock) : IRequestTimestamp
{
    private DateTimeOffset? _captured;

    public DateTimeOffset UtcNow => _captured ??= clock.GetUtcNow();
}
