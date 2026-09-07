using FluentValidation;

namespace Wasl.Application.Features.Dashboard.GetDashboard;

/// <summary>
/// AC-15 — an unaccepted <c>range</c> is a `400` that names the parameter and lists what it takes.
/// </summary>
/// <remarks>
/// <para>
/// <b>A query gets a validator, and that works because <c>ValidationBehaviour</c> is constrained
/// to <c>notnull</c> rather than to <c>ICommand</c></b> — the same thing `015`'s validator relies
/// on. The transaction and audit behaviours ARE constrained to <c>IAuditableCommand</c>, so this
/// read still opens no transaction and writes no audit row.
/// </para>
/// <para>
/// <b>A bad value is refused, never defaulted.</b> <c>?range=90d</c> could plausibly answer with
/// 14 days, and that is the worse behaviour: the client asked a question it believes was answered
/// and the screen's header would echo <c>14d</c> under a chart the reader requested three months
/// of. A `400` is the only response that cannot be misread.
/// </para>
/// <para>
/// <b>The accepted values live in the catalogue, not in this sentence.</b> The validation path
/// resolves a key with NO arguments — only a <c>DomainException</c> carries
/// <c>MessageArguments</c> — so threading <c>DashboardRange.Accepted</c> into the message would
/// mean changing `002`'s error plumbing for one parameter. The three values are static, so the
/// catalogue can hold them, and they stay Latin in the Arabic message because BR-8.7 never
/// localizes a contract literal.
/// </para>
/// </remarks>
internal sealed class GetDashboardQueryValidator : AbstractValidator<GetDashboardQuery>
{
    public GetDashboardQueryValidator()
    {
        /* SENDING IT TWICE IS A `400`, NOT FIRST-WINS — and this rule exists because the
         * endpoint was measured doing the opposite. `?range=7d&range=30d` answered `200` with a
         * seven-day body: MVC bound the first value to a `string?` parameter and nothing anywhere
         * could see the second. The parameter is a collection now, so repetition is visible here.
         *
         * A SEPARATE MESSAGE from the accepted-values one. "Not an accepted range. Accepted
         * values: 7d, 14d, 30d." under `?range=7d&range=30d` names a rule the caller did not
         * break — both values were accepted — and sends them looking at the wrong thing. */
        RuleFor(query => query.Range)
            .Must(values => values is null || values.Length <= 1)
            .WithMessage("Validation.Dashboard.RangeRepeated");

        RuleFor(query => query.Selected)
            .Must(DashboardRange.IsAccepted)
            .WithMessage("Validation.Dashboard.RangeInvalid")

            /* THE KEY IN `errors` IS PART OF THE CONTRACT and it is `range`, the request
             * parameter — never the CLR member the rule happens to read. `Selected` is a computed
             * property, so without this the response would name a field the caller never sent and
             * a client keying its form messages off `errors.range` would silently show nothing.
             * `ProblemDetailsFactory` lowercases the first character, so `Range` becomes `range`. */
            .OverridePropertyName("Range")

            /* Only when the repetition rule passed. Two messages under one field for one request
             * is a form telling the reader they made two mistakes when they made one — and with a
             * repeated parameter `Selected` is whichever value happened to be first, so the
             * second message would be about a value the caller cannot see. */
            .When(query => query.Range is null || query.Range.Length <= 1);
    }
}
