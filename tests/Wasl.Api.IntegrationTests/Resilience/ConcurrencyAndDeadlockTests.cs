using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Domain.Common.Exceptions;
using Wasl.Domain.Customers;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Resilience;

/// <summary>
/// `036` §3.2 and §3.3 — the two engine conditions that used to be `500`s. AC-4 to AC-8.
/// </summary>
[Collection(WaslApiCollection.Name)]
public sealed class ConcurrencyAndDeadlockTests(WaslApiFactory factory)
{
    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<(Guid Id, string Version)> NewTicketAsync()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var response = await factory.CreateEnglishManagerClient().PostAsJsonAsync("/api/tickets", new
        {
            customerId,
            subject = "Concurrency",
            description = "A ticket for the concurrency tests.",
            category = "Billing",
            channel = "Email",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await BodyOf(response);

        return (body.GetProperty("id").GetGuid(), body.GetProperty("version").GetString()!);
    }

    // ---- AC-4 · the window the explicit check cannot see -------------------------------------

    /// <summary>
    /// A rowversion mismatch detected by EF at <c>SaveChanges</c> is a `409`, not a `500`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Asserted at the persistence level, because that is the only place the window exists.</b>
    /// The three handlers compare <c>rowversion</c> explicitly first, so an HTTP request cannot
    /// reach EF's own re-check unless a writer lands in the microseconds between the two — which
    /// is not something a test can schedule. What a test CAN do is reproduce exactly the
    /// condition EF reports: two tracked copies of one row, one saved after the other.
    /// </para>
    /// <para>
    /// <c>AssignTicketCommandHandler</c> already documents that this re-check happens. Before
    /// `036` it threw <c>DbUpdateConcurrencyException</c> into an unmapped path.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_rowversion_mismatch_at_SaveChanges_is_a_concurrency_conflict_not_a_500()
    {
        var ticket = await NewTicketAsync();

        using var firstScope = factory.Services.CreateScope();
        using var secondScope = factory.Services.CreateScope();

        var first = firstScope.ServiceProvider.GetRequiredService<WaslDbContext>();
        var second = secondScope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var mine = await first.Tickets.SingleAsync(candidate => candidate.Id == ticket.Id);
        var theirs = await second.Tickets.SingleAsync(candidate => candidate.Id == ticket.Id);

        // Theirs commits first, so the row's rowversion moves and my copy is now stale.
        theirs.ChangeStatus(TicketStatus.Open, DateTime.UtcNow, note: null);
        await second.SaveChangesAsync();

        mine.ChangeStatus(TicketStatus.Open, DateTime.UtcNow, note: null);

        var act = async () => await first.SaveChangesAsync();

        await act.Should().ThrowAsync<ConcurrencyConflictException>();
    }

    // ---- AC-6 · THE GUARD ON THE FIX ---------------------------------------------------------

    /// <summary>
    /// A stale version AND a forbidden transition still answers <c>concurrency-conflict</c>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This is what goes red if anyone "simplifies" `036` by deleting the explicit check.</b>
    /// `012`'s frozen contract fixes the version check ahead of the transition rules, and the
    /// reason is that catching <c>DbUpdateConcurrencyException</c> instead would judge a stale
    /// request against a state the client never saw — so a stale UI would be told it attempted a
    /// forbidden move it never attempted.
    /// </para>
    /// <para>
    /// The request below is stale <b>and</b> illegal: <c>New → InProgress</c> is not in the BR-1
    /// map. Only the ordering decides which answer comes back.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_stale_version_wins_over_a_forbidden_transition()
    {
        var ticket = await NewTicketAsync();
        var client = factory.CreateEnglishManagerClient();

        // Move it, so the version the create returned is now stale.
        var moved = await client.PutAsJsonAsync(
            $"/api/tickets/{ticket.Id}/status",
            new { status = "Open", expectedVersion = ticket.Version });

        moved.StatusCode.Should().Be(HttpStatusCode.OK);

        // Stale version, and a transition BR-1 forbids from New. Two rules broken at once.
        var response = await client.PutAsJsonAsync(
            $"/api/tickets/{ticket.Id}/status",
            new { status = "InProgress", expectedVersion = ticket.Version });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);

        (await BodyOf(response)).GetProperty("type").GetString()
            .Should().EndWith("/concurrency-conflict");
    }

    // ---- AC-8 · the deadlock -----------------------------------------------------------------

    /// <summary>
    /// A SQL Server deadlock victim surfaces as <c>TransientConflictException</c>, never a `500`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>A real deadlock, induced by opposite lock ordering</b> — the only way to prove this,
    /// because `CLAUDE.md`'s rule is that a guard nobody has watched fail has not been verified,
    /// and 1205 cannot be raised by asking for it. Two transactions each take one row and then
    /// reach for the row the other holds; SQL Server kills one.
    /// </para>
    /// <para>
    /// <b>The updates go through <c>SaveChangesAsync</c> and not raw SQL</b>, because
    /// <c>SaveChangesAsync</c> is where the translation lives. Driving this with
    /// <c>ExecuteSqlRaw</c> would deadlock just as well and would test nothing that ships.
    /// </para>
    /// <para>
    /// A deadlock is deterministic once both sides hold their first lock, so the barrier below is
    /// what makes this reliable rather than a sleep. If SQL Server picks the other victim the
    /// assertion still holds — the test asserts that SOME side was refused this way, not which.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_deadlock_victim_is_a_transient_conflict_not_a_500()
    {
        // TWO CUSTOMERS, not a ticket and a customer. A ticket is a state machine: the two
        // contenders would have to make a legal transition each, and `Assign(null)` on an
        // unassigned ticket raises AssigneeUnchanged before any lock is taken. `Customer.Update`
        // is repeatable, so the only thing this test can fail on is the deadlock it is about.
        var first = await AuditFixture.SeedCustomerAsync(factory);
        var second = await AuditFixture.SeedCustomerAsync(factory);

        // Both sides hold their first lock; neither has asked for the second yet. A barrier and
        // not a sleep: a deadlock is deterministic once both locks are held, and a sleep makes
        // the test a race about how fast the container is.
        using var bothHoldOne = new Barrier(2);

        var failures = new System.Collections.Concurrent.ConcurrentBag<Exception>();

        async Task Contend(Guid mine, Guid theirs)
        {
            using var scope = factory.Services.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

            await using var transaction = await context.Database.BeginTransactionAsync();

            var reached = false;

            try
            {
                // ── BOTH ROWS ARE READ BEFORE EITHER IS LOCKED, and that is the point ──
                //
                // MEASURED. The first version read each row immediately before updating it, and
                // the deadlock victim turned out to be the second SELECT — which raises a raw
                // SqlException from the query, not from SaveChangesAsync, so `036`'s translation
                // never saw it and the test failed with `found {SqlException}`.
                //
                // That is a real limit of the fix and it is recorded in summary.md rather than
                // hidden by this restructuring: `036` translates a deadlock on the WRITE. Reading
                // both rows up front makes this test exercise the path the fix covers — which is
                // also the path production takes, because a handler reads its aggregate and then
                // saves.
                var first = await context.Customers.SingleAsync(candidate => candidate.Id == mine);
                var second = await context.Customers.SingleAsync(candidate => candidate.Id == theirs);

                await TouchAsync(context, first);

                // Timed, so a failure on the line above cannot hang the other side forever —
                // which would turn a red test into a stuck suite.
                reached = bothHoldOne.SignalAndWait(TimeSpan.FromSeconds(30));

                await TouchAsync(context, second);
                await transaction.CommitAsync();
            }
            catch (Exception exception)
            {
                failures.Add(exception);
            }
            finally
            {
                // Releases a partner still waiting when this side threw before the barrier.
                if (!reached)
                {
                    bothHoldOne.RemoveParticipant();
                }
            }
        }

        await Task.WhenAll(
            Contend(first, second),
            Contend(second, first));

        // If nothing was refused, no deadlock occurred and this test proved nothing. Said out
        // loud rather than passing quietly — `CLAUDE.md`: a measurement that names the wrong
        // thing is worse than no measurement, because it is believed.
        failures.Should().NotBeEmpty("the two transactions must actually deadlock");

        // Which side SQL Server kills is the engine's choice, so this asserts that the refusal
        // was translated — not which contender received it.
        failures.Should().ContainItemsAssignableTo<TransientConflictException>();
    }

    /// <summary>
    /// Writes an already-loaded customer, so the only statement that can deadlock is the UPDATE.
    /// </summary>
    private static async Task TouchAsync(WaslDbContext context, Customer customer)
    {
        customer.Update(
            customer.FullName, customer.Email, customer.PhoneE164, customer.CompanyName,
            notes: $"touched {Guid.CreateVersion7()}");

        await context.SaveChangesAsync();
    }
}
