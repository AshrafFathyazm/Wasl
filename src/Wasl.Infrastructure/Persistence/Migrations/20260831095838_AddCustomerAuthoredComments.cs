using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wasl.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerAuthoredComments : Migration
    {
        /* ====================================================================================
         * HAND-EDITED, AND THE SCAFFOLD WAS BROKEN. `034`.
         * ====================================================================================
         *
         * `dotnet ef migrations add` generated this:
         *
         *     AddColumn<string>("AuthorKind", ..., nullable: false, defaultValue: "");
         *     AddCheckConstraint("CK_TicketComments_AuthorKind", ...);
         *
         * Every existing comment would be backfilled with the empty string, and the check
         * constraint on the next line requires 'Agent' or 'Customer'. On any database that
         * already holds a comment, creating that constraint FAILS — the migration stops
         * halfway, which is the good outcome. The bad one is a developer database with no
         * comments in it, where the scaffold applies cleanly and the defect ships to the first
         * environment that has data.
         *
         * Three changes:
         *
         *   1. The column arrives NULLABLE, so adding it cannot fail.
         *   2. Existing rows are backfilled to 'Agent' EXPLICITLY. That is not a guess:
         *      TicketComments.AuthorUserId has always been NOT NULL with an FK to
         *      dbo.SupportUsers, so every comment written before this migration was written by
         *      a support user. The backfill is a statement of fact about the existing rows.
         *   3. The column is then made NOT NULL, and the constraint is added last.
         *
         * NO DEFAULT CONSTRAINT IS LEFT BEHIND. `009` shipped DEFAULT 'Normal' on a priority
         * column and it silently overrode a caller who asked for 'Low'; CLAUDE.md carries the
         * rule that came out of it — the database must not compute a value the code also
         * computes. `defaultValue:` on AddColumn creates exactly such a constraint, so the
         * backfill is an UPDATE instead.
         * ==================================================================================== */

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AuthorCustomerId",
                table: "TicketComments",
                type: "uniqueidentifier",
                nullable: true);

            // Step 1 — nullable, so it cannot fail on a table with rows.
            migrationBuilder.AddColumn<string>(
                name: "AuthorKind",
                table: "TicketComments",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: true);

            // Step 2 — the backfill. AuthorUserId has always been NOT NULL, so every existing
            // comment was written by a support user and 'Agent' is what it is.
            migrationBuilder.Sql(
                "UPDATE dbo.TicketComments SET AuthorKind = 'Agent' WHERE AuthorKind IS NULL;");

            // Step 3 — now it can be NOT NULL, with no default constraint behind it.
            migrationBuilder.AlterColumn<string>(
                name: "AuthorKind",
                table: "TicketComments",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(16)",
                oldMaxLength: 16,
                oldNullable: true);

            // Step 4 — last, when every row already satisfies it.
            migrationBuilder.AddCheckConstraint(
                name: "CK_TicketComments_AuthorKind",
                table: "TicketComments",
                sql: "(AuthorKind = 'Customer' AND AuthorCustomerId IS NOT NULL) OR (AuthorKind = 'Agent' AND AuthorCustomerId IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_TicketComments_AuthorKind",
                table: "TicketComments");

            migrationBuilder.DropColumn(
                name: "AuthorCustomerId",
                table: "TicketComments");

            migrationBuilder.DropColumn(
                name: "AuthorKind",
                table: "TicketComments");
        }
    }
}
