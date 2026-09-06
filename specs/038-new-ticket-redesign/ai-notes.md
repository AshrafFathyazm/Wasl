# 038 — AI notes

No subagents were dispatched. Every task in `tasks.md` was executed in the main session, so
there is no agent output to record — the rule is that whatever an agent returns is written
down here, and nothing was returned.

What this file records instead is the reasoning that a reader cannot recover from the diff.

## Where the mock-up was obeyed, and where it was not

The mock-up is a **design brief, not a design of record** — `027` established that a
preview is not one either, and deleted the one it found. Five of its decisions were
overridden by dated rulings (spec §7) and three of its behaviours are defects that were
measured rather than argued about (spec §2).

The failure mode this guards against is specific: *"reproduce the mock-up faithfully"*
would have shipped a one-column screen with a two-column stylesheet nobody could see was
inert.

## Three things that were nearly written the obvious way

| Nearly | Actually | Because |
|---|---|---|
| One `Idempotency-Key` per form | Minted at mount, **re-minted on the first edit after a failed submit** | `036` Q-5: the same key with a different body answers `409`. One key per form traps a user who fixes a `400` — the form is now correct and can never be sent. One key per request never collides, so the header is decorative. This was written wrong in the spec first, and the correction is kept beside it |
| Count the rows in the banner | `totalCount` from the envelope | The query asks for five. Nine open tickets would say five, which is a wrong fact that looks exactly like a right one |
| `OPEN_STATUSES` as "all statuses minus Resolved and Closed" | The four, written out | A seventh status added to the contract must not silently join this filter. Whether a new status counts as *open* is a product decision, and a subtraction answers it by default |

## The one place a library default was the bug

`shouldFocusError` is `true` by default in React Hook Form, runs **after** the invalid
callback, and orders fields by registration. So the page focused the customer search
correctly and then lost it to subject — the exact defect the mock-up has, arriving through
a completely different mechanism. It is in `tests.md` as C5 because it was not planted; the
test caught it on its first run.

The structural fix is not the flag. It is that the summary and the focus now read **one
ordered array** (`FIELD_ORDER`), so they cannot disagree about what "first" means.

## What was deliberately not done

- **No fourth `ButtonType`.** ADR-011 §3 promotes on the second consumer.
- **No `Card` primitive.** Three bordered sections on one screen; same rule.
- **No new named query class.** `listTickets` already expresses the duplicate check —
  `034` added `?customerId=`, `015` added repeated `?status=`. CLAUDE.md requires a written
  reason for a third query class, and "the same query with two filters" is not one.
- **No support-user fetcher**, and that absence is asserted rather than intended.

## Lane note

`039-ticket-row-actions` was building in the same working tree throughout. It owns
`src/components/Dropdown/useMenuSurface.ts`. Nothing in this feature touches it, and
nothing here should be staged with a bare `git commit`.
