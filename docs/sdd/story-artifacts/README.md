# Story Artifacts — superseded, kept as the record

**Do not build from these files. Build from [`specs/`](../../../specs/).**

These twelve artifact sets are the **pre-migration record**: the specifications, plans,
and task breakdowns that were written for Release 1 and US-014/US-015 before
implementation began, and before three decisions that came later.

They are kept, not deleted, because they are evidence of when the planning happened. They
are stale in three specific ways.

## What is out of date here, and where the current version lives

| These files say | The current answer | Why it changed |
|---|---|---|
| `src/CRM.Application/...`, `src/CRM.Infrastructure/...`, `ICustomerRepository`, `CustomersController` | Two projects — `Wasl.Domain` and `Wasl.Api` — with vertical slices, minimal APIs, no repository | ADR-010 was accepted after these were written |
| PostgreSQL types, `xmin`, `lower(Email)` indexes, `psql` commands | SQL Server: `uniqueidentifier`, `datetime2(3)`, `nvarchar`, `rowversion`, filtered indexes plus a CI collation | ADR-013 supersedes ADR-001 |
| No audit obligation on any command | Every state-changing command implements `IAuditableCommand`; the row is written by a pipeline behaviour in the same transaction | ADR-008 postdates most of these |

Most of the PostgreSQL references were repaired in place across `docs/sdd/`. The layering
references were **not** — they were corrected in the migrated copies under `specs/`
instead, so the original plan stays readable as what was actually planned at the time.

## Where each set went

| This folder | Became |
|---|---|
| `US-001-create-customer` | [`specs/007-create-customer`](../../../specs/007-create-customer) |
| `US-002-view-customer` | [`specs/008-customer-list-and-profile`](../../../specs/008-customer-list-and-profile) |
| `US-003-update-customer` | [`specs/017-update-customer`](../../../specs/017-update-customer) |
| `US-004-customer-overview` | [`specs/018-customer-overview`](../../../specs/018-customer-overview) |
| `US-005-create-ticket` | [`specs/009-create-ticket`](../../../specs/009-create-ticket) |
| `US-006-list-filter-tickets` | **split** into [`specs/010-ticket-list-and-detail`](../../../specs/010-ticket-list-and-detail) and [`specs/015-ticket-filters-and-search`](../../../specs/015-ticket-filters-and-search) |
| `US-007-assign-ticket` | [`specs/011-assign-ticket`](../../../specs/011-assign-ticket) |
| `US-008-change-ticket-status` | [`specs/012-change-ticket-status`](../../../specs/012-change-ticket-status) |
| `US-009-escalate-ticket` | [`specs/016-escalate-ticket`](../../../specs/016-escalate-ticket) |
| `US-010-ticket-timeline-comments` | [`specs/013-ticket-timeline-and-comments`](../../../specs/013-ticket-timeline-and-comments) |
| `US-014-language-preference` | [`specs/014-language-preference-and-rtl`](../../../specs/014-language-preference-and-rtl) |
| `US-015-audit-log-access` | [`specs/019-audit-log-access`](../../../specs/019-audit-log-access) |

The `US-*` identifiers did not disappear — they remain the requirement identity that
acceptance criteria and tests cite. `docs/sdd/08-board.md` holds the full mapping.

## Why keep them at all

Two reasons, and the second is the real one.

The acceptance criteria were numbered here first, and every migrated spec preserves that
numbering, so these files are how you check that nothing was renumbered or dropped in the
move.

And: thirty of the hundred assessment points are for specification and planning, earned
before an editor is opened. These files are when that happened. Deleting them to tidy up
would delete the evidence.
