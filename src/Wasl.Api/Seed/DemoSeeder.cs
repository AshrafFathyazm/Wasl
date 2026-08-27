using MediatR;
using Microsoft.EntityFrameworkCore;
using Wasl.Application.Features.Tickets.ChangeStatus;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.Seed;

/// <summary>
/// Three customers and five tickets in five different statuses, from one command.
/// </summary>
/// <remarks>
/// <para>
/// <b>A demo from a known state beats typing data in front of people.</b>
/// `docs/sdd/16-three-day-plan.md` put the seed script in Session 3 for that reason.
/// </para>
/// <para>
/// <b>Tickets go through <c>ISender</c> — the same pipeline a request takes.</b> The first version
/// wrote through <c>WaslDbContext</c> directly, and a code review caught what that cost: no
/// <c>TransactionBehaviour</c>, no <c>AuditBehaviour</c>, so the demo would have opened on an
/// empty <c>dbo.AuditLog</c> after twelve state changes — with BR-9 being one of the strongest
/// claims this codebase makes.
/// </para>
/// <para>
/// It buys a second thing, which is the better reason: the seed now walks the path a user walks.
/// Validation, the transaction boundary, the audit row, the BR-1 state machine and the number
/// sequence are all exercised, so <b>anything that breaks the pipeline breaks the seed</b> — and
/// it breaks it before a demo rather than during one.
/// </para>
/// <para>
/// <b>Customers still go in as SQL, and assignment still bypasses the pipeline.</b> Both are
/// stated shortcuts with owners: <c>Customer</c> has no factory until `007`, and there is no
/// assign command until `011`. Assignment therefore writes no audit row, which is honest —
/// `011` is the feature that makes assignment an audited action.
/// </para>
/// <para>
/// <b>Idempotent.</b> Running it twice is a no-op, because a demo rehearsed three times must not
/// end with fifteen tickets.
/// </para>
/// </remarks>
internal static class DemoSeeder
{
    /// <summary>
    /// The switch <c>Program.cs</c> looks for: <c>dotnet run --project src/Wasl.Api -- --seed</c>.
    /// </summary>
    public const string Switch = "--seed";

    public static async Task RunAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();

        // Applied here too, so a clean clone needs one command rather than two — and so the seed
        // can never run against a schema older than the code that seeds it.
        await context.Database.MigrateAsync();

        if (await context.Tickets.AnyAsync())
        {
            Console.WriteLine("Seed skipped: tickets already exist.");
            return;
        }

        var customers = await SeedCustomersAsync(context);

        await SeedTicketAsync(sender, services, customers[0], TicketStatus.New,
            "Cannot sign in to the portal", "The password reset email never arrives.",
            TicketCategory.Account, TicketPriority.High, CommunicationChannel.Email);

        await SeedTicketAsync(sender, services, customers[0], TicketStatus.Open,
            "Invoice total looks wrong", "March invoice is double February with no usage change.",
            TicketCategory.Billing, TicketPriority.Normal, CommunicationChannel.WhatsApp);

        await SeedTicketAsync(sender, services, customers[1], TicketStatus.InProgress,
            "لا يمكنني تحديث بيانات الحساب", "الصفحة تعطي خطأ عند الحفظ.",
            TicketCategory.Technical, TicketPriority.Critical, CommunicationChannel.LiveChat);

        await SeedTicketAsync(sender, services, customers[1], TicketStatus.PendingCustomer,
            "Waiting on a screenshot", "Asked the customer for the error screen.",
            TicketCategory.Technical, TicketPriority.Low, CommunicationChannel.Sms);

        await SeedTicketAsync(sender, services, customers[2], TicketStatus.Resolved,
            "Export finished but file was empty", "Ran the CSV export twice with the same result.",
            TicketCategory.General, TicketPriority.Normal, CommunicationChannel.WebForm);

        var audited = await context.AuditLog.CountAsync();

        Console.WriteLine(
            $"Seeded {customers.Count} customers and 5 tickets, and wrote {audited} audit rows.");
    }

    /// <summary>
    /// Creates a ticket and walks it to <paramref name="target"/>, every step through the pipeline.
    /// </summary>
    /// <remarks>
    /// A fresh scope per command, because that is what a request gets — and because
    /// <c>IRequestTimestamp</c> is scoped: one scope for the whole seed would stamp every ticket
    /// and every transition with the same instant, and the list's newest-first order would then
    /// depend entirely on the <c>Id</c> tie-break rather than exercising the sort.
    /// </remarks>
    private static async Task SeedTicketAsync(
        ISender sender,
        IServiceProvider services,
        Guid customerId,
        TicketStatus target,
        string subject,
        string description,
        TicketCategory category,
        TicketPriority priority,
        CommunicationChannel channel)
    {
        var created = await SendAsync(services, new CreateTicketCommand(
            customerId, subject, description, category, channel, priority));

        var version = created.Version;

        // InProgress and everything past it needs an assignee (BR-1.3), and there is no assign
        // command until `011`. A direct update, outside the pipeline and therefore unaudited —
        // the one shortcut left in this file, and `011` removes it.
        //
        // It returns the NEW version, and that is not tidiness. The first version of this method
        // ignored the return and the seed died on ConcurrencyConflictException: a raw UPDATE moves
        // the rowversion, so the token from the create response was stale and the pipeline
        // correctly refused a stale client. The seeder was behaving exactly like the second
        // browser tab AC-17 exists to reject.
        //
        // Worth stating: the direct-context version of this seeder could never have found that.
        // Routing the seed through the pipeline made it the first caller to be judged by the
        // rules the pipeline enforces.
        if (target is TicketStatus.InProgress or TicketStatus.PendingCustomer or TicketStatus.Resolved)
        {
            version = await AssignAsync(services, created.Id);
        }

        foreach (var step in PathTo(target))
        {
            var moved = await SendAsync(services, new ChangeTicketStatusCommand(
                created.Id, step, version, Note: "seeded"));

            // The token from the response, not the one just used — every write moves the
            // rowversion, which is exactly what AC-17 refuses a stale copy of.
            version = moved.Version;
        }
    }

    /// <summary>
    /// Sends one command in its own scope, so each behaves like one request.
    /// </summary>
    private static async Task<CreateTicketResult> SendAsync<TCommand>(
        IServiceProvider services, TCommand command)
        where TCommand : IRequest<CreateTicketResult>
    {
        using var scope = services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ISender>().Send(command);
    }

    /// <summary>
    /// Sets an assignee directly. Replaced by `011`.
    /// </summary>
    /// <remarks>
    /// The id refers to no row: `dbo.SupportUsers` does not exist until `004`, which is precisely
    /// why the column carries no foreign key yet — recorded in `009`'s `data-model.md`.
    /// </remarks>
    /// <returns>The ticket's version token <b>after</b> the update.</returns>
    private static async Task<string> AssignAsync(IServiceProvider services, Guid ticketId)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var assignee = Guid.CreateVersion7();

        await context.Database.ExecuteSqlAsync(
            $"UPDATE dbo.Tickets SET AssignedToUserId = {assignee} WHERE Id = {ticketId}");

        var rowVersion = await context.Tickets
            .AsNoTracking()
            .Where(ticket => ticket.Id == ticketId)
            .Select(ticket => ticket.RowVersion)
            .SingleAsync();

        return Convert.ToBase64String(rowVersion);
    }

    private static async Task<List<Guid>> SeedCustomersAsync(WaslDbContext context)
    {
        var ids = new List<Guid>();

        foreach (var (name, email, phone, company) in new[]
        {
            ("علي الأحمد", "ali@example.com", "+966501234567", "شركة الأفق للتقنية"),
            ("Sara Khan", "sara.khan@example.com", "+966555000111", "Northwind Logistics"),
            ("مها العتيبي", "maha@example.com", "+966533221100", (string?)null),
        })
        {
            var id = Guid.CreateVersion7();

            // SQL because `Customer` has no factory until `007`, and adding reflection to
            // production code to work around a missing factory would be worse than three INSERTs
            // that `007` deletes. IsActive is set EXPLICITLY — the column no longer carries a
            // default, for the reason in CustomerConfiguration.
            var now = DateTime.UtcNow;

            await context.Database.ExecuteSqlAsync(
                $"""
                INSERT INTO dbo.Customers
                    (Id, FullName, Email, PhoneE164, CompanyName, Notes, IsActive, CreatedAtUtc, UpdatedAtUtc)
                VALUES
                    ({id}, {name}, {email}, {phone}, {company}, NULL, 1, {now}, {now})
                """);

            ids.Add(id);
        }

        return ids;
    }

    /// <summary>
    /// The real transitions that reach <paramref name="target"/>, in order.
    /// </summary>
    /// <remarks>
    /// Written out rather than searched for. A path finder over the BR-1 map would be a second
    /// implementation of the rule in the one place that must not have one — and if it disagreed
    /// with the map, the seed would produce a ticket the product cannot.
    /// </remarks>
    private static TicketStatus[] PathTo(TicketStatus target) => target switch
    {
        TicketStatus.New => [],
        TicketStatus.Open => [TicketStatus.Open],
        TicketStatus.InProgress => [TicketStatus.Open, TicketStatus.InProgress],
        TicketStatus.PendingCustomer =>
            [TicketStatus.Open, TicketStatus.InProgress, TicketStatus.PendingCustomer],
        TicketStatus.Resolved =>
            [TicketStatus.Open, TicketStatus.InProgress, TicketStatus.Resolved],
        _ => throw new ArgumentOutOfRangeException(
            nameof(target), target, "The seed does not create closed tickets — a demo needs "
            + "something it can still act on."),
    };
}
