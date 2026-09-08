using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wasl.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DashboardDailySnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DashboardDailySnapshot",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ScopeUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UnassignedCount = table.Column<int>(type: "int", nullable: false),
                    EscalatedOpenCount = table.Column<int>(type: "int", nullable: false),
                    WaitingOnCustomerCount = table.Column<int>(type: "int", nullable: false),
                    AssignedCount = table.Column<int>(type: "int", nullable: false),
                    OldestUntouchedHours = table.Column<int>(type: "int", nullable: true),
                    CapturedAtUtc = table.Column<DateTime>(type: "datetime2(3)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DashboardDailySnapshot", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DashboardDailySnapshot_SupportUsers_ScopeUserId",
                        column: x => x.ScopeUserId,
                        principalTable: "SupportUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DashboardDailySnapshot_ScopeUserId",
                table: "DashboardDailySnapshot",
                column: "ScopeUserId");

            migrationBuilder.CreateIndex(
                name: "UX_DashboardDailySnapshot_Date_Scope",
                table: "DashboardDailySnapshot",
                columns: new[] { "LocalDate", "ScopeUserId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DashboardDailySnapshot");
        }
    }
}
