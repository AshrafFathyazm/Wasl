using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Users;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Infrastructure.Persistence.Seed;

/// <summary>
/// The two users the application signs in with: one Manager, one Agent. `004` AC-13, AC-14.
/// </summary>
/// <remarks>
/// <para>
/// <b>Two, not a user-management screen.</b> `004`'s scope is deliberately the backend half —
/// there is no create-user endpoint, so these two rows are the entire identity store, and BR-2
/// needs exactly one of each role to be demonstrable.
/// </para>
/// <para>
/// <b>Idempotent by email, and by the unique index underneath it.</b> The <c>Any</c> check is the
/// fast path; <c>UX_SupportUsers_Email</c> is what makes two instances starting at the same
/// instant safe, because the second insert fails rather than producing a duplicate identity
/// (`spec.md` edge case: concurrent startup).
/// </para>
/// <para>
/// <b>The second run must not rewrite the hashes.</b> PBKDF2 salts per call, so re-hashing the
/// same password produces a different value — a "seed" that updated would invalidate nothing
/// visible and would make AC-13's "unchanged by the second run" assertion the only way to notice.
/// </para>
/// <para>
/// <b>The Manager's name is Arabic and their language is <c>ar</c>, deliberately.</b> It makes
/// AC-23's <c>nvarchar</c> round-trip a fact of the demo data rather than a test fixture, and it
/// gives the frontend a user whose stored preference is Arabic to prove AC-30 against.
/// </para>
/// <para>
/// <b>Public, unlike <c>DemoSeeder</c>.</b> The integration host calls it so the auth suite signs
/// in against the same two rows a demo does — a test-only fixture would prove a fixture works.
/// </para>
/// </remarks>
public static class SupportUserSeeder
{
    public const string ManagerEmail = "manager@wasl.local";
    public const string AgentEmail = "agent@wasl.local";

    /// <summary>
    /// A second Agent, added by `011`. Makes BR-2.3's "someone else" a colleague rather than a
    /// Manager, which is the only way AC-4 tests the rule that actually fires in production.
    /// </summary>
    public const string AgentTwoEmail = "agent2@wasl.local";

    public static async Task SeedAsync(IServiceProvider services, CancellationToken ct = default)
    {
        using var scope = services.CreateScope();

        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();
        var options = scope.ServiceProvider.GetRequiredService<SeedOptions>();
        var passwords = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();

        var now = clock.GetUtcNow().UtcDateTime;
        var inserted = 0;

        inserted += await AddIfAbsentAsync(
            context, "منى العتيبي", ManagerEmail, options.ManagerPassword,
            SupportRole.Manager, "ar", passwords, now, ct);

        inserted += await AddIfAbsentAsync(
            context, "Omar Khalid", AgentEmail, options.AgentPassword,
            SupportRole.Agent, "en", passwords, now, ct);

        inserted += await AddIfAbsentAsync(
            context, "نورة السالم", AgentTwoEmail, options.AgentTwoPassword,
            SupportRole.Agent, "ar", passwords, now, ct);

        if (inserted > 0)
        {
            // Straight through the DbContext, not through the pipeline. Seeding a user is not a
            // command any actor issues — there is no endpoint for it and no ICurrentUser at
            // startup — so there is no actor an audit row could name. DemoSeeder routes TICKETS
            // through ISender for the opposite reason: those are actions a user performs.
            await context.SaveChangesAsync(ct);
        }

        Console.WriteLine(
            inserted == 0
                ? "Users: already seeded, nothing written."
                : $"Users: {inserted} written ({ManagerEmail}, {AgentEmail}, {AgentTwoEmail}).");
    }

    private static async Task<int> AddIfAbsentAsync(
        WaslDbContext context,
        string fullName,
        string email,
        string password,
        SupportRole role,
        string preferredLanguage,
        IPasswordHasher passwords,
        DateTime now,
        CancellationToken ct)
    {
        // The comparison is the column's — Latin1_General_100_CI_AS — so this matches
        // MANAGER@WASL.LOCAL without lowercasing anything on the way in (AC-23).
        if (await context.SupportUsers.AnyAsync(user => user.Email == email, ct))
        {
            return 0;
        }

        context.SupportUsers.Add(SupportUser.Create(
            fullName, email, passwords.Hash(password), role, now, preferredLanguage));

        return 1;
    }
}
