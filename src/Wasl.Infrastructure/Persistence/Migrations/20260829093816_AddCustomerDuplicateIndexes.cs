using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wasl.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerDuplicateIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "UX_Customers_Email_Active",
                table: "Customers",
                column: "Email",
                unique: true,
                filter: "[Email] IS NOT NULL AND [IsActive] = 1");

            migrationBuilder.CreateIndex(
                name: "UX_Customers_Phone_Active",
                table: "Customers",
                column: "PhoneE164",
                unique: true,
                filter: "[PhoneE164] IS NOT NULL AND [IsActive] = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_Customers_Email_Active",
                table: "Customers");

            migrationBuilder.DropIndex(
                name: "UX_Customers_Phone_Active",
                table: "Customers");
        }
    }
}
