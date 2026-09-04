using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Wasl.Api.Common.Auth;
using Wasl.Api.Common.Errors;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Api.Common.RateLimiting;

/// <summary>
/// The general write limit. `036` §3.4, AC-11 to AC-14.
/// </summary>
/// <remarks>
/// <para>
/// <b>`004b` throttles one action; this throttles the rest, and the two are deliberately
/// separate.</b> `CLAUDE.md` recorded the split before either existed: *`429` is on that one
/// action, not on the API. A general rate limit is a different feature with different numbers.*
/// The sign-in throttle counts FAILURES per <c>(address, email)</c> pair over five minutes and
/// exists to slow credential guessing. This counts REQUESTS per caller over one minute and
/// exists so a retry loop cannot exhaust the database. Different signal, different window,
/// different reason.
/// </para>
/// <para>
/// <b>Writes only (Q-4, ruled 2026-09-05).</b> A read costs a query; a write costs a
/// transaction, a sequence value, an audit row and a history row, and it is the only kind of
/// request that leaves something behind. Limiting reads as well was the alternative and was
/// turned down for a measured reason rather than a principle: nothing in this product paginates
/// by polling, so a read limit has no legitimate load to calibrate against — and a limit
/// calibrated against nothing is a `429` on a real session waiting to happen.
/// </para>
/// <para>
/// <b>Partitioned per authenticated user, falling back to the address.</b> The `004b` lesson
/// applies in reverse here: keying an office behind one NAT address by address alone would let
/// one busy agent throttle their colleagues. Every write endpoint is behind
/// <c>RequireAuthenticatedUser</c>, so the fallback is reached only by a request that is about
/// to be refused with a `401` anyway.
/// </para>
/// </remarks>
internal static class WriteRateLimiting
{
    /// <summary>
    /// Writes permitted per caller per <see cref="Window"/>, when configuration says nothing.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Deliberately far above what a screen can produce.</b> The busiest real interaction in
    /// the product is a support user working a ticket — a status change, an assignment, a comment,
    /// a couple of tags — which is single digits per minute. Sixty leaves an order of magnitude of
    /// headroom, so a `429` here means a loop, not a person. `036` Q-4's working assumption:
    /// *a limit high enough that no legitimate screen reaches it.*
    /// </para>
    /// <para>
    /// <b>And that assumption was WRONG for one caller, which is why this is configurable.</b>
    /// The first full run after the limiter went in failed 174 tests: the integration suite
    /// drives every write in the product as two seeded users inside one minute, so it is a
    /// legitimate client that vastly exceeds any human rate. A fixed constant would have left two
    /// options — weaken the limit until the suite fits under it, or stop testing the suite's own
    /// endpoints — and both are the tail wagging the dog. See <see cref="ConfigurationKey"/>.
    /// </para>
    /// </remarks>
    public const int DefaultWritesPerWindow = 60;

    /// <summary>
    /// <c>RateLimit:WritesPerWindow</c>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Configuration, not a compile-time constant, and the reason is not test convenience.</b>
    /// The right number depends on who is calling: a human at a screen, a bulk importer, and a
    /// test host driving the whole product in one minute are three different legitimate rates,
    /// and only deployment knows which is in front of it. `004b`'s sign-in numbers are hard-coded
    /// because ten failed sign-ins in five minutes means the same thing everywhere; a write rate
    /// does not.
    /// </para>
    /// <para>
    /// <b>It has a DEFAULT, unlike the five secrets.</b> `004`'s rule — a secret has no default
    /// and the host refuses to start without it — is about values that are dangerous when guessed.
    /// A missing limit is not dangerous, and refusing to start over one would make the limiter a
    /// deployment hazard rather than a protection.
    /// </para>
    /// </remarks>
    public const string ConfigurationKey = "RateLimit:WritesPerWindow";

    public static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    /// <summary>
    /// The one endpoint this limiter does not touch. AC-12.
    /// </summary>
    /// <remarks>
    /// <b>`POST /api/auth/token` keeps `004b`'s throttle and only that one.</b> It is
    /// unauthenticated, so this limiter would partition it by address — and AC-37 exists because
    /// an office behind one NAT address must not be locked out by its own sign-ins. `004b`
    /// measured that and settled on the <c>(address, email)</c> pair for exactly this reason;
    /// layering an address-only limit on top would reintroduce the failure the pair was chosen
    /// to avoid.
    /// </remarks>
    public const string SignInPath = "/api/auth/token";

    public static IServiceCollection AddWaslRateLimiting(
        this IServiceCollection services, IConfiguration configuration)
    {
        // Read ONCE at startup, not per request. A limit that could change under a running
        // partition would replenish against one number and refuse against another.
        var permits = configuration.GetValue<int?>(ConfigurationKey) ?? DefaultWritesPerWindow;

        if (permits < 1)
        {
            // Zero would refuse every write in the product with a `429` that no client could ever
            // clear, and a negative value throws inside the limiter with no mention of the setting
            // that caused it. Fail at startup naming the key, the same shape as `004`'s guards.
            throw new InvalidOperationException(
                $"{ConfigurationKey} must be at least 1. A limit of {permits} refuses every write.");
        }

        return services.AddRateLimiter(options =>
        {
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(
                context => Partition(context, permits));

            // ── AC-14. The `429` is enveloped and localized like every other error ──────
            //
            // A limiter rejects by writing a status and stopping, exactly as routing does for a
            // `404` — so nothing is thrown, UseExceptionHandler is never entered, and the default
            // response is an EMPTY body. That is `002b`'s finding arriving on a new path, and the
            // shape it produces passes every status assertion while `code === 'rate-limited'`
            // stays false forever.
            //
            // It is answered by going through the SAME producer as everything else: build the
            // envelope from a RateLimitedException and hand it to IProblemDetailsService. Not a
            // hand-built JSON body here — `002` AC-2 is that there is exactly one producer, and a
            // second one that looks right is how that stops being true without any test noticing.
            options.OnRejected = async (context, cancellationToken) =>
            {
                var http = context.HttpContext;
                var seconds = RetryAfterFor(context.Lease);

                http.Response.Headers.RetryAfter =
                    seconds.ToString(CultureInfo.InvariantCulture);

                var factory = http.RequestServices.GetRequiredService<ProblemDetailsFactory>();
                var writer = http.RequestServices.GetRequiredService<IProblemDetailsService>();

                // The general message, not `004b`'s. The `type` is shared on purpose — a client
                // backs off identically for both — but "too many failed sign-in attempts" shown
                // to a Manager who has been creating tickets all morning is simply false.
                var exception = new RateLimitedException(
                    seconds, messageKey: "Error.RateLimited.TooManyRequests");

                var problem = factory.FromDomainException(http, exception);

                http.Response.StatusCode = problem.Status ?? StatusCodes.Status429TooManyRequests;

                await writer.TryWriteAsync(new ProblemDetailsContext
                {
                    HttpContext = http,
                    ProblemDetails = problem,
                });
            };
        });
    }

    /// <summary>
    /// One partition per caller for a write; no limiter at all for anything else.
    /// </summary>
    /// <remarks>
    /// <c>GetNoLimiter</c> rather than a very high limit for reads: a limiter that never rejects
    /// still allocates a partition per caller and still has to be reasoned about. AC-13 asserts
    /// <c>/health</c> in particular, which a load balancer polls and which must never be refused.
    /// </remarks>
    private static RateLimitPartition<string> Partition(HttpContext context, int permits)
    {
        if (!IsWrite(context) || IsExempt(context))
        {
            return RateLimitPartition.GetNoLimiter("unlimited");
        }

        // WaslJwtClaimNames.Subject, read through the same accessor every other component uses,
        // so a change to how identity is read cannot leave this one behind reading a stale claim.
        var caller = context.RequestServices.GetRequiredService<ICurrentUser>().UserId?.ToString()
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "unknown";

        return RateLimitPartition.GetFixedWindowLimiter(caller, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permits,
            Window = Window,

            // No queue. A queued write is a request held open against a database connection,
            // which is the resource this limit exists to protect — queueing would convert a
            // fast `429` into a slow `200` and make the limit self-defeating under exactly the
            // load it is for.
            QueueLimit = 0,
            AutoReplenishment = true,
        });
    }

    private static bool IsWrite(HttpContext context) =>
        HttpMethods.IsPost(context.Request.Method)
        || HttpMethods.IsPut(context.Request.Method)
        || HttpMethods.IsPatch(context.Request.Method)
        || HttpMethods.IsDelete(context.Request.Method);

    private static bool IsExempt(HttpContext context) =>
        context.Request.Path.StartsWithSegments(SignInPath, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Seconds until the window replenishes.
    /// </summary>
    /// <remarks>
    /// From the lease when the limiter supplies it, and from the window otherwise — never zero.
    /// `004b`'s rule, and the reason is the same: a <c>Retry-After</c> of zero invites the
    /// immediate retry the header exists to prevent.
    /// </remarks>
    private static int RetryAfterFor(RateLimitLease lease) =>
        lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
            ? Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds))
            : Math.Max(1, (int)Math.Ceiling(Window.TotalSeconds));
}
