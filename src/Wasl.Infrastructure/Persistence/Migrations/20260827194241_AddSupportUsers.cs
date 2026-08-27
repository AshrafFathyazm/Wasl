using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wasl.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSupportUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SupportUsers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FullName = table.Column<string>(type: "nvarchar(200)", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(320)", nullable: false, collation: "Latin1_General_100_CI_AS"),
                    PasswordHash = table.Column<string>(type: "nvarchar(400)", nullable: false),
                    Role = table.Column<string>(type: "nvarchar(20)", nullable: false),
                    PreferredLanguage = table.Column<string>(type: "nvarchar(5)", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2(3)", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupportUsers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_AssignedToUserId",
                table: "Tickets",
                column: "AssignedToUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_CreatedByUserId",
                table: "Tickets",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_EscalatedByUserId",
                table: "Tickets",
                column: "EscalatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketHistory_PerformedByUserId",
                table: "TicketHistory",
                column: "PerformedByUserId");

            migrationBuilder.CreateIndex(
                name: "UX_SupportUsers_Email",
                table: "SupportUsers",
                column: "Email",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_TicketHistory_PerformedBy",
                table: "TicketHistory",
                column: "PerformedByUserId",
                principalTable: "SupportUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Tickets_Assignee",
                table: "Tickets",
                column: "AssignedToUserId",
                principalTable: "SupportUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Tickets_CreatedBy",
                table: "Tickets",
                column: "CreatedByUserId",
                principalTable: "SupportUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Tickets_EscalatedBy",
                table: "Tickets",
                column: "EscalatedByUserId",
                principalTable: "SupportUsers",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TicketHistory_PerformedBy",
                table: "TicketHistory");

            migrationBuilder.DropForeignKey(
                name: "FK_Tickets_Assignee",
                table: "Tickets");

            migrationBuilder.DropForeignKey(
                name: "FK_Tickets_CreatedBy",
                table: "Tickets");

            migrationBuilder.DropForeignKey(
                name: "FK_Tickets_EscalatedBy",
                table: "Tickets");

            migrationBuilder.DropTable(
                name: "SupportUsers");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_AssignedToUserId",
                table: "Tickets");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_CreatedByUserId",
                table: "Tickets");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_EscalatedByUserId",
                table: "Tickets");

            migrationBuilder.DropIndex(
                name: "IX_TicketHistory_PerformedByUserId",
                table: "TicketHistory");
        }
    }
}
