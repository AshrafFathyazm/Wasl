namespace Wasl.Domain.Users;

/// <summary>
/// What a member of the support team may do. BR-6.
/// </summary>
/// <remarks>
/// Two roles, and the product scope names no third. Stored as a string (ADR-013) so a database
/// dump stays readable and reordering the members cannot re-label existing rows.
/// </remarks>
public enum SupportRole
{
    /// <summary>
    /// Works tickets. May self-assign an unassigned ticket, and may not assign to anyone else
    /// (BR-2).
    /// </summary>
    Agent,

    /// <summary>Assigns anyone, and acts on any ticket (BR-2, BR-6).</summary>
    Manager,
}
