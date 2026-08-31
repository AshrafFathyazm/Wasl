using Microsoft.EntityFrameworkCore;
using Wasl.Domain.Tickets;

namespace Wasl.Infrastructure.Persistence.Seed;

/// <summary>
/// The managed sets the product reads but has no screen to write: tags and reply templates.
/// `034` Q-3.
/// </summary>
/// <remarks>
/// <para>
/// <b>Not demo data.</b> `--seed` also writes demo customers and tickets, and those exist to make
/// a walkthrough possible. These do not: the tag picker and the reply menu are empty without
/// them, on any database, forever. That is why this runs outside the "tickets already exist"
/// early return.
/// </para>
/// <para>
/// <b>Idempotent by name.</b> It adds what is missing and touches nothing else, so running
/// `--seed` twice does not duplicate a tag — and the unique index would refuse it anyway, which
/// is the guarantee behind this convenience.
/// </para>
/// <para>
/// <b>Arabic content, deliberately.</b> The product's primary language is Arabic and these are
/// the first rows anyone sees in the picker. Seeding them in English would make the first Arabic
/// pass over the ticket detail a test of the seeder rather than of the screen.
/// </para>
/// </remarks>
public static class ReferenceDataSeeder
{
    private static readonly DateTime SeededAtUtc = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static readonly string[] TagNames =
    [
        "خصم مزدوج",
        "استرداد",
        "متابعة مالية",
        "عميل متكرر",
        "يحتاج مراجعة فنية",
    ];

    private static readonly (string Title, string Body, TicketCategory? Category)[] Replies =
    [
        ("تأكيد استلام الشكوى",
            "شكراً لتواصلك. استلمنا شكواك وجاري مراجعتها، وسنعود إليك بالتحديث خلال يوم عمل.",
            null),
        ("إشعار بالإغلاق",
            "نظراً لحل المشكلة سنغلق التذكرة. يمكنك الرد على هذه الرسالة لإعادة فتحها في أي وقت.",
            null),
        ("موعد الاسترداد",
            "سيُعاد المبلغ إلى وسيلة الدفع خلال 3–5 أيام عمل، وسيصلك إشعار عند تنفيذه.",
            TicketCategory.Billing),
        ("طلب كشف حساب",
            "لإكمال المراجعة نحتاج صورة من كشف الحساب تُظهر العملية وتاريخها.",
            TicketCategory.Billing),
        ("طلب تفاصيل تقنية",
            "لمساعدتك بشكل أسرع، أرسل لنا نوع الجهاز ونسخة التطبيق ووقت حدوث المشكلة.",
            TicketCategory.Technical),
    ];

    public static async Task SeedAsync(WaslDbContext context)
    {
        var existingTags = await context.Tags
            .Select(tag => tag.Name)
            .ToListAsync();

        foreach (var name in TagNames.Where(name => !existingTags.Contains(name)))
        {
            context.Tags.Add(Tag.Create(name, SeededAtUtc));
        }

        var existingReplies = await context.CannedReplies
            .Select(reply => reply.Title)
            .ToListAsync();

        foreach (var (title, body, category) in Replies.Where(
            reply => !existingReplies.Contains(reply.Title)))
        {
            context.CannedReplies.Add(CannedReply.Create(title, body, SeededAtUtc, category));
        }

        await context.SaveChangesAsync();
    }
}
