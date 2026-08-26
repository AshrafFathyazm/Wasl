using System.Globalization;

namespace Wasl.Api.Common.Errors;

/// <summary>
/// The only implementation in `002`: a static English table.
/// </summary>
/// <remarks>
/// <para>
/// Deliberately not `.resx`. Adding resource infrastructure here would mean doing `005`'s
/// job inside `002`, and both features would then be half-done (`research.md` R-3).
/// </para>
/// <para>
/// The sentences live <b>here</b> and nowhere else, which is the whole point: `005` deletes
/// this file, registers a localizer-backed implementation, and no other production file
/// changes.
/// </para>
/// <para>
/// A key with no entry returns the key itself rather than throwing. A missing sentence is a
/// cosmetic defect; an exception thrown while building an error response turns a `409` into
/// a `500` and loses the original failure entirely.
/// </para>
/// </remarks>
internal sealed class StaticProblemMessageSource : IProblemMessageSource
{
    private static readonly Dictionary<string, string> Messages = new(StringComparer.Ordinal)
    {
        // Titles — one per registry row.
        ["Error.Validation.Title"] = "One or more validation errors occurred.",
        ["Error.Internal.Title"] = "An unexpected error occurred.",
        ["Error.MalformedRequest.Title"] = "The request could not be read.",
        ["Error.NotFound.Title"] = "The requested resource was not found.",
        ["Error.MethodNotAllowed.Title"] = "That method is not allowed on this path.",
        ["Error.UnsupportedMediaType.Title"] = "The request body must be JSON.",
        ["Error.Unauthenticated.Title"] = "Authentication is required.",
        ["Error.Forbidden.Title"] = "You do not have permission to do that.",
        ["Error.DuplicateCustomer.Title"] = "A customer with this value already exists.",
        ["Error.InvalidStatusTransition.Title"] = "That status change is not permitted.",
        ["Error.TicketClosed.Title"] = "This ticket is closed.",
        ["Error.SameStatusTransition.Title"] = "The ticket is already in that status.",
        ["Error.AssigneeRequired.Title"] = "A ticket must have an assignee before work can start.",
        ["Error.AlreadyEscalated.Title"] = "This ticket is already escalated.",
        ["Error.ConcurrencyConflict.Title"] = "This record changed while you were editing it.",

        // Details.
        ["Error.Validation.Detail"] = "See the errors property for field-level messages.",

        // `012`. AC-3 requires the detail to name the current status and what IS permitted, so
        // the client can offer a real alternative rather than a dead end. The arguments come from
        // the domain exception; this is the only place the sentence around them exists.
        ["Error.Ticket.InvalidTransition"] = "The ticket is {0}. Permitted transitions: {1}.",
        ["Error.Ticket.SameStatus"] = "The ticket is already {0}.",
        ["Error.Ticket.Closed"] = "A closed ticket cannot be changed.",
        ["Error.Ticket.AssigneeRequired"] = "Assign the ticket before starting work on it.",
        ["Error.Ticket.ConcurrencyConflict"] = "Reload the ticket and try again.",
        ["Error.Ticket.NotFound"] = "No ticket was found with that id.",
    };

    public string Resolve(HttpContext context, string key, IReadOnlyList<object>? arguments = null)
    {
        _ = context; // The culture is irrelevant to a single-language table. 005 uses it.

        if (!Messages.TryGetValue(key, out var template))
        {
            return key;
        }

        return arguments is { Count: > 0 }
            ? string.Format(CultureInfo.InvariantCulture, template, [.. arguments])
            : template;
    }
}
