using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wasl.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInteractions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Interactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TicketId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Direction = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Channel = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    RecipientAddress = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    Body = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    ProviderName = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ProviderMessageId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    DeliveryStatus = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    FailureCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    SentByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2(3)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Interactions", x => x.Id);
                    table.CheckConstraint("CK_Interactions_Direction", "Direction = N'Outbound'");
                    table.CheckConstraint("CK_Interactions_Outcome", "(DeliveryStatus = N'Accepted' AND ProviderMessageId IS NOT NULL AND FailureCode IS NULL)\nOR (DeliveryStatus = N'Failed' AND ProviderMessageId IS NULL AND FailureCode IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_Interactions_Sender",
                        column: x => x.SentByUserId,
                        principalTable: "SupportUsers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Interactions_Tickets",
                        column: x => x.TicketId,
                        principalTable: "Tickets",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_Interactions_SentByUserId",
                table: "Interactions",
                column: "SentByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Interactions_Ticket_Time",
                table: "Interactions",
                columns: new[] { "TicketId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Interactions");
        }
    }
}
