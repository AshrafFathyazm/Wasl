using Wasl.Application.Common.Messaging;
using MediatR;
using Wasl.Domain.Audit;

namespace Wasl.Application.Features.Users.ChangeMyLanguage;

/// <summary>
/// Stores the caller's interface language. `005b`, FR-5.5.
/// </summary>
/// <remarks>
/// <para>
/// <b>No user id, and that is the security property.</b> The subject comes from the bearer token
/// through <c>ICurrentUser</c>, so there is no field a caller could set to write another user's
/// preference — which is stronger than checking one, because there is nothing to check.
/// </para>
/// <para>
/// <b>No <c>expectedVersion</c>, deliberately.</b> Every other <c>PUT</c> in this API takes one,
/// and each of those guards a shared resource two people can edit. This writes one scalar to the
/// caller's own row, where a lost update means the user's own last click won — which is what they
/// asked for. Requiring a version here would be consistency for its own sake, and the frozen
/// contract's request shape has one field.
/// </para>
/// </remarks>
public sealed record ChangeMyLanguageCommand(string Language) : IAuditableCommand<Unit>
{
    /// <summary>Already in BR-9's action list — read from the blueprint, not invented.</summary>
    public string AuditAction => "User.LanguageChanged";

    /// <summary>
    /// The user is the target, and the NEW language is the label.
    /// </summary>
    /// <remarks>
    /// The id is not on the command — it comes from the token — so the target is described
    /// without it and the actor columns carry who it was. An investigation reading
    /// <c>WHERE Action = 'User.LanguageChanged'</c> gets the actor from the row it already has.
    /// </remarks>
    public AuditTarget DescribeTarget(Unit response) => new("SupportUser", null, Language);
}
