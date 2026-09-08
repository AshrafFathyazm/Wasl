namespace Wasl.Infrastructure.Persistence.Snapshots;

/// <summary>
/// What the dashboard's four attention levels were on one local day, for one scope. `020b`.
/// </summary>
/// <remarks>
/// <para>
/// <b>An Infrastructure entity, not a domain one — and `plan.md` §1 makes that the first design
/// decision.</b> A snapshot has no invariant to protect and no illegal state to make
/// unconstructible: it is four integers and two dates. Putting it in <c>Wasl.Domain</c> because it
/// sounds like a business concept is the reflex ADR-002 exists to resist. It follows
/// <c>IdempotencyRecord</c>'s shape exactly — under <c>Persistence/</c>, reached through
/// <c>context.Set&lt;T&gt;()</c>, with no <c>DbSet</c> property on the context and nothing on
/// <c>IApplicationDbContext</c>.
/// </para>
/// <para>
/// <b>This table exists because the level cannot be reconstructed.</b> The dashboard's tiles are
/// a STOCK — <i>unassigned right now</i> — and a stock has no history unless somebody writes it
/// down. `spec.md` §2.1 rejects reconstructing it from <c>dbo.TicketHistory</c> on two
/// measurements: no seeder writes a single history row, and `016` is unbuilt so no
/// <c>Escalated</c> event is ever written. Reconstruction would report every seeded ticket as
/// unassigned at any past instant — confidently wrong on the demo data.
/// </para>
/// <para>
/// <b>It is derived data and it is still not recomputable.</b> Deleting a row loses that day
/// permanently, because the only source for it was the moment it was taken. That is the whole
/// reason the table exists, and it is why a missed capture is never back-filled from current
/// state (`spec.md` Q-1).
/// </para>
/// </remarks>
internal sealed class DashboardDailySnapshot
{
    /// <summary>
    /// Surrogate key.
    /// </summary>
    /// <remarks>
    /// <c>bigint IDENTITY</c>, not <c>Guid.CreateVersion7()</c>. This table is written by a
    /// background job, is never named in a URL, and has no client that could paste an id —
    /// <c>dbo.AuditLog</c> is <c>bigint</c> for the same reasons.
    /// </remarks>
    public long Id { get; private set; }

    /// <summary>
    /// The BUSINESS date: the day these numbers describe, in <c>Wasl:OrganizationTimeZone</c>.
    /// </summary>
    /// <remarks>
    /// A <c>DateOnly</c> mapping to <c>date</c>, so it carries no time by construction — the same
    /// reasoning that makes `020`'s <c>localDate</c> a bare string on the wire. A capture that
    /// runs at 00:05 local on the 8th writes the 7th here.
    /// </remarks>
    public DateOnly LocalDate { get; private set; }

    /// <summary>
    /// <c>null</c> is the TEAM. A user id is that agent's view.
    /// </summary>
    /// <remarks>
    /// <b>A plain unique index over this column is enough, and the first draft of the spec said
    /// otherwise.</b> SQL Server compares <c>NULL</c>s as EQUAL inside a unique index — measured,
    /// `research.md` R-1, error 2601 on the second team row for one day — so "one team row per
    /// day" falls out with no filtered index and no sentinel id.
    /// </remarks>
    public Guid? ScopeUserId { get; private set; }

    /// <summary>Unassigned and not closed. Global in both scopes, as `020` documents.</summary>
    public int UnassignedCount { get; private set; }

    /// <summary>Escalated, and neither resolved nor closed. Scoped.</summary>
    public int EscalatedOpenCount { get; private set; }

    /// <summary><c>PendingCustomer</c>. Scoped.</summary>
    public int WaitingOnCustomerCount { get; private set; }

    /// <summary>
    /// Assigned and not closed. Scoped.
    /// </summary>
    /// <remarks>
    /// No tile shows this today. It is captured because it is the one number a trend on this
    /// table would obviously want next, and adding a column later is a migration — while an
    /// unused column costs four bytes a day.
    /// </remarks>
    public int AssignedCount { get; private set; }

    /// <summary>
    /// Age of the oldest unassigned, uncommented ticket, in whole hours.
    /// </summary>
    /// <remarks>
    /// <b><c>null</c> when there was no such ticket — never <c>0</c>.</b> The same distinction
    /// `020`'s medians make: no data is not "brand new". A zero here would render as an age and
    /// be read as one.
    /// </remarks>
    public int? OldestUntouchedHours { get; private set; }

    /// <summary>
    /// The TECHNICAL date: when the capture actually ran.
    /// </summary>
    /// <remarks>
    /// It legitimately differs from <see cref="LocalDate"/> by the zone's offset — a capture for
    /// 7 September taken just after local midnight stores <c>2026-09-07</c> here as
    /// <c>2026-09-07T21:05Z</c>. <b>Without it, a row that ran late is indistinguishable from one
    /// that ran on time</b>, and nobody can tell afterwards which day's events it saw.
    /// </remarks>
    public DateTime CapturedAtUtc { get; private set; }

    /// <summary>
    /// Builds a row for one scope. Used by the tests; the capture itself writes through SQL.
    /// </summary>
    /// <remarks>
    /// <b>The capture does NOT go through this factory, and that is deliberate.</b> It performs an
    /// upsert — <c>UPDATE</c>, then <c>INSERT</c> if nothing was updated, catching the duplicate —
    /// which EF's change tracker cannot express without a read-modify-write that reintroduces the
    /// check-then-act the unique index exists to replace (`research.md` R-2). This factory is here
    /// so a test can arrange a snapshot without hand-writing SQL.
    /// </remarks>
    public static DashboardDailySnapshot For(
        DateOnly localDate,
        Guid? scopeUserId,
        int unassignedCount,
        int escalatedOpenCount,
        int waitingOnCustomerCount,
        int assignedCount,
        int? oldestUntouchedHours,
        DateTime capturedAtUtc) =>
        new()
        {
            LocalDate = localDate,
            ScopeUserId = scopeUserId,
            UnassignedCount = unassignedCount,
            EscalatedOpenCount = escalatedOpenCount,
            WaitingOnCustomerCount = waitingOnCustomerCount,
            AssignedCount = assignedCount,
            OldestUntouchedHours = oldestUntouchedHours,
            CapturedAtUtc = capturedAtUtc,
        };
}
