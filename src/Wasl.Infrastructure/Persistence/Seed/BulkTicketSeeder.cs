using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Application.Features.Tickets.ChangeStatus;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Infrastructure.Persistence.Seed;

/// <summary>
/// <c>--seed-bulk [n]</c> — a queue big enough to work, not a demo of five rows.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why this exists.</b> <c>--seed</c> writes five tickets, which is enough to show that a
/// list renders and not enough to show anything a list is FOR: the tab counts are all single
/// digits, paging never has a second page, and the three navigation entries —
/// <i>all tickets</i>, <i>my tickets</i>, <i>unassigned</i> — are indistinguishable because
/// every ticket is assigned to the same Agent.
/// </para>
/// <para>
/// <b>The distribution is the point, and it is chosen so each of the three views is
/// non-empty and different from the others.</b> A seed where every ticket is assigned makes
/// <i>unassigned</i> a blank screen that reads as a broken filter.
/// </para>
/// <para>
/// <b>BR-1.3 constrains it and is not worked around.</b> <c>InProgress</c> and everything past
/// it requires an assignee, so an UNASSIGNED ticket can only be <c>New</c> or <c>Open</c>.
/// Asking for anything else would either throw or need the rule bypassed, and a seed that
/// bypasses a business rule produces data the product could never have created — which is the
/// worst kind of test data, because every screen built against it looks right.
/// </para>
/// <para>
/// <b>Additive, and it says so.</b> Unlike <c>--seed</c>, this does not stop when tickets
/// already exist: it is for growing a queue, and refusing would make the only way to a hundred
/// rows a database that had to be dropped first.
/// </para>
/// </remarks>
public static class BulkTicketSeeder
{
    public const string Switch = "--seed-bulk";

    /// <summary>The default when the switch carries no number.</summary>
    public const int DefaultCount = 120;

    /* Real Arabic subjects, because a list of "Ticket 47" measures nothing. The lengths vary
     * deliberately — a column that fits every row at 40 characters tells you nothing about the
     * one at 90, and `026` already found a date column that was eight pixels short. */
    private static readonly (string Subject, string Description, TicketCategory Category)[] Topics =
    [
        ("لا أستطيع تسجيل الدخول إلى حسابي منذ تحديث التطبيق الأخير",
         "بعد التحديث تظهر رسالة «بيانات غير صحيحة» رغم أن كلمة المرور صحيحة، وجرّبت إعادة التعيين مرتين.",
         TicketCategory.Account),

        ("الفاتورة الأخيرة بها رسوم غير معروفة بقيمة 450 ريال",
         "يوجد بند باسم «رسوم خدمة» لم يظهر في الفواتير السابقة، وأرجو توضيح سببه أو استرداده.",
         TicketCategory.Billing),

        ("التطبيق يغلق فجأة عند فتح صفحة المرفقات",
         "يحدث في كل مرة تقريبًا عند فتح مرفق بحجم أكبر من ميجابايت واحد على هاتف أندرويد.",
         TicketCategory.Technical),

        ("طلب تغيير رقم الجوال المسجّل في الحساب",
         "الرقم القديم لم يعد يعمل ولا تصلني رسائل التحقق، وأرغب في تحديثه إلى رقمي الجديد.",
         TicketCategory.Account),

        ("لم يصلني رمز التحقق عبر الرسائل النصية",
         "انتظرت أكثر من عشر دقائق وأعدت الطلب ثلاث مرات دون وصول أي رسالة.",
         TicketCategory.Technical),

        ("استفسار عن خطة الأعمال والفروقات في الأسعار",
         "أرغب في معرفة الفرق بين الخطة الحالية وخطة الأعمال قبل الترقية، وهل يمكن التجربة أولًا.",
         TicketCategory.General),

        ("تكرار الخصم على العملية نفسها مرتين",
         "خُصم المبلغ مرتين بفارق ثلاث دقائق، وأرفقت كشف الحساب البنكي الذي يوضّح العمليتين.",
         TicketCategory.Billing),

        ("الملف المرفق لا يفتح بعد التنزيل",
         "التنزيل يكتمل لكن الملف يظهر تالفًا عند الفتح، وجرّبت متصفحين مختلفين.",
         TicketCategory.Technical),

        ("طلب إيقاف التجديد التلقائي للاشتراك",
         "لا أرغب في تجديد الاشتراك للدورة القادمة، وأريد تأكيدًا خطيًا بالإيقاف.",
         TicketCategory.Billing),

        ("البحث لا يجد التذاكر القديمة رغم وجودها",
         "عند البحث برقم التذكرة لا تظهر أي نتيجة، بينما أراها في القائمة عند التصفح يدويًا.",
         TicketCategory.Technical),

        ("طلب إضافة مستخدم جديد إلى حساب الشركة",
         "نحتاج إضافة موظفة جديدة بصلاحيات محدودة على الحساب المؤسسي.",
         TicketCategory.Account),

        ("الإشعارات تصل متأخرة عدة ساعات",
         "إشعارات الرد على التذاكر تصل بعد ساعتين أو أكثر من وقت الرد الفعلي.",
         TicketCategory.Technical),
    ];

    private static readonly TicketPriority[] Priorities =
        [TicketPriority.Low, TicketPriority.Normal, TicketPriority.High, TicketPriority.Critical];

    private static readonly CommunicationChannel[] Channels =
    [
        CommunicationChannel.Email,
        CommunicationChannel.WhatsApp,
        CommunicationChannel.LiveChat,
        CommunicationChannel.Sms,
        CommunicationChannel.WebForm,
    ];

    /// <summary>
    /// The three navigation entries, made real.
    /// </summary>
    /// <remarks>
    /// <b>The proportions are not decoration.</b> Roughly a third unassigned keeps
    /// <i>unassigned</i> a working queue rather than a curiosity; the Manager's own share is
    /// large enough that <i>my tickets</i> pages; and the rest spread over the two Agents so
    /// the assignee column is not one repeated name.
    /// </remarks>
    private enum Bucket
    {
        /// <summary>Assigned to <c>manager@wasl.local</c> — the *my tickets* view.</summary>
        Mine,

        /// <summary>Assigned to one of the two Agents.</summary>
        Agents,

        /// <summary>Assigned to nobody — the *unassigned* view. New or Open only (BR-1.3).</summary>
        Unassigned,
    }

    public static async Task RunAsync(IServiceProvider services, int count)
    {
        using (var scope = services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

            if (!await context.Customers.AnyAsync())
            {
                Console.WriteLine(
                    $"{Switch}: no customers. Run --seed first — a ticket needs one, and "
                    + "inventing customers here would put a second definition of a demo "
                    + "customer in a second file.");
                return;
            }
        }

        var customers = await CustomerIdsAsync(services);
        var manager = await UserIdAsync(services, SupportUserSeeder.ManagerEmail);
        var agents = new[]
        {
            await UserIdAsync(services, SupportUserSeeder.AgentEmail),
            await UserIdAsync(services, SupportUserSeeder.AgentTwoEmail),
        };

        var written = 0;
        var byBucket = new Dictionary<Bucket, int>
        {
            [Bucket.Mine] = 0,
            [Bucket.Agents] = 0,
            [Bucket.Unassigned] = 0,
        };
        var byStatus = new Dictionary<TicketStatus, int>();

        for (var index = 0; index < count; index++)
        {
            /* Deterministic rather than random: two runs produce the same queue, so a
             * screenshot taken today can be compared with one taken tomorrow. A random seed
             * makes every visual difference ambiguous. */
            var bucket = index % 3 == 0 ? Bucket.Unassigned
                : index % 3 == 1 ? Bucket.Mine
                : Bucket.Agents;

            var status = StatusFor(bucket, index);
            var topic = Topics[index % Topics.Length];

            var assignee = bucket switch
            {
                Bucket.Mine => manager,
                Bucket.Agents => agents[index % agents.Length],
                _ => (Guid?)null,
            };

            await SeedOneAsync(
                services,
                customers[index % customers.Count],
                topic,
                Priorities[index % Priorities.Length],
                Channels[index % Channels.Length],
                assignee,
                status);

            written++;
            byBucket[bucket]++;
            byStatus[status] = byStatus.GetValueOrDefault(status) + 1;
        }

        Console.WriteLine($"{Switch}: wrote {written} tickets.");
        Console.WriteLine(
            $"  mine (manager) {byBucket[Bucket.Mine]}  ·  agents {byBucket[Bucket.Agents]}"
            + $"  ·  unassigned {byBucket[Bucket.Unassigned]}");
        Console.WriteLine(
            "  " + string.Join("  ·  ", byStatus.OrderBy(pair => pair.Key)
                .Select(pair => $"{pair.Key} {pair.Value}")));
    }

    /// <summary>
    /// A status the bucket can legally reach.
    /// </summary>
    /// <remarks>
    /// <b>BR-1.3 is enforced here rather than discovered.</b> An unassigned ticket cannot be
    /// <c>InProgress</c> or past it, so the unassigned bucket gets <c>New</c> and <c>Open</c>
    /// only. The assigned buckets walk the whole map, weighted so no tab is empty.
    /// </remarks>
    private static TicketStatus StatusFor(Bucket bucket, int index) =>
        bucket == Bucket.Unassigned
            ? (index % 2 == 0 ? TicketStatus.New : TicketStatus.Open)
            : (index % 5) switch
            {
                0 => TicketStatus.New,
                1 => TicketStatus.Open,
                2 => TicketStatus.InProgress,
                3 => TicketStatus.PendingCustomer,
                _ => TicketStatus.Resolved,
            };

    private static async Task SeedOneAsync(
        IServiceProvider services,
        Guid customerId,
        (string Subject, string Description, TicketCategory Category) topic,
        TicketPriority priority,
        CommunicationChannel channel,
        Guid? assignee,
        TicketStatus target)
    {
        var created = await SendAsync(services, new CreateTicketCommand(
            customerId, topic.Subject, topic.Description, topic.Category, channel, priority));

        var version = created.Version;

        if (assignee is { } assigneeId)
        {
            version = await AssignAsync(services, created.Id, assigneeId);
        }

        foreach (var step in PathTo(target))
        {
            var moved = await SendAsync(services, new ChangeTicketStatusCommand(
                created.Id, step, version, Note: "seeded"));

            // The token from the RESPONSE, not the one just used. Every write moves the
            // rowversion, and `009`'s seeder died on exactly this before it learned to.
            version = moved.Version;
        }
    }

    private static async Task<CreateTicketResult> SendAsync<TCommand>(
        IServiceProvider services, TCommand command)
        where TCommand : IRequest<CreateTicketResult>
    {
        using var scope = services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ISender>().Send(command);
    }

    /// <summary>
    /// Sets the assignee directly, and takes WHO rather than assuming the Agent.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Still a direct update, and the reason is not laziness.</b> `011` built
    /// <c>AssignTicketCommand</c> and its handler reads <c>ICurrentUser</c> to apply BR-2 — an
    /// Agent may only self-assign an unassigned ticket. This seeder runs outside HTTP, so there
    /// is no authenticated principal and the handler would either refuse or, worse, be given a
    /// fabricated one. **ADR-005 rejects a fake actor by name**, and `004` closed its own gap by
    /// building a real identity rather than inventing one.
    /// </para>
    /// <para>
    /// So the shortcut stays, and what it costs is stated: these rows have no
    /// <c>Ticket.Assigned</c> history entry and no audit row, because nothing went through the
    /// pipeline. A timeline on a bulk-seeded ticket therefore starts at <c>Created</c> and shows
    /// the assignment nowhere. That is a property of seeded data, not of the product.
    /// </para>
    /// </remarks>
    private static async Task<string> AssignAsync(
        IServiceProvider services, Guid ticketId, Guid assigneeId)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await context.Database.ExecuteSqlAsync(
            $"UPDATE dbo.Tickets SET AssignedToUserId = {assigneeId} WHERE Id = {ticketId}");

        var rowVersion = await context.Tickets
            .AsNoTracking()
            .Where(ticket => ticket.Id == ticketId)
            .Select(ticket => ticket.RowVersion)
            .SingleAsync();

        return Convert.ToBase64String(rowVersion);
    }

    private static async Task<List<Guid>> CustomerIdsAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.Customers
            .Where(customer => customer.IsActive)
            .OrderBy(customer => customer.CreatedAtUtc)
            .Select(customer => customer.Id)
            .ToListAsync();
    }

    private static async Task<Guid> UserIdAsync(IServiceProvider services, string email)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.SupportUsers
            .Where(user => user.Email == email)
            .Select(user => user.Id)
            .SingleAsync();
    }

    /// <summary>
    /// The legal walk to a target, one permitted transition at a time.
    /// </summary>
    /// <remarks>
    /// <c>Closed</c> is absent, and deliberately: BR-1.5 makes it terminal — no reopen, no
    /// reassign, no comment — so a seeded queue full of closed tickets is a queue nobody can
    /// demonstrate anything on. <c>--seed</c> made the same choice for the same reason.
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
            nameof(target), target, "The bulk seed does not create closed tickets."),
    };
}
