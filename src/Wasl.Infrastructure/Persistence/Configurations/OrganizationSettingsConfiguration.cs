using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Wasl.Domain.Settings;

namespace Wasl.Infrastructure.Persistence.Configurations;

/// <summary>
/// <c>dbo.OrganizationSettings</c> — the shape in
/// `specs/022-tenant-theming-settings/data-model.md`.
/// </summary>
internal sealed class OrganizationSettingsConfiguration
    : IEntityTypeConfiguration<OrganizationSettings>
{
    /// <summary>Named so the test can query <c>sys.check_constraints</c> for it (AC-25).</summary>
    public const string SingleRowConstraintName = "CK_OrganizationSettings_SingleRow";

    /// <summary>
    /// <c>#RRGGBB</c> is seven ASCII characters and never anything else.
    /// </summary>
    /// <remarks>
    /// <b><c>varchar</c>, not <c>nvarchar</c>, and this is the one place in the schema where that
    /// is correct</b> — ADR-013 row 4 forbids <c>varchar</c> for human text because it returns
    /// <c>????</c> for Arabic and looks like a font bug. A hex colour is a machine value with a
    /// fixed alphabet, the same precedent the schema already sets for other ASCII-only columns.
    /// </remarks>
    private const int ColorLength = 7;

    public void Configure(EntityTypeBuilder<OrganizationSettings> builder)
    {
        builder.ToTable("OrganizationSettings", table =>
        {
            /* AC-25. ONE ROW, AND THE DATABASE IS WHAT SAYS SO.
             *
             * A second row would not fail anything: every read would simply return whichever one
             * the query ordered first, so the product's colour would depend on a plan. That is
             * the failure this constraint exists for — not a malicious insert, but a seeder run
             * twice or a migration replayed.
             *
             * A code-side "if none exists, create one" check is check-then-act, which this
             * codebase has a rule about: the pre-check is the message, the constraint is the
             * rule, and here there is no message to give because nothing in the request path
             * inserts at all. */
            table.HasCheckConstraint(
                SingleRowConstraintName,
                $"Id = '{OrganizationSettings.SingletonId}'");
        });

        builder.HasKey(settings => settings.Id);

        builder.Property(settings => settings.Id)
            .ValueGeneratedNever();

        builder.Property(settings => settings.BrandColor)
            .HasColumnType($"varchar({ColorLength})")
            .IsRequired();

        builder.Property(settings => settings.OnBrand)
            .HasColumnType($"varchar({ColorLength})")
            .IsRequired();

        /* THE ENUM AS A STRING, project-wide rule and ADR-013.
         *
         * Stored as an int, reordering `SidebarMode`'s members silently rewrites the meaning of
         * the row — and this table has exactly one row, so the blast radius is the whole
         * product's sidebar with nothing to compare against. */
        builder.Property(settings => settings.SidebarMode)
            .HasConversion<string>()
            .HasMaxLength(10)
            .IsRequired();

        builder.Property(settings => settings.RowVersion)
            .IsRowVersion();

        /* AC-1 AND AC-25. THE ROW IS SEEDED BY THE MIGRATION, SO THERE IS NO "NOT CONFIGURED"
         * STATE ANYWHERE.
         *
         * `GET` answers `200` with the product default on a clean database and never `404`. The
         * alternative — a nullable settings row created on first write — puts a branch in every
         * consumer, including the pre-paint script, which is the one place in this product where
         * a branch costs a frame.
         *
         * THE TIMESTAMP IS A LITERAL because `HasData` will not take a computed one, and that is
         * the right constraint here: a seed timestamp that moved with the migration run would
         * make two databases disagree about when the product's default was established. It is
         * the feature's own date. `RowVersion` is absent deliberately — SQL Server generates it,
         * and seeding a value would be seeding a lie about a column the engine owns. */
        builder.HasData(new
        {
            Id = OrganizationSettings.SingletonId,
            BrandColor = OrganizationSettings.DefaultBrandColor,
            OnBrand = BrandContrast.ForegroundWhite,
            SidebarMode = SidebarMode.Light,
            CreatedAtUtc = SeededAtUtc,
            UpdatedAtUtc = SeededAtUtc,
        });
    }

    /// <summary>
    /// The instant the seeded row claims. A literal, for the reason in <c>Configure</c>.
    /// </summary>
    private static readonly DateTime SeededAtUtc =
        new(2026, 9, 27, 0, 0, 0, DateTimeKind.Utc);
}
