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

        builder.Property(c => c.IsActive)
            .HasDefaultValue(true);

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
