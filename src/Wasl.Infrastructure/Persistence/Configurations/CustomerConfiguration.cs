using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Wasl.Domain.Customers;

namespace Wasl.Infrastructure.Persistence.Configurations;

/// <summary>
/// One configuration class per entity, applied by <c>ApplyConfigurationsFromAssembly</c>.
/// A growing <c>OnModelCreating</c> is where conventions go to be forgotten.
/// </summary>
internal sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    /// <summary>
    /// Case-insensitive so email uniqueness holds regardless of how a row arrives
    /// (ADR-013 row 3). The local instance already defaults to a CI collation — which is
    /// exactly why this is written explicitly: relying on the server default means the
    /// duplicate rule breaks silently on a server configured differently.
    /// </summary>
    private const string CaseInsensitiveCollation = "SQL_Latin1_General_CP1_CI_AS";

    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.ToTable("Customers");

        builder.HasKey(c => c.Id);

        // nvarchar, not varchar, for everything a human writes. varchar under a
        // non-Arabic collation returns ???? and presents as a font bug (ADR-013 row 4).
        builder.Property(c => c.FullName)
            .HasColumnType("nvarchar(200)")
            .IsRequired();

        builder.Property(c => c.Email)
            .HasColumnType("nvarchar(320)")
            .UseCollation(CaseInsensitiveCollation);

        builder.Property(c => c.PhoneE164)
            .HasColumnType("nvarchar(20)");

        builder.Property(c => c.CompanyName)
            .HasColumnType("nvarchar(200)");

        builder.Property(c => c.Notes)
            .HasColumnType("nvarchar(2000)");

        // NO column default, and this is a correction to what `001` shipped.
        //
        // `HasDefaultValue(true)` on a non-nullable bool is the same defect `009` found on
        // `Priority`: EF applies a database default whenever the property holds the CLR default,
        // and the CLR default for bool is false. So a caller explicitly deactivating a
        // customer would have been stored as ACTIVE — no error, the value simply changes on the
        // way in, and the row then contradicts the request that wrote it.
        //
        // Unreachable today, because `Customer` has no factory until `007`. `007` is also the
        // feature where deactivation starts to matter, so it would have walked straight into it.
        //
        // `IsActive` is set explicitly by whatever creates a customer. One source of truth for a
        // default, and the database was the wrong place for it.
        builder.Property(c => c.IsActive).IsRequired();

        // rowversion, maintained by the database. Not xmin, not a manual int counter —
        // the one that gets forgotten is the one that breaks (ADR-006 as amended).
        builder.Property(c => c.RowVersion)
            .IsRowVersion();

        // The contact invariant as a DATABASE guarantee (BR-4.1). It ships here rather
        // than with 007 because creating the table without it would allow a violating row
        // to exist in the window before 007 lands.
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_Customers_Contact",
            "[Email] IS NOT NULL OR [PhoneE164] IS NOT NULL"));

        // No filtered unique indexes here. They ARE the duplicate rule (BR-4.8) rather
        // than schema mechanics, and belong with the behaviour they enforce — feature 007.
        // No index on FullName either: it serves the search in 008.
    }
}
