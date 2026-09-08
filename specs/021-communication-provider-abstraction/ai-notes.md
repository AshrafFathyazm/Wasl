# US-012 — AI Usage and Audit

**Phase:** 5 · **Role:** Verification · **Status:** Complete · **Date:** 2026-09-08

Be specific. "AI helped with the code and I reviewed it" is worthless. Name the file,
the suggestion, and what was wrong with it.

## What AI Was Used For

| Task | Prompt used |
|---|---|
| The approval gate | The spec was read against the tree before anything was built, and four stale premises were reported to the product owner with the two open questions that were theirs to rule on |
| The whole feature, both lanes | *"Yes — implement, fix the layering"*, with Q-A ruled **assignment-sensitive** and Q-C ruled **separate panel** |

**No sub-agents were dispatched.** `tasks.md` names one per row; naming is the plan and
dispatch is a separate act. The work was done in the main session and every deviation is
in `summary.md`.

## Where AI output was wrong, and what it cost

Every item was caught by running something.

| # | What was produced | What was wrong | How it surfaced |
|---|---|---|---|
| 1 | `Interaction.Body` left out of `AuditRedaction` | BR-9.7's list is five literal things; an outbound message is none of them. The body went into `Changes` in full | The test written for AC-16 printed it on its first run |
| 2 | A constant `+966501234567` for every seeded customer | BR-4.8's filtered unique index on `PhoneE164` — the second customer threw and took eleven tests with it | `DuplicateValueException: Error.Customer.DuplicatePhone` |
| 3 | `SqlQuery<string?>(…).SingleOrDefaultAsync()` for a check-constraint definition | Returns null for BOTH "no such constraint" and "the definition is null". Two states, one answer, and the message pointed at the wrong one | The test reported a missing constraint that was present |
| 4 | The same definition read on the runtime connection | `definition` needs `VIEW DEFINITION`; `db_datareader` does not grant it, and SQL Server **returns NULL rather than erroring** | Persisted after #3 was fixed. Reading it on the migrator connection worked |
| 5 | `(SELECT TOP 1 Id FROM dbo.Tickets)` inside a raw `INSERT` | Returned NULL, so the insert failed on a **NOT NULL** column — in a test about a CHECK constraint, sending the reader to the wrong constraint | `Cannot insert the value NULL into column 'TicketId'` |
| 6 | `ExecuteSqlRawAsync` with an interpolated string | **EF1002.** The analyser was right and was not suppressed — the three values became real parameters | Build error |
| 7 | The AC-17 network scan without stripping comments | Reported `HttpClient`, `SmtpClient` and `WebSocket` **from the comment promising their absence** | Red on its own prose. `027` had this twice |
| 8 | AC-24 proved with a stub on `LiveChat` | Registration makes a channel sendable and then `409`s — there is no recipient rule. **Spec A-3 says so in advance**; the test was wrong and the product was right | `Expected Created, found Conflict` |
| 9 | `getByLabelText(/Message/)` for the composer's textarea | Matched three elements — the field, the panel's `aria-label`, and the tab | `Found multiple elements` ×4 |
| 10 | `Select` and `IconMail` in the panel | Neither exists. The primitive is `Dropdown`; the icon is `IconEmail` | `tsc` |
| 11 | `MockProviderOptionsBindingTests` placed in `Wasl.Application.Tests` | That project deliberately cannot see `Wasl.Infrastructure` — which is the layering working | `CS0234: the namespace 'Infrastructure' does not exist in 'Wasl'` |
| 12 | Three attempts to configure `FailChannels` | All three failed, and **none of them was a configuration problem** — see below |

### #12 is the one worth reading

`FailChannels` had no effect through an environment variable, a `--Key=Value` argument, or
`appsettings.Development.json` — while an integration test proved the same setting works
through `UseSetting`. **Three consecutive negative results, all pointing at the binder.**

The next step was nearly to change `MockProviderOptions.FailChannels` from a get-only
`IList<T>` to something the binder "would" populate. Instead a five-test probe asked the
binder directly, with no host: **all five passed.** Only then did reading the startup log
reveal

```text
System.IO.IOException: Failed to bind to address http://127.0.0.1:5272: address already in use.
```

Every restart had failed and every probe had been answered by the *original* process.
`pkill -f "Wasl.Api"` missed it because the process is `dotnet`; killing by port owner
worked, and on a fresh process the setting applied first time.

**Had the binder been "fixed" to satisfy three false negatives, the change would have been
permanent, pointless, and justified by a paragraph of confident reasoning.** `CLAUDE.md`
already names the stale-process hazard for the *build*; this is the same hazard for a
*measurement*, and it is now recorded there as such.

## Open questions that were decided

Both product rulings came from the product owner at the approval gate, and both confirmed
the working assumption already in the spec.

| # | Question | Ruling |
|---|---|---|
| Q-A | Who may send a message? | **Assignment-sensitive** — Manager any ticket, Agent own-or-unassigned |
| Q-C | Does an interaction join the timeline? | **No** — a separate Messages panel |
| Q-B | Is `errors/ticket-closed` the right type? | **Closed by the code, not by a ruling.** `013` shipped 2026-08-28 and owns the name; `021` matches — exactly what the working assumption predicted |
| Q-D | Should the failure mode be demo-reachable? | Configuration only, as specified. The file that works is `appsettings.Development.json`, and it now says so |
| Q-E | Does `Interaction` need `DENY UPDATE`? | No, as specified — `DeliveryStatus` is what a real callback would update |

Decisions taken without asking, each reversible:

| Decision | Reversible? |
|---|---|
| `InteractionResponse` in the feature's root folder rather than a use-case folder | Yes. Same placement, same reason, as `TagSummary` |
| The registry in `Application/Common/Communications/` rather than beside the abstraction | Yes. It is concrete and needs no interface; the folder is the only judgement |
| `Guid.NewGuid()` for the mock's message id rather than `CreateVersion7()` | Yes, and the reason is stated in the code: an opaque provider identifier must not advertise a timestamp |
| A third tab rather than a section under the description | Yes — `frontend-spec.md` drew tabs and `027`'s v3 already had two |

## What was NOT accepted

| Suggestion | Why refused |
|---|---|
| Suppress EF1002 and keep the interpolated `INSERT` | `CLAUDE.md` names that rule because the habit forms in a test and moves to a query built from user input. The values became parameters |
| Change `MockProviderOptions.FailChannels` to satisfy three failing configuration attempts | The binder was measured first and was innocent. See #12 |
| Duplicate the channel-icon map into the new panel | `037` found `IconEye` declared twice with different geometry, so two screens drew different pictures under one name. One map |
| A `Retry` button on a failed message | There is no retry endpoint, and re-sending is sending — which the composer does. A Retry that quietly composed a second message would be a row the agent did not know they created |
| An empty state saying "no replies yet" | US-013 is deferred; a customer cannot reply through this system. That sentence is a fact the product does not have |
| Loosen the four dead `NotBuiltYet` entries into a blanket exemption | Each was deleted individually. The remaining entries still need the comparison |
| A `canSendMessage` field on the ticket read shape | The client already holds the assignee and already renders it. `016`'s `canEscalate` exists because BR-3.2 is role-only and the client cannot see the role |

## Every accepted output was run

`dotnet build --no-incremental`, `dotnet test` (whole suite), `tsc -b --force`, `eslint`,
`vitest run`, **and** the API and client driven in a browser in both languages — including
the `Failed` delivery state, which needed a genuinely fresh process to reach.
