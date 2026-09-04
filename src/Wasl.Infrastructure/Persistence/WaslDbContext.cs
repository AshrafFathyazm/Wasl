using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Audit;
using Wasl.Domain.Common;
using Wasl.Domain.Common.Exceptions;
using Wasl.Infrastructure.Persistence.Configurations;
using Wasl.Application.Features.Customers.CreateCustomer;
using Wasl.Domain.Customers;
using Wasl.Domain.Tickets;
using Wasl.Domain.Users;

namespace Wasl.Infrastructure.Persistence;

/// <summary>
/// The one place that knows the database exists. Implements
/// <see cref="IApplicationDbContext"/> so the Application layer can persist without
/// referencing EF Core (AC-7).
/// </summary>
public sealed class WaslDbContext(
    DbContextOptions<WaslDbContext> options,
    IRequestTimestamp timestamp,
    ICurrentUser currentUser)
    : DbContext(options), IApplicationDbContext
{
    /// <summary>
    /// Stamps every <see cref="IAuditableEntity"/> before saving, then saves.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Handlers do not stamp.</b> A timestamp each handler is responsible for is a timestamp
    /// one handler will forget, and the forgetting fails nothing — no test goes red, no
    /// constraint is violated, a row simply carries <c>0001-01-01</c> until someone sorts by it.
    /// Doing it here makes it structural, which is the same argument BR-9 makes for the audit
    /// row.
    /// </para>
    /// <para>
    /// <b>Before <c>base</c>, necessarily.</b> `003`'s <c>AuditDiffInterceptor</c> captures the
    /// change tracker in <c>SavingChanges</c>, which <c>base</c> raises — so the stamps are
    /// already applied when it looks. That interceptor excludes these four properties from the
    /// diff by name: they are infrastructure, not a change the actor made, and including them
    /// would put two timestamp entries in every audit row and a <c>UpdatedByUserId</c> entry in
    /// every update.
    /// </para>
    /// <para>
    /// <b>The instant comes from <see cref="IRequestTimestamp"/>, not from <c>TimeProvider</c>
    /// directly.</b> A handler writing a history row needs the <i>same</i> instant (AC-9), and
    /// two callers of <c>GetUtcNow()</c> get two values that differ by microseconds — close
    /// enough to pass every test and wrong in a timeline.
    /// </para>
    /// </remarks>
    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        Stamp();

        try
        {
            return await base.SaveChangesAsync(cancellationToken);
        }

        // ── `036` §3.3, AC-8. FIRST, and matched on the CHAIN rather than on a type ──
        //
        // MEASURED, and the first version of this catch was wrong. A deadlock does not arrive as
        // a DbUpdateException: EF Core's SqlServerExecutionStrategy catches the transient failure
        // and rethrows it wrapped in an InvalidOperationException carrying the advisory
        //
        //   "An exception has been raised that is likely due to a transient failure. Consider
        //    enabling transient error resiliency by adding 'EnableRetryOnFailure'..."
        //
        // with the real DbUpdateException -> SqlException(1205) underneath. Catching
        // DbUpdateException therefore translated NOTHING, and the induced-deadlock test reported
        // `found {InvalidOperationException}` — a `500` for the exact case this feature is about.
        //
        // So the match is on the inner chain and not on the wrapper's type: the wrapper belongs to
        // EF and can change, the error number belongs to SQL Server and cannot.
        //
        // (That advisory is EF recommending Q-3's route B. It was considered and declined — see
        // TransientConflictException: the retried delegate must be idempotent and a create handler
        // has already drawn a ticket number, which a rollback does not return.)
        catch (Exception exception) when (IsDeadlockVictim(exception))
        {
            throw new TransientConflictException(exception);
        }

        // ── `036` §3.2, AC-4 ────────────────────────────────────────────────────────
        //
        // Before the duplicate catch, because DbUpdateConcurrencyException derives from
        // DbUpdateException and would otherwise be tested against TranslateDuplicate, fail to
        // match, and fall out unhandled.
        //
        // Three handlers compare `rowversion` explicitly before applying their rules, and that
        // ordering is deliberate and unchanged — `012`'s contract fixes it, and catching this
        // exception INSTEAD would put the version check after the transition rules. But the
        // explicit check cannot cover the writer that arrives between it and this line;
        // AssignTicketCommandHandler says EF re-checks the rowversion here, and it does. That
        // re-check threw into an unmapped path and produced a `500` for the one race the explicit
        // check was never able to see.
        //
        // Same reasoning as the duplicate translation below: the loser of a race must receive the
        // body a sequential caller receives.
        catch (DbUpdateConcurrencyException exception)
        {
            throw new ConcurrencyConflictException(exception);
        }

        catch (DbUpdateException exception) when (TranslateDuplicate(exception) is { } domain)
        {
            // `007` Q-D. Rethrown as the exception the pre-check raises, so the loser of a race
            // gets a body identical to the one a sequential duplicate gets — see TranslateDuplicate.
            //
            // The original is kept as the inner exception: a 500 that reached here by another route
            // would otherwise lose its stack, and BR-9's failure row records the outcome either way.
            throw domain;
        }
    }

    /// <summary>
    /// SQL Server error 1205 — this session was chosen as the deadlock victim.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>1205 and nothing else.</b> 1222 (lock request timeout) is deliberately excluded: a
    /// timeout means the work may still be in progress somewhere, so telling the client to retry
    /// could double a write that eventually committed. A 1205 victim's batch is already rolled
    /// back by the engine, which is what makes the retry advice safe to give.
    /// </para>
    /// <para>
    /// Walks the inner chain, because EF wraps and the provider sometimes wraps again.
    /// </para>
    /// </remarks>
    internal const int DeadlockVictimErrorNumber = 1205;

    private static bool IsDeadlockVictim(Exception? exception)
    {
        for (var candidate = exception; candidate is not null; candidate = candidate.InnerException)
        {
            if (candidate is SqlException sql && sql.Number == DeadlockVictimErrorNumber)
            {
                return true;
            }
        }

        return false;
    }

    /// <inheritdoc cref="SaveChangesAsync(CancellationToken)"/>
    public override int SaveChanges()
    {
        Stamp();
        return base.SaveChanges();
    }

    /// <summary>
    /// Turns a unique-index violation into the domain exception the pre-check raises. `007` Q-D.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>BR-4.8 enforces the duplicate rule twice, and a client must not be able to tell which
    /// half caught it.</b> The handler checks before inserting and raises
    /// <c>DuplicateValueException</c>; the filtered unique index catches the case the check cannot
    /// — two simultaneous requests, where both pass the check and one loses the insert. Without
    /// this translation the loser gets a <c>DbUpdateException</c>, which is a `500`, so the same
    /// duplicate produces a friendly `409` or an internal error depending on **timing**.
    /// </para>
    /// <para>
    /// <b>It lives here rather than in the handler because it needs an EF Core type.</b>
    /// <c>Wasl.Application</c> cannot see EF Core — the architecture test enforces it, and it
    /// already stopped one reimplementation in `008`. Putting it here also puts it beside the
    /// index configuration, so the names it matches on and the names that create the indexes are
    /// in the same project.
    /// </para>
    /// <para>
    /// <b>Matched by index NAME, not by error number alone.</b> SQL Server reports 2601 and 2627
    /// for any unique violation, so keying on the number would translate an unrelated index's
    /// violation into "this customer already exists" — a confident, wrong `409`. An unrecognised
    /// violation is rethrown untouched and becomes a `500`, which is the honest answer for a
    /// constraint nobody has written a message for.
    /// </para>
    /// </remarks>
    private static Exception? TranslateDuplicate(DbUpdateException exception)
    {
        if (exception.InnerException is not SqlException sql
            || sql.Number is not (2601 or 2627))
        {
            return null;
        }

        var message = sql.Message;

        if (message.Contains(DuplicateCustomer.EmailIndex, StringComparison.Ordinal))
        {
            return DuplicateCustomer.Email();
        }

        if (message.Contains(DuplicateCustomer.PhoneIndex, StringComparison.Ordinal))
        {
            return DuplicateCustomer.Phone();
        }

        // ── `036` §3.1, AC-1 and AC-2 ───────────────────────────────────────────────
        //
        // `034` added this index and wrote down, correctly, that the pre-check is not the
        // guarantee — and then did not extend this method, so the index caught the race and
        // answered `500`. Two attaches of the same tag produced `409` or `500` depending only on
        // whether they overlapped in time.
        //
        // The SAME exception the pre-check throws, for the reason `007` recorded as Q-D: a client
        // must not be able to tell which half of the rule caught it, and the cheapest way to
        // guarantee that is for both paths to construct the same type rather than two that look
        // alike.
        if (message.Contains(TicketTagConfiguration.UniqueIndexName, StringComparison.Ordinal))
        {
            return new TagUnchangedException();
        }

        // Anything else is rethrown untouched and becomes a `500` — the honest answer for a
        // constraint nobody has written a message for, and the behaviour AC-3 asserts. Widening
        // this to "any 2601" would translate an unrelated index's violation into a confident,
        // wrong `409`.
        return null;
    }

    private void Stamp()
    {
        // Already truncated to the millisecond by RequestTimestamp, which is where that rule lives
        // now — every timestamp column in this schema is datetime2(3), and a value that keeps full
        // .NET tick precision in memory makes a create's 201 body disagree with a later GET of the
        // same resource. `007` AC-14 found it; the fix is in one place because five features write
        // timestamps and only one of them would have been fixed otherwise.
        var now = timestamp.UtcNow.UtcDateTime;
        var actor = currentUser.UserId;

        foreach (var entry in ChangeTracker.Entries<IAuditableEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    // UpdatedAtUtc equals CreatedAtUtc on insert. A null "never updated" would
                    // make every consumer handle two shapes for one fact.
                    entry.CurrentValues[nameof(IAuditableEntity.CreatedAtUtc)] = now;
                    entry.CurrentValues[nameof(IAuditableEntity.UpdatedAtUtc)] = now;
                    entry.CurrentValues[nameof(IAuditableEntity.CreatedByUserId)] = actor;

                    // UpdatedByUserId stays null on insert: nobody has updated it. Setting it to
                    // the creator would make "who last touched this" unanswerable.
                    break;

                case EntityState.Modified:
                    // Created* is never rewritten. Assigning it here would silently move a row's
                    // creation time on every edit.
                    entry.CurrentValues[nameof(IAuditableEntity.UpdatedAtUtc)] = now;
                    entry.CurrentValues[nameof(IAuditableEntity.UpdatedByUserId)] = actor;
                    break;
            }
        }

        // ── TicketHistory, stamped separately — and it was a defect that it was not ──────
        //
        // TicketHistoryEntry is not an IAuditableEntity and should not become one: it has no
        // CreatedAtUtc/UpdatedAtUtc pair because it is append-only, and its actor column is
        // PerformedByUserId — "who did this thing" rather than "who last edited this row". The
        // names differ because the concepts do.
        //
        // But the loop above matches by interface, so it skipped these rows entirely, and
        // PerformedByUserId was NULL on every history row this system has ever written —
        // Created from `009`, StatusChanged from `012`, and Assigned/Unassigned from `011`.
        // Nothing failed. The rows existed, the timeline `013` will render would simply have
        // said "someone" for every event, and the column looked like a feature nobody had
        // filled in yet rather than a stamp that was never applied.
        //
        // Found by `011` AC-9 asserting the actor rather than the row's existence, which is the
        // difference `CLAUDE.md` records as "assert content, not presence".
        //
        // PerformedAtUtc is deliberately NOT stamped here: the domain sets it from the instant
        // passed into ChangeStatus/Assign, because when an event occurred is a business fact
        // about the event, not metadata about the row. Overwriting it here would let this method
        // and IRequestTimestamp disagree about the same moment.
        foreach (var entry in ChangeTracker.Entries<TicketHistoryEntry>())
        {
            if (entry.State is EntityState.Added && entry.Entity.PerformedByUserId is null)
            {
                entry.CurrentValues[nameof(TicketHistoryEntry.PerformedByUserId)] = actor;
            }
        }

        // `013`. Same reason, same place — a comment's author is "who wrote this", not "who last
        // edited this row", so TicketComment is not an IAuditableEntity either and the loop above
        // does not see it. AC-15: the author comes from the token and there is no field on the
        // command a client could set it through, so this is the only line that assigns it.
        //
        // No null-guard, unlike the history loop: TicketComment.AuthorUserId is non-nullable and
        // the factory never sets it, so an unstamped comment would arrive here as Guid.Empty and
        // FK_TicketComments_Author would refuse it at SaveChanges. That is the desired failure —
        // loud — but it should never be reached, because the endpoint is behind the fallback
        // authentication policy and a handler cannot run without a principal.
        foreach (var entry in ChangeTracker.Entries<TicketComment>())
        {
            if (entry.State is EntityState.Added)
            {
                entry.CurrentValues[nameof(TicketComment.AuthorUserId)] = actor;
            }
        }

        // ── TicketTag, `034` ─────────────────────────────────────────────────────────
        //
        // A FOURTH LOOP, because this stamping matches by TYPE and not by a shared interface.
        // `034` added TicketTag with a comment on the entity saying its actor is stamped "the
        // same path TicketComment.AuthorUserId takes" — and that sentence was true of the
        // intent and false of the code until this block existed. Every attach returned `500`:
        // AttachedByUserId stayed Guid.Empty and FK_TicketTags_AttachedBy refused it.
        //
        // Loud, which is the behaviour the comment above the comment loop calls desirable, and
        // it is the second time this shape has bitten — `Customer` went six features unstamped
        // because the loop below it matches by interface and Customer does not implement it.
        // The pattern to notice: A NEW ENTITY WITH AN ACTOR COLUMN NEEDS A LINE HERE, and
        // nothing tells you so except a failing write.
        foreach (var entry in ChangeTracker.Entries<TicketTag>())
        {
            if (entry.State is EntityState.Added)
            {
                entry.CurrentValues[nameof(TicketTag.AttachedByUserId)] = actor;
            }
        }

        // ── Customer, stamped separately — and it had NEVER been stamped ─────────────
        //
        // `Customer` predates IAuditableEntity: `001` created it, `009` introduced the interface,
        // and nobody went back. It has CreatedAtUtc and UpdatedAtUtc but no actor columns, so it
        // cannot implement the interface without a migration that adds two columns the blueprint
        // does not define — and the loop above matches by interface, so it was skipped.
        //
        // Nothing noticed for six features, because nothing had ever created a customer through
        // the application: `--seed` inserts raw SQL and `008`'s tests set the properties by
        // reflection. `007` is the first, and its 201 came back with
        // "createdAtUtc":"0001-01-01T00:00:00" — the CLR default, served as a fact.
        //
        // The actor is deliberately NOT stamped here. Adding CreatedByUserId to dbo.Customers is
        // a schema change beyond this feature's scope, and `007`'s audit row already names the
        // actor — so the information exists, in the table built for it (ADR-008).
        foreach (var entry in ChangeTracker.Entries<Customer>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    // Only when nobody set one. `001`'s converter tests write a specific instant
                    // through the tracked entity to prove the UTC round trip, and an unconditional
                    // stamp silently overwrote it — so the test that guards the converter would
                    // have been testing the stamp.
                    //
                    // Safe because BACKDATING IS PREVENTED BY THE REQUEST SHAPE, not by this line:
                    // `CreateCustomerRequest` has no timestamp field, so nothing a client sends can
                    // reach here with one. The only callers who can are inside the process, and
                    // giving them a way to write a known instant is what makes the converter and
                    // the timeline testable at all.
                    if (entry.Entity.CreatedAtUtc == default)
                    {
                        entry.CurrentValues[nameof(Customer.CreatedAtUtc)] = now;
                        entry.CurrentValues[nameof(Customer.UpdatedAtUtc)] = now;
                    }

                    break;

                case EntityState.Modified:
                    entry.CurrentValues[nameof(Customer.UpdatedAtUtc)] = now;
                    break;
            }
        }
    }

    public DbSet<Customer> Customers => Set<Customer>();

    /// <summary>
    /// The forensic record. Named <c>AuditLog</c> to match the table, while the entity is
    /// <c>AuditEntry</c> — one row is an entry, the table is the log (`research.md` R-6).
    /// </summary>
    /// <remarks>
    /// Deliberately <b>not</b> exposed on <see cref="IApplicationDbContext"/>. Nothing in the
    /// Application layer writes an audit row: the pipeline does, from
    /// <c>Wasl.Infrastructure</c>, through <c>IAuditWriter</c>. Putting it on the interface
    /// would let a handler write its own row, which is the remembered discipline BR-9 exists
    /// to replace.
    /// </remarks>
    public DbSet<AuditEntry> AuditLog => Set<AuditEntry>();

    public DbSet<Ticket> Tickets => Set<Ticket>();

    /// <summary>
    /// The product timeline. Not exposed on <see cref="IApplicationDbContext"/> — `013` reads it
    /// and will add it then; `009` only writes it, which needs no <c>IQueryable</c>.
    /// </summary>
    public DbSet<TicketHistoryEntry> TicketHistory => Set<TicketHistoryEntry>();

    /// <summary>
    /// `013`. Like <see cref="TicketHistory"/>, deliberately <b>not</b> on
    /// <c>IApplicationDbContext</c>.
    /// </summary>
    /// <remarks>
    /// The write path reaches comments through <c>IApplicationDbContext.Add</c>, which needs no
    /// <c>DbSet</c>. The read path is <c>TicketTimelineQuery</c>, which lives in this project and
    /// uses this context directly — one of the two named query classes `CLAUDE.md` sanctions.
    /// Exposing an <c>IQueryable</c> here would let any handler build its own union and the
    /// tie-break would have two implementations.
    /// </remarks>
    public DbSet<TicketComment> TicketComments => Set<TicketComment>();

    // IApplicationDbContext exposes IQueryable, not DbSet — see that interface for why.
    // DbSet<T> IS an IQueryable<T>, so this is an upcast and costs nothing.
    IQueryable<Customer> IApplicationDbContext.Customers => Customers;

    public DbSet<SupportUser> SupportUsers => Set<SupportUser>();

    IQueryable<Ticket> IApplicationDbContext.Tickets => Tickets;

    IQueryable<SupportUser> IApplicationDbContext.SupportUsers => SupportUsers;

    public DbSet<Tag> Tags => Set<Tag>();

    public DbSet<TicketTag> TicketTags => Set<TicketTag>();

    public DbSet<CannedReply> CannedReplies => Set<CannedReply>();

    IQueryable<Tag> IApplicationDbContext.Tags => Tags;

    IQueryable<TicketTag> IApplicationDbContext.TicketTags => TicketTags;

    IQueryable<CannedReply> IApplicationDbContext.CannedReplies => CannedReplies;

    void IApplicationDbContext.Add<TEntity>(TEntity entity) => Set<TEntity>().Add(entity);

    void IApplicationDbContext.Remove<TEntity>(TEntity entity) => Set<TEntity>().Remove(entity);

    // The async materialisation `009` declared. These are the EF Core extension methods the
    // Application layer cannot name, wrapped one-for-one with nothing added — a wrapper that
    // did more would be a place for query behaviour to accumulate out of sight of the call site.
    Task<bool> IApplicationDbContext.AnyAsync<TEntity>(
        IQueryable<TEntity> query, CancellationToken cancellationToken) =>
        query.AnyAsync(cancellationToken);

    Task<TEntity?> IApplicationDbContext.FirstOrDefaultAsync<TEntity>(
        IQueryable<TEntity> query, CancellationToken cancellationToken)
        where TEntity : default =>
        query.FirstOrDefaultAsync(cancellationToken);

    Task<List<TEntity>> IApplicationDbContext.ToListAsync<TEntity>(
        IQueryable<TEntity> query, CancellationToken cancellationToken) =>
        query.ToListAsync(cancellationToken);

    Task<int> IApplicationDbContext.CountAsync<TEntity>(
        IQueryable<TEntity> query, CancellationToken cancellationToken) =>
        query.CountAsync(cancellationToken);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(WaslDbContext).Assembly);

        // AC-3, AC-11. Declared on the model so the migration creates it; drawn with
        // NEXT VALUE FOR by SequenceTicketNumberGenerator.
        //
        // `AS bigint` explicitly: it is the default for an untyped sequence, but stating it
        // removes the question — and `int` would cap at 2.1 billion for no saving. No MAXVALUE
        // and no CYCLE: a cycling sequence eventually hands out a number the unique index
        // already holds, and that failure arrives years later with no clue why.
        modelBuilder.HasSequence<long>("TicketNumberSeq", "dbo")
            .StartsAt(1)
            .IncrementsBy(1);

        base.OnModelCreating(modelBuilder);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        // Applied as conventions rather than per-property, so a new entity inherits both
        // by existing. A convention that has to be remembered is not a convention.
        builder.Properties<DateTime>()
            .HaveConversion<UtcDateTimeConverter>()
            .HaveColumnType("datetime2(3)");

        builder.Properties<DateTime?>()
            .HaveConversion<NullableUtcDateTimeConverter>()
            .HaveColumnType("datetime2(3)");

        base.ConfigureConventions(builder);
    }
}
