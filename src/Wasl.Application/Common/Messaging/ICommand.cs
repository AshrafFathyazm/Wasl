namespace Wasl.Application.Common.Messaging;

/// <summary>
/// Marks a request that <b>changes state</b>. <c>TransactionBehaviour</c> keys on this, so
/// implementing it is what opens a transaction — and not implementing it is what keeps a
/// query out of one (AC-16).
/// </summary>
/// <remarks>
/// <para>
/// A marker with no members, which the constitution's "no abstraction without a consumer"
/// rule would normally question. It has two consumers on the day it is written: the
/// transaction behaviour and the NFR-10 scanner. The scanner is the important one — it is
/// what makes <see cref="IAuditableCommand{TResponse}"/> impossible to forget, and it needs
/// something to enumerate.
/// </para>
/// <para>
/// <b>In <c>Wasl.Application</c>, not <c>Wasl.Api</c></b> (`research.md` R-7). The commands
/// that implement it live in <c>Wasl.Application/Features/</c>; a marker in <c>Wasl.Api</c>
/// would sit above its own implementers in the dependency direction and would not compile.
/// It cannot live in <c>Wasl.Domain</c> either, because that project declares zero packages
/// and <see cref="IAuditableCommand{TResponse}"/> derives from a MediatR type.
/// </para>
/// </remarks>
public interface ICommand;
