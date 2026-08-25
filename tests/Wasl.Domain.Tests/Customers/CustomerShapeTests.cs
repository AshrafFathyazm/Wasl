using System.Reflection;
using FluentAssertions;
using Wasl.Domain.Customers;

namespace Wasl.Domain.Tests.Customers;

/// <summary>
/// Feature 001 leaves <see cref="Customer"/> as a shell — its factory, its value objects,
/// and the at-least-one-contact invariant (BR-4.1) are feature 007's, where they are
/// specified and tested.
/// </summary>
/// <remarks>
/// <para>
/// So there is no behaviour to test yet, and asserting that a property returns what was
/// assigned to it would be testing the compiler.
/// </para>
/// <para>
/// What <em>is</em> worth pinning is the shape, because it is a decision rather than an
/// accident: the type is sealed, has no public constructor, and exposes no public setter.
/// That is what stops it drifting into a mutable bag in the window before 007 arrives —
/// and a later change that opens it up would otherwise pass review as a convenience.
/// </para>
/// </remarks>
public sealed class CustomerShapeTests
{
    [Fact]
    public void Customer_cannot_be_constructed_from_outside_the_domain()
    {
        typeof(Customer).GetConstructors(BindingFlags.Public | BindingFlags.Instance)
            .Should().BeEmpty(
                "an aggregate is created through a factory that enforces its invariants, "
                + "not through a constructor that enforces nothing. Feature 007 adds "
                + "Customer.Create; until then there is no legitimate way to make one");
    }

    [Fact]
    public void Customer_exposes_no_public_setter()
    {
        var settable = typeof(Customer)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(property => property.SetMethod is { IsPublic: true })
            .Select(property => property.Name)
            .ToArray();

        settable.Should().BeEmpty(
            "state changes go through behaviour that can enforce a rule. A public setter "
            + "is a rule that cannot be enforced");
    }

    [Fact]
    public void Customer_is_sealed()
    {
        typeof(Customer).IsSealed.Should().BeTrue(
            "nothing in the design calls for a Customer subtype, and an open aggregate "
            + "root invites one to appear without a reason being written down");
    }
}
