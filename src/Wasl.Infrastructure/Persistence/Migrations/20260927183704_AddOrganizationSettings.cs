using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wasl.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOrganizationSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrganizationSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BrandColor = table.Column<string>(type: "varchar(7)", nullable: false),
                    OnBrand = table.Column<string>(type: "varchar(7)", nullable: false),
                    SidebarMode = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2(3)", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2(3)", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrganizationSettings", x => x.Id);
                    table.CheckConstraint("CK_OrganizationSettings_SingleRow", "Id = '0000022a-0000-0000-0000-000000000001'");
                });

            migrationBuilder.InsertData(
                table: "OrganizationSettings",
                columns: new[] { "Id", "BrandColor", "CreatedAtUtc", "CreatedByUserId", "OnBrand", "SidebarMode", "UpdatedAtUtc", "UpdatedByUserId" },
                values: new object[] { new Guid("0000022a-0000-0000-0000-000000000001"), "#1D174D", new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Utc), null, "#FFFFFF", "Light", new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Utc), null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrganizationSettings");
        }
    }
}
