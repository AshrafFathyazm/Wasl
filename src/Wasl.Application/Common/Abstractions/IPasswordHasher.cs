namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// Hashes and verifies a password. Declared here, implemented in <c>Wasl.Infrastructure</c> over
/// ASP.NET Core Identity's <c>PasswordHasher&lt;T&gt;</c>.
/// </summary>
/// <remarks>
/// <para>
/// An interface for the layer boundary, the same reason as <c>ITicketNumberGenerator</c>: the
/// handler is in this project and <c>PasswordHasher&lt;T&gt;</c> lives in
/// <c>Microsoft.Extensions.Identity.Core</c>.
/// </para>
/// <para>
/// <b>Nothing here invents a hashing scheme.</b> The implementation is the framework's PBKDF2 in
/// its V3 format — a hand-rolled derivation is the one piece of security code a project should
/// never write, and this interface exists so that choice is made in one file.
/// </para>
/// </remarks>
public interface IPasswordHasher
{
    string Hash(string password);

    /// <summary>
    /// Whether <paramref name="password"/> matches <paramref name="hash"/>.
    /// </summary>
    /// <remarks>
    /// Returns a bool rather than throwing, because a wrong password is an expected outcome the
    /// caller maps to a <c>401</c> — not an exceptional one. The comparison is the framework's,
    /// which makes it constant-time with respect to the hash.
    /// </remarks>
    bool Verify(string hash, string password);

    /// <summary>
    /// A real hash of a value nobody knows, for verifying against when no user was found.
    /// </summary>
    /// <remarks>
    /// <b>This exists to close a timing oracle.</b> AC-4 requires the response for an unknown
    /// email and a wrong password to be byte-identical — and identical bodies are not enough if
    /// one path skips the key-derivation work. PBKDF2 is deliberately slow, so "no such user"
    /// would answer measurably faster than "wrong password", and the difference is the same
    /// account-enumeration oracle arriving through the clock instead of through the body.
    /// </remarks>
    string DummyHash { get; }
}
