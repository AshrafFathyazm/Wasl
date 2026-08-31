using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Customers.CreateCustomer;
using Wasl.Application.Features.Tickets.AddComment;
using Wasl.Application.Features.Tickets.ChangeStatus;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Application.Features.Tickets.Tags;
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

    /// <summary><c>--seed-customers</c>, and its default.</summary>
    public const string CustomersSwitch = "--seed-customers";

    public const int DefaultCustomerCount = 50;

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

    /* Fifty customers, and the names are the point. Half Arabic and half Latin, with and
     * without a company, because a directory tested on one script never shows that a row needs
     * `dir="auto"` — and `008`'s search covers name, email AND phone, so each needs to differ
     * from the others in a way a search can find. */
    private static readonly string[] ArabicGiven =
    [
        "علي", "مها", "نورة", "خالد", "سارة", "فهد", "ريم", "عمر", "لطيفة", "بدر",
        "منى", "ياسر", "هند", "طلال", "شهد", "ماجد", "أروى", "سلمان", "دانة", "ناصر",
    ];

    private static readonly string[] ArabicFamily =
    [
        "الأحمد", "العتيبي", "السالم", "القحطاني", "الحربي", "المطيري", "الدوسري",
        "الزهراني", "الشمري", "السبيعي",
    ];

    private static readonly string[] LatinNames =
    [
        "Sara Khan", "Omar Haddad", "Lina Farah", "Ziad Nasser", "Rana Aziz",
        "Tarek Mansour", "Nadia Rahman", "Karim Fouad", "Yasmin Saleh", "Hadi Barakat",
    ];

    private static readonly string?[] Companies =
    [
        "شركة الأفق للتقنية", "مؤسسة الرياض للتجارة", "Northwind Logistics",
        "شركة البحر الأحمر", "Gulf Services Ltd.", null, null, "مجموعة النخيل", null,
    ];

    /* Bodies, not lorem. A comment column sized on "Comment 12" is a column that breaks the
     * first time somebody writes a sentence. */
    private static readonly string[] CommentBodies =
    [
        "تواصلنا مع العميل وأكد أن المشكلة ما زالت قائمة بعد إعادة التشغيل.",
        "أعدنا إرسال رابط التحقق يدويًا، وطلبنا منه التأكيد خلال يوم عمل.",
        "المشكلة مرتبطة بإصدار التطبيق. أوصينا بالتحديث إلى آخر نسخة.",
        "Escalated to the payments team — waiting on their confirmation.",
        "راجعنا كشف الحساب والمبلغ خُصم مرتين فعلًا. أُحيل إلى المالية للاسترداد.",
        "لم يصلنا رد من العميل منذ ثلاثة أيام. سنغلق التذكرة إن لم يرد.",
        "The customer confirmed the workaround resolves it for now.",
        "أرفق العميل لقطة شاشة توضّح رسالة الخطأ، وهي مطابقة لبلاغ سابق.",
    ];

    private static readonly string[] InternalNotes =
    [
        "ملاحظة داخلية: هذا ثالث بلاغ من نفس البوابة هذا الأسبوع.",
        "Internal: the provider had an outage in the same window — likely related.",
        "ملاحظة داخلية: العميل من الحسابات المؤسسية، يُرجى الأولوية في الرد.",
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

    /// <summary>
    /// <c>--seed-customers [n]</c> — fifty by default.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Through <c>CreateCustomerCommand</c>, not raw SQL.</b> <c>DemoSeeder</c> writes its
    /// three with <c>INSERT</c> and says why: <c>Customer</c> had no factory until `007`. It has
    /// one now, and `007`'s own delivery found what the shortcut had hidden — <c>Customer</c>
    /// timestamps had NEVER been stamped by any code path, and the first real <c>201</c> served
    /// <c>"createdAtUtc":"0001-01-01T00:00:00"</c> as a fact. Seeding through the pipeline is what
    /// makes these rows the same shape as a row a person creates.
    /// </para>
    /// <para>
    /// <b>BR-4.8 is respected rather than bypassed.</b> Email and phone are each unique when
    /// present, so both are derived from the index and a duplicate is a <c>409</c> the seeder
    /// reports rather than a constraint violation it crashes on. Some customers get neither —
    /// the rule is "unique when present", and a directory where every row has an email cannot
    /// show that the column is optional.
    /// </para>
    /// </remarks>
    public static async Task SeedCustomersAsync(IServiceProvider services, int count)
    {
        var written = 0;
        var refused = 0;

        for (var index = 0; index < count; index++)
        {
            var latin = index % 3 == 2;
            var name = latin
                ? LatinNames[index % LatinNames.Length]
                : $"{ArabicGiven[index % ArabicGiven.Length]} {ArabicFamily[index % ArabicFamily.Length]}";

            /* A discriminator that cannot collide — RandomNumberGenerator, not a slice of a
             * Guid. `007` collided two customers on a unique index with a ten-character v7
             * prefix, and `008` matched the wrong row with a seven-character one, because a
             * time-ordered id leads with a timestamp. */
            var token = Convert.ToHexString(
                System.Security.Cryptography.RandomNumberGenerator.GetBytes(4)).ToLowerInvariant();

            /* Every fourth customer has no email and every fifth no phone — BR-4.8 says each is
             * optional and unique WHEN PRESENT, and the filtered unique indexes exist precisely
             * so a second customer with no email is allowed. A seed where everyone has both
             * never exercises that. */
            /* AT LEAST ONE CONTACT, ALWAYS — BR-4 through `Validation.Customer.ContactRequired`.
             *
             * The first version dropped the email on every fourth and the phone on every fifth
             * and never checked whether the two patterns collide. They do, at 19 and 39, and
             * the seed died there with BOTH fields refused. The validator was right: a customer
             * with no email and no phone is a customer nobody can reach, and the seeder was
             * about to write two of them.
             *
             * So the choice is exclusive now: one or the other is dropped, never both. */
            var drop = index % 4 == 3 ? 'e' : index % 5 == 4 ? 'p' : ' ';

            var email = drop == 'e' ? null : $"c{token}@example.com";
            /* DIGITS, not the hex token. The first version spliced `token[..3]` into the number
             * and every call came back `400 Validation.Customer.PhoneInvalid` — hex is
             * [0-9a-f] and three of those characters are letters. The validator was right and
             * the seeder was wrong, which is the useful direction: a seed that produced an
             * unparseable phone would have been a seed writing data the product refuses. */
            var digits = Convert.ToHexString(
                System.Security.Cryptography.RandomNumberGenerator.GetBytes(4))
                .Aggregate(0L, (acc, c) => acc * 10 + (c % 10)) % 10_000_000;

            var phone = drop == 'p' ? null : $"+9665{digits:D7}";

            try
            {
                using var scope = services.CreateScope();
                await scope.ServiceProvider.GetRequiredService<ISender>().Send(
                    new CreateCustomerCommand(
                        $"{name} {token[..3]}",
                        email,
                        phone,
                        Companies[index % Companies.Length]));

                written++;
            }
            catch (Exception failure) when (failure.GetType().Name.Contains("Duplicate"))
            {
                /* BR-4.8 doing its job. Counted and reported rather than swallowed: a seeder
                 * that silently writes fewer rows than it says is a seeder nobody can reason
                 * about when a screen looks short. */
                refused++;
            }
        }

        Console.WriteLine($"--seed-customers: wrote {written} customers, {refused} refused as duplicates.");
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

        /* ADOPT A REAL IDENTITY BEFORE WRITING ANYTHING.
         *
         * A comment needs one: `TicketComment.AuthorUserId` is non-nullable with a foreign key
         * and `Ticket.AddComment` stamps it from `ICurrentUser`, so with no principal this
         * seeder would write `Guid.Empty` and meet `Error Number:547` — the same failure
         * `009`'s fabricated assignee id produced once `004` gave the column its FK.
         *
         * The actor is the seeded MANAGER, not an invention. ADR-005 rejects a fabricated
         * identity; this is a support user that `SupportUserSeeder` created and that a person
         * signs in as, so the rows it authors are attributed to somebody who really exists and
         * are indistinguishable from rows produced by clicking through the product.
         *
         * Resolved rather than asserted: if `--seed` has not run, `Become` throws with a
         * sentence about identity instead of letting a foreign key fail later. */
        if (services.GetService<SeedActor>() is { } actor)
        {
            actor.Become(manager, SupportUserSeeder.ManagerEmail, "Manager");
        }
        var agents = new[]
        {
            await UserIdAsync(services, SupportUserSeeder.AgentEmail),
            await UserIdAsync(services, SupportUserSeeder.AgentTwoEmail),
        };

        var written = 0;
        var comments = 0;
        var tags = 0;
        var tagIds = await TagIdsAsync(services);
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

            var ticketId = await SeedOneAsync(
                services,
                customers[index % customers.Count],
                topic,
                Priorities[index % Priorities.Length],
                Channels[index % Channels.Length],
                assignee,
                status);

            /* NOT ON EVERY TICKET. Roughly two in three get a comment and one in two a tag,
             * because a queue where every row looks the same measures nothing: the timeline's
             * empty state, an untagged ticket and the "no comments yet" case all have to be
             * reachable from seeded data or they are only ever seen in production. */
            if (index % 3 != 2)
            {
                comments += await SeedCommentsAsync(services, ticketId, index);
            }

            if (index % 2 == 0)
            {
                tags += await SeedTagsAsync(services, ticketId, index, tagIds);
            }

            written++;
            byBucket[bucket]++;
            byStatus[status] = byStatus.GetValueOrDefault(status) + 1;
        }

        Console.WriteLine($"{Switch}: wrote {written} tickets, {comments} comments, {tags} tag attachments.");
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

    private static async Task<Guid> SeedOneAsync(
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
                created.Id, step, version, Note: StepNote(step)));

            // The token from the RESPONSE, not the one just used. Every write moves the
            // rowversion, and `009`'s seeder died on exactly this before it learned to.
            version = moved.Version;
        }

        return created.Id;
    }

    /// <summary>
    /// One or two comments, through the real command — so each writes its `CommentAdded`
    /// history row and its audit row.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This is the reason `SeedActor` exists.</b> A comment written with `INSERT` would
    /// appear in the timeline and have no history row beside it and no audit trail behind it —
    /// data the product could not have produced, on the one screen built to show exactly those
    /// two things.
    /// </para>
    /// <para>
    /// <b>Every third comment is internal (BR-5.4).</b> An internal note is MARKED, never
    /// hidden, and a seed with none of them never shows the marker — which is the only visual
    /// difference between a reply the customer sees and one they do not.
    /// </para>
    /// </remarks>
    private static async Task<int> SeedCommentsAsync(
        IServiceProvider services, Guid ticketId, int index)
    {
        var written = 0;

        // One comment, and a second on every fourth ticket — a timeline with exactly one entry
        // never shows how two of them sit together.
        var howMany = index % 4 == 0 ? 2 : 1;

        for (var n = 0; n < howMany; n++)
        {
            var internalNote = (index + n) % 3 == 2;

            var body = internalNote
                ? InternalNotes[(index + n) % InternalNotes.Length]
                : CommentBodies[(index + n) % CommentBodies.Length];

            using var scope = services.CreateScope();

            await scope.ServiceProvider.GetRequiredService<ISender>().Send(
                new AddTicketCommentCommand(ticketId, body, internalNote));

            written++;
        }

        return written;
    }

    /// <summary>
    /// One or two tags, attached directly.
    /// </summary>
    /// <remarks>
    /// <b>Direct, unlike the comments, and the difference is worth stating.</b>
    /// `AttachTicketTagCommand` would work — it takes no `ICurrentUser` — but
    /// `TicketTag.AttachedByUserId` is stamped the same way a comment's author is, so it needs
    /// the same actor and gets it. It goes through the command for exactly that reason: the
    /// attachment writes an audit row, and `034` AC-13 is the criterion that says so.
    /// </remarks>
    private static async Task<int> SeedTagsAsync(
        IServiceProvider services, Guid ticketId, int index, IReadOnlyList<Guid> tagIds)
    {
        if (tagIds.Count == 0)
        {
            return 0;
        }

        var howMany = index % 5 == 0 ? 2 : 1;
        var written = 0;

        for (var n = 0; n < howMany && n < tagIds.Count; n++)
        {
            using var scope = services.CreateScope();

            await scope.ServiceProvider.GetRequiredService<ISender>().Send(
                new AttachTicketTagCommand(ticketId, tagIds[(index + n) % tagIds.Count]));

            written++;
        }

        return written;
    }

    private static async Task<IReadOnlyList<Guid>> TagIdsAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.Tags
            .Where(tag => tag.IsActive)
            .OrderBy(tag => tag.Name)
            .Select(tag => tag.Id)
            .ToListAsync();
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
    /// <summary>
    /// A believable reason for a transition, in the interface language of the data.
    /// </summary>
    /// <remarks>
    /// <b>The literal "seeded" was rendering on screen.</b> `012` writes the note onto the
    /// history row and `027` shows it under the event, so every seeded status change displayed
    /// an English developer word in an Arabic timeline. A note is user content — the product
    /// never translates it (BR-8.10) — so the seed has to write one a reader can believe.
    /// </remarks>
    private static string StepNote(TicketStatus step) => step switch
    {
        TicketStatus.Open => "تمت المراجعة الأولية وفتح التذكرة للعمل عليها.",
        TicketStatus.InProgress => "بدأ العمل على البلاغ.",
        TicketStatus.PendingCustomer => "بانتظار رد العميل على الاستفسار المرسل.",
        TicketStatus.Resolved => "تم حل المشكلة وإبلاغ العميل.",
        _ => "تحديث الحالة.",
    };

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
