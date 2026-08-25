using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wasl.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditLog",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OccurredAtUtc = table.Column<DateTime>(type: "datetime2(3)", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ActorEmail = table.Column<string>(type: "nvarchar(320)", nullable: true),
                    ActorRole = table.Column<string>(type: "nvarchar(20)", nullable: true),
                    Action = table.Column<string>(type: "nvarchar(80)", nullable: false),
                    EntityType = table.Column<string>(type: "nvarchar(50)", nullable: true),
                    EntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EntityLabel = table.Column<string>(type: "nvarchar(200)", nullable: true),
                    Outcome = table.Column<string>(type: "nvarchar(20)", nullable: false),
                    Changes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    TraceId = table.Column<string>(type: "varchar(64)", nullable: false),
                    IpAddress = table.Column<string>(type: "varchar(45)", nullable: true),
                    UserAgent = table.Column<string>(type: "nvarchar(400)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLog", x => x.Id);
                    table.CheckConstraint("CK_AuditLog_ChangesIsJson", "[Changes] IS NULL OR ISJSON([Changes]) = 1");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLog_Actor",
                table: "AuditLog",
                columns: new[] { "ActorUserId", "OccurredAtUtc" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLog_Entity",
                table: "AuditLog",
                columns: new[] { "EntityType", "EntityId", "OccurredAtUtc" },
                descending: new[] { false, false, true });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLog_NotSuccess",
                table: "AuditLog",
                column: "OccurredAtUtc",
                descending: new bool[0],
                filter: "[Outcome] <> 'Success'");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLog_Time",
                table: "AuditLog",
                column: "OccurredAtUtc",
                descending: new bool[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditLog");
        }
    }
}
