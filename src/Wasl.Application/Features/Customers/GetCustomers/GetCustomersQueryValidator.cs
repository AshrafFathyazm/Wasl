using FluentValidation;
using Wasl.Application.Common;

namespace Wasl.Application.Features.Customers.GetCustomers;

/// <summary>
/// <c>GET /api/customers</c>'s parameters. `033` §5.1–5.5.
/// </summary>
/// <remarks>
/// <para>
/// <b>The first validator this query has had.</b> `008` shipped with none, correctly: `search`
/// is free text and both paging parameters CLAMP rather than reject, so there was nothing a
/// validator could refuse. `033` adds two enums and a date range, and §5.5 rules the enums a
/// `400` — which is the first thing here that has no nearest legal value.
/// </para>
/// <para>
/// <b>A query gets a validator at all because <c>ValidationBehaviour</c> is constrained to
/// <c>notnull</c>, not to <c>ICommand</c></b> — checked, not assumed, and `015` records the
/// same check. The transaction and audit behaviours stay constrained to
/// <c>IAuditableCommand&lt;TResponse&gt;</c>, so this read still opens no transaction and writes
/// no audit row.
/// </para>
/// <para>
/// <b>Every message is a catalogue key</b> (`002c`'s gate): `002`'s message source resolves an
/// unknown key by returning the key, so a missing translation is a well-formed and useless
/// response — and `004b` found seventeen of exactly that shipped under tests which asserted
/// only that the field was present.
/// </para>
/// </remarks>
internal sealed class GetCustomersQueryValidator : AbstractValidator<GetCustomersQuery>
{
    public GetCustomersQueryValidator()
    {
        /* §5.5. Not clamped, not defaulted: `?sort=email` has no nearest legal value, and
         * silently ordering by name instead returns a correct-looking page in the wrong order.
         * The accepted list is READ FROM THE ENUM — `009` shipped two invented members by
         * transcribing a set by hand. */
        RuleFor(query => query.Sort)
            .Must(value => !CustomerFilters.IsUnreadable<CustomerSort>(value))
            .WithMessage("Validation.CustomerFilter.SortInvalid");

        RuleFor(query => query.Dir)
            .Must(value => !CustomerFilters.IsUnreadable<SortDirection>(value))
            .WithMessage("Validation.CustomerFilter.DirInvalid");

        /* THE CALENDAR IS CHECKED BEFORE THE BOUNDS, for the reason `015`'s validator states:
         * both dates are read through it, so a typo in `?calendar=` would otherwise make a
         * perfectly good Hijri date "unreadable" and name the wrong parameter. */
        RuleFor(query => query.Calendar)
            .Must(DateRangeFilter.IsKnownCalendar)
            .WithMessage("Validation.CustomerFilter.CalendarInvalid");

        RuleFor(query => query.CreatedFrom)
            .Must((query, raw) => !DateRangeFilter.IsUnreadable(raw, query.Calendar))
            .WithMessage("Validation.CustomerFilter.CreatedDateInvalid");

        RuleFor(query => query.CreatedTo)
            .Must((query, raw) => !DateRangeFilter.IsUnreadable(raw, query.Calendar))
            .WithMessage("Validation.CustomerFilter.CreatedDateInvalid");

        /* A HIJRI DATE IS A VALID GREGORIAN ONE, so without this nothing is wrong with
         * `?createdFrom=1448-03-05` — it means the year 1448 and matches everything. The message
         * names `?calendar=hijri`, which is the difference between a wrong answer and a usable
         * one. `015` built the check; this is its second consumer. */
        RuleFor(query => query.CreatedFrom)
            .Must((query, raw) => !DateRangeFilter.LooksHijriButUndeclared(raw, query.Calendar))
            .WithMessage("Validation.CustomerFilter.CalendarUndeclared");

        RuleFor(query => query.CreatedTo)
            .Must((query, raw) => !DateRangeFilter.LooksHijriButUndeclared(raw, query.Calendar))
            .WithMessage("Validation.CustomerFilter.CalendarUndeclared");

        /* AN INVERTED RANGE IS A `400`, AND §5.4 IS SUPERSEDED — ruled 2026-09-03.
         *
         * §5.4 read "`createdFrom > createdTo` describes a window with nothing in it, and
         * `totalCount: 0` says so". It does not describe a window at all: it is a contradiction.
         * A window with nothing in it is `from == to` on a day with no customers, and that
         * correctly returns zero.
         *
         * MEASURED, both screens, before the change:
         *   GET /api/customers?createdFrom=2026-09-01&createdTo=2026-08-01
         *     -> 200 {"items":[],"totalCount":0}, and the screen said «لا عميل يطابق هذا»
         *   GET /api/tickets?createdFrom=2026-09-01&createdTo=2026-08-01
         *     -> 400 errors/validation
         * The `200` is a false claim about the DATA in answer to a broken claim about the
         * REQUEST — the same reasoning `015` recorded for tickets, and the reason
         * "`200` is never returned with an error in the body" is a contract rule here.
         *
         * Keyed to `CreatedTo` for the reason the ticket validator gives: that is the bound a
         * caller raises to fix it, and an `errors` object naming both reads as two faults. */
        RuleFor(query => query.CreatedTo)
            .Must((query, _) => !query.CreatedRangeIsInverted)
            .WithMessage("Validation.CustomerFilter.CreatedRangeInverted");
    }
}
