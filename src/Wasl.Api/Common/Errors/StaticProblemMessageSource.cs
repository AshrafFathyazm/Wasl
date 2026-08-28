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

        // `004b`. The OTHER title under the same `type`: this one answers a request that supplied
        // credentials, and it names neither which field was wrong nor whether the account exists —
        // one sentence for a wrong password, an unknown email, and a deactivated user alike.
        ["Error.Auth.InvalidCredentials.Title"] = "Email or password is incorrect.",
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

        // ── `004b` — seventeen keys that were reaching clients unresolved ────────────
        //
        // Found by ResourceKeyLeakTests on its first run, immediately after it was written to
        // stop the login-screen defect recurring. It did not merely confirm that one: it found
        // that EVERY FluentValidation message in this API was a raw key, so a 400 rendered
        // "Validation.Ticket.SubjectRequired" under the subject field on every form.
        //
        // The mechanism is `002`'s deliberate key-instead-of-throw fallback, which is the right
        // runtime behaviour — a missing translation must not turn a 400 into a 500 — and which
        // makes the failure invisible in every server test that asserts a field is *present*.
        //
        // English here, as the fallback catalogue. `005` moves these to .resx with Arabic
        // alongside; the keys do not change, which is the whole point of having authored them
        // as keys from the first line of code (ADR-007 §5).

        ["Error.Auth.InvalidCredentials"] = "Email or password is incorrect.",
        ["Error.Ticket.CustomerNotFound"] = "No customer was found with that id.",

        ["Validation.Auth.EmailRequired"] = "Enter your email address.",
        ["Validation.Auth.PasswordRequired"] = "Enter your password.",

        ["Validation.Ticket.CustomerRequired"] = "Choose a customer.",
        ["Validation.Ticket.SubjectRequired"] = "Enter a subject.",
        ["Validation.Ticket.SubjectTooLong"] = "The subject is too long.",
        ["Validation.Ticket.DescriptionRequired"] = "Describe the problem.",
        ["Validation.Ticket.DescriptionTooLong"] = "The description is too long.",
        ["Validation.Ticket.CategoryInvalid"] = "Choose a valid category.",
        ["Validation.Ticket.ChannelInvalid"] = "Choose a valid channel.",
        ["Validation.Ticket.PriorityInvalid"] = "Choose a valid priority.",
        ["Validation.Ticket.StatusInvalid"] = "Choose a valid status.",
        ["Validation.Ticket.NoteRequiredToClose"] = "Add a note explaining why this is being closed.",
        ["Validation.Ticket.NoteTooLong"] = "The note is too long.",

        // No length or format is quoted in either of these. The client holds the token opaquely
        // and cannot act on "it must be base64" — the only useful instruction is to reload.
        ["Validation.Ticket.ExpectedVersionRequired"] = "Reload the ticket and try again.",
        ["Validation.Ticket.ExpectedVersionUndecodable"] = "Reload the ticket and try again.",

        // ── `013` ───────────────────────────────────────────────────────────────────
        // Added in the same commit as the keys, which is the rule `004b` wrote into CLAUDE.md
        // after seventeen went out without one.
        ["Validation.Comment.BodyRequired"] = "Write something before posting.",
        ["Validation.Comment.BodyTooLong"] = "The comment is too long.",
        ["Validation.Comment.ChannelInvalid"] = "Choose a valid channel.",

        // ── `008` ───────────────────────────────────────────────────────────────────
        // Names no id and no field: a 404 that distinguishes "no such customer" from "a customer
        // you may not see" is an enumeration oracle, which BR-4.4 forbids for duplicates and the
        // same reasoning covers here.
        ["Error.Customer.NotFound"] = "No customer was found with that id.",

        // ── `011` ───────────────────────────────────────────────────────────────────
        ["Error.AssigneeUnchanged.Title"] = "This ticket is already assigned to that user.",
        ["Error.AssigneeNotFound.Title"] = "No such support user.",

        // The 403 detail says the action is not permitted and stops. It names neither the current
        // assignee nor what would have been allowed: a denial is not the place to disclose state,
        // and an Agent could otherwise learn who owns every ticket they are refused, one request
        // at a time.
        ["Error.Ticket.AssignNotPermitted"] = "You are not permitted to change this ticket's assignee.",
        ["Error.Ticket.AssigneeUnchanged"] = "The ticket already has that assignee.",
        ["Error.Ticket.AssigneeNotFound"] = "No support user was found with that id.",
        ["Validation.Ticket.AssigneeInactive"] = "This user is not active and cannot be assigned tickets.",
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
