using Microsoft.AspNetCore.Identity;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Users;

namespace Wasl.Infrastructure.Auth;

/// <summary>
/// ASP.NET Core Identity's PBKDF2 hasher, behind <see cref="IPasswordHasher"/>.
/// </summary>
/// <remarks>
/// <para>
/// <b>Nothing here invents a derivation scheme.</b> <c>PasswordHasher&lt;T&gt;</c> produces the
/// V3 format — PBKDF2-HMAC-SHA512 with a per-password salt and a version byte, so the format can
/// be upgraded later without invalidating existing hashes. A hand-rolled hash is the one piece of
/// security code a project should never write, and this class exists so that decision is visible
/// in one file rather than implied by its absence.
/// </para>
/// <para>
/// <see cref="Verify"/> returns a bool rather than throwing: a wrong password is an expected
/// outcome the caller maps to a `401`, not an exceptional one. The comparison is the framework's,
/// which makes it fixed-time with respect to the stored hash.
/// </para>
/// <para>
/// The <c>null!</c> user argument is deliberate. <c>PasswordHasher&lt;TUser&gt;</c> takes the user
/// only to satisfy an interface it does not use — it reads nothing from it — and passing the real
/// entity would suggest the hash is bound to that user when it is not.
/// </para>
/// </remarks>
internal sealed class IdentityPasswordHasher : IPasswordHasher
{
    private readonly PasswordHasher<SupportUser> _hasher = new();

    public IdentityPasswordHasher() =>
        DummyHash = _hasher.HashPassword(null!, new string('\0', 64));

    /// <summary>
    /// A real hash of a value nobody knows, computed once at construction.
    /// </summary>
    /// <remarks>
    /// Computed eagerly and cached, because the point is to spend the <b>same</b> work verifying a
    /// sign-in for an unknown email as for one with a wrong password. Hashing per request would
    /// spend double; hashing lazily would make the first unknown-email attempt slower than the
    /// rest, which is a smaller version of the same timing oracle.
    /// </remarks>
    public string DummyHash { get; }

    public string Hash(string password) => _hasher.HashPassword(null!, password);

    public bool Verify(string hash, string password) =>
        _hasher.VerifyHashedPassword(null!, hash, password) is not PasswordVerificationResult.Failed;
}
