using FluentValidation;
using Wasl.Application.Common;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.GetTickets;

/// <summary>
/// `015` AC-10 — an unaccepted filter value is a <c>400</c> that names the parameter and lists
/// what it accepts.
/// </summary>
/// <remarks>
/// <para>
/// <b>A query gets a validator, and that works because <c>ValidationBehaviour</c> is constrained
/// to <c>notnull</c> and not to <c>ICommand</c>.</b> Checked before this was written rather than
/// assumed: the transaction and audit behaviours ARE constrained to
/// <c>IAuditableCommand&lt;TResponse&gt;</c>, so a query still opens no transaction and writes no
/// audit row. Validation is the one behaviour a read passes through.
/// </para>
/// <para>
/// <b>One bad value invalidates the parameter; it is never dropped.</b> `spec.md` rules that
/// <c>?status=Open&amp;status=Bogus</c> is a <c>400</c> rather than a request for <c>Open</c> —
/// silently dropping the unrecognised half answers a different question from the one asked, and
/// the client has no way to tell. The same reasoning covers <c>?assignee=</c>.
/// </para>
/// <para>
/// <b>An EMPTY parameter is not an invalid one.</b> <c>?status=</c> is treated as no filter
/// (`spec.md`, Q-4) — not as <c>WHERE Status IN ()</c>, which returns nothing to a user who
/// filtered nothing. <c>TicketFilters.Invalid</c> returns empty for a null-or-empty list, so this
/// falls out of the parse rather than needing a rule of its own.
/// </para>
/// <para>
/// <b>The accepted values are in the message catalogue, not built here, and a test is what keeps
/// them honest.</b> The validation path resolves a message key with NO arguments —
/// <c>ProblemDetailsFactory</c> calls <c>Resolve(context, key)</c>, and only a
/// <c>DomainException</c> can carry <c>MessageArguments</c> — so threading
/// <c>TicketFilters.Accepted&lt;T&gt;()</c> into the sentence would mean changing `002`'s error
/// plumbing for a filter. The values are static per parameter, so the catalogue can hold them;
/// <c>TicketFilterMessageTests</c> then asserts that each message names <b>every</b> member of its
/// enum, in both <c>en</c> and <c>ar</c>. That test is the guard against `009`'s failure — an enum
/// gained a member and a hand-written list did not.
/// </para>
/// <para>
/// <b>The member names stay Latin in the Arabic message, deliberately.</b> BR-8 never localizes an
/// enum value, and a client branching on <c>Status</c> has to read the same six strings in every
/// language.
/// </para>
/// </remarks>
internal sealed class GetTicketsQueryValidator : AbstractValidator<GetTicketsQuery>
{
    public GetTicketsQueryValidator()
    {
        RuleFor(query => query.Status)
            .Must(values => TicketFilters.Invalid<TicketStatus>(values).Count == 0)
            .WithMessage("Validation.TicketFilter.StatusInvalid");

        RuleFor(query => query.Priority)
            .Must(values => TicketFilters.Invalid<TicketPriority>(values).Count == 0)
            .WithMessage("Validation.TicketFilter.PriorityInvalid");

        RuleFor(query => query.Category)
            .Must(values => TicketFilters.Invalid<TicketCategory>(values).Count == 0)
            .WithMessage("Validation.TicketFilter.CategoryInvalid");

        RuleFor(query => query.Channel)
            .Must(values => TicketFilters.Invalid<CommunicationChannel>(values).Count == 0)
            .WithMessage("Validation.TicketFilter.ChannelInvalid");

        /* THE CALENDAR IS CHECKED FIRST because both bounds are read through it: a typo in
         * ?calendar= would otherwise make a perfectly good Hijri date "unreadable" and name the
         * wrong parameter in the message. */
        RuleFor(query => query.Calendar)
            .Must(DateRangeFilter.IsKnownCalendar)
            .WithMessage("Validation.TicketFilter.CalendarInvalid");

        RuleFor(query => query.CreatedFrom)
            .Must((query, raw) => !DateRangeFilter.IsUnreadable(raw, query.Calendar))
            .WithMessage("Validation.TicketFilter.CreatedDateInvalid");

        RuleFor(query => query.CreatedTo)
            .Must((query, raw) => !DateRangeFilter.IsUnreadable(raw, query.Calendar))
            .WithMessage("Validation.TicketFilter.CreatedDateInvalid");

        /* THE RULE THIS FEATURE EXISTS FOR. A Hijri date is a valid Gregorian one, so without
         * these two nothing is wrong with ?createdFrom=1448-03-05 — it simply means the year
         * 1448 and matches everything. The message names ?calendar=hijri, which is the whole
         * difference between a wrong answer and a usable one. */
        RuleFor(query => query.CreatedFrom)
            .Must((query, raw) => !DateRangeFilter.LooksHijriButUndeclared(raw, query.Calendar))
            .WithMessage("Validation.TicketFilter.CalendarUndeclared");

        RuleFor(query => query.CreatedTo)
            .Must((query, raw) => !DateRangeFilter.LooksHijriButUndeclared(raw, query.Calendar))
            .WithMessage("Validation.TicketFilter.CalendarUndeclared");

        // Keyed to CreatedTo because that is the bound a caller raises to fix it, and an errors
        // object naming both would read as two independent faults.
        RuleFor(query => query.CreatedTo)
            .Must((query, _) => !query.CreatedRangeIsInverted)
            .WithMessage("Validation.TicketFilter.CreatedRangeInverted");

        // Keyed to Assignee so the errors object names `assignee`, which is the parameter the
        // client sent — the property is what FluentValidation turns into the key, and `002c`
        // lower-cases the first letter on the way out.
        RuleFor(query => query.Assignee)
            .Must((query, _) => !query.AssigneeIsUnrecognised)
            .WithMessage("Validation.TicketFilter.AssigneeInvalid");
    }
}
