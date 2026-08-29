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
        // ── The collation is EXPLICIT on every searched column — `008` AC-16 ─────────
        //
        // `001` gave Email an explicit CI collation and left these three inheriting the database
        // default, which made two thirds of `008`'s search surface case-insensitive BY LUCK OF
        // THE SERVER. On a `_CS_AS` instance — the default in several installers — searching
        // `ahmed` would silently miss `Ahmed`, and nothing in the code would look wrong: the LINQ
        // is identical, no exception is thrown, and the result set is simply smaller.
        //
        // Fixed in the schema rather than with COLLATE in the query, and the reason is measurable:
        // an in-query COLLATE makes the column expression non-sargable, so every search becomes a
        // scan — and it would have to be repeated in `015` and `017`, which search the same
        // columns. AC-16 asserts the collation by reading COLLATION_NAME back from
        // INFORMATION_SCHEMA, not from this file.
        builder.Property(c => c.FullName)
            .HasColumnType("nvarchar(200)")
            .UseCollation(CaseInsensitiveCollation)
            .IsRequired();

        builder.Property(c => c.Email)
            .HasColumnType("nvarchar(320)")
            .UseCollation(CaseInsensitiveCollation);

        // Digits and a plus sign have no case, so this one is for consistency rather than
        // correctness — and consistency is the point: three columns searched by one LIKE, with one
        // collation, so nobody has to remember which of them is safe.
        builder.Property(c => c.PhoneE164)
            .HasColumnType("nvarchar(20)")
            .UseCollation(CaseInsensitiveCollation);

        builder.Property(c => c.CompanyName)
            .HasColumnType("nvarchar(200)")
            .UseCollation(CaseInsensitiveCollation);

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

        // ── BR-4.8's two indexes, added by `007` exactly where `001` said they belonged ──
        //
        // `001` left these out on purpose: "They ARE the duplicate rule rather than schema
        // mechanics, and belong with the behaviour they enforce — feature 007." This is 007.
        //
        // FILTERED, and the filter is the whole thing. ADR-013 lists it as one of four
        // provider-coupled points that fail QUIETLY:
        //
        //   * `[Email] IS NOT NULL` — SQL Server treats NULLs as equal in a unique index, so an
        //     UNFILTERED index here rejects the SECOND customer who has no email. The rejection
        //     is a 409 naming `email`, which is correct-looking, wrong, and would be diagnosed as
        //     a bug in the duplicate rule rather than in the index.
        //
        //   * `[IsActive] = 1` — BR-4.4 and BR-4.5 scope the rule to ACTIVE customers. Without
        //     this half, a deactivated customer's address is permanently reserved and the person
        //     cannot be re-added, which is the opposite of what deactivation is for.
        //
        // AC-18 asserts `filter_definition` comes back NON-NULL from sys.indexes, because
        // `HasIndex(...).IsUnique()` reads identically with and without the filter and there is no
        // way to see the difference in C#.
        //
        // The application also checks before inserting (BR-4.8): the check produces the friendly
        // 409 naming the field, and the index is what makes two simultaneous requests safe. The
        // handler catches the index's violation and raises the SAME exception the check does, so a
        // client cannot tell which of two racing requests it was — a difference between the two
        // paths would leak timing.
        builder.HasIndex(c => c.Email)
            .IsUnique()
            .HasFilter("[Email] IS NOT NULL AND [IsActive] = 1")
            .HasDatabaseName("UX_Customers_Email_Active");

        builder.HasIndex(c => c.PhoneE164)
            .IsUnique()
            .HasFilter("[PhoneE164] IS NOT NULL AND [IsActive] = 1")
            .HasDatabaseName("UX_Customers_Phone_Active");

        // No index on FullName: it serves the search in `008`, which searches three columns with
        // a LIKE '%term%' — an index cannot serve a leading wildcard, so one here would be
        // maintained on every write and read by nothing.
    }
}
