# US-012 — Verification

**Phase:** 5 · **Role:** Verification · **Status:** Complete · **Date:** 2026-09-08

Nothing in this file is written unless it was observed.

## Build

```text
$ dotnet build --no-incremental
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

Warnings are errors (`Directory.Build.props`), so this is also a lint result.

```text
$ cd src/wasl-web && npx tsc -b --force
(no output)

$ npm run lint
> eslint .
(no output)
```

## Tests

```text
$ dotnet test tests/Wasl.Domain.Tests
Passed!  - Failed: 0, Passed: 245, Skipped: 0, Total: 245

$ dotnet test tests/Wasl.Application.Tests
Passed!  - Failed: 0, Passed:  46, Skipped: 0, Total:  46

$ dotnet test tests/Wasl.Api.IntegrationTests
Passed!  - Failed: 0, Passed: 591, Skipped: 0, Total: 591, Duration: 1 m 47 s

BACKEND TOTAL   882   (245 + 46 + 591)     — was 799 after `016`
```

```text
$ npx vitest run
Test Files  57 passed (57)
     Tests  1325 passed (1325)
```

Was 1295 in 56 files. **+30 tests, +1 file**: `TicketMessagesPanel.test.tsx` (27) and
3 added to `TicketDetailPage.test.tsx`.

### One frontend run in five reported a failure and its name was not captured

**Recorded rather than dismissed, because an intermittent failure nobody can name is the
kind that gets forgotten.** The run said `Tests 1 failed | 1324 passed`, and the reporter's
summary had scrolled past the identifying line by the time it was read. Four subsequent
consecutive runs were `1325 passed`:

```text
run 1   1 failed | 1324 passed     ← name not captured
run 2   1325 passed
run 3   1325 passed
run 4   1325 passed
run 5   1325 passed
```

**What is honestly claimed:** 1325 of 1325 on four consecutive runs. **What is not
claimed:** that the suite is free of a timing-sensitive test. The suite has several long
files — `TicketFilterBar.test.tsx` alone takes 23 s — and one `act(...)` warning is already
emitted by `LocalizationPage.test.tsx`, which is `014`'s and predates this feature.
Nothing in `021` was changed in response, because nothing was identified to change.

**83 new backend tests**: 21 `InteractionTests`, 8 `CommunicationProviderRegistryTests`,
30 `SendMessageTests`, 15 `ProviderSeamTests`, 5 `MockProviderOptionsBindingTests`, plus
4 across existing files (`AuditRedactionTests` ×4).

Whole suite, not `--filter`. A filtered run tells you about a class and nothing about the
suite.

## Acceptance Criteria Traceability

| AC | Test name | Result |
|---|---|---|
| AC-1 | `SendMessageTests.A_manager_sends_on_a_registered_channel` · `…The_created_response_carries_no_location_header` | **Pass** |
| AC-2 | `SendMessageTests.The_provider_receives_the_body_and_recipient_byte_identical` | **Pass** |
| AC-3 | `SendMessageTests.A_channel_with_no_provider_is_refused_before_the_handler` (×2) · `…A_value_outside_the_channel_enum_is_a_validation_failure` | **Pass** |
| AC-4 | `CommunicationProviderRegistryTests.Registering_a_provider_for_any_channel_makes_that_channel_sendable`, `…The_sendable_set_is_in_enum_declaration_order_not_registration_order` · `SendMessageTests.The_channels_endpoint_reports_the_three_registered_channels` · **`ProviderSeamTests.Registering_a_channel_with_no_address_makes_it_sendable_and_then_conflicts`** | **Pass** |
| AC-5 | `CommunicationProviderRegistryTests.Two_providers_for_one_channel_throw_naming_the_channel_and_both_types`, `…The_duplicate_check_happens_at_construction_and_not_at_lookup` | **Pass** |
| AC-6 | `ProviderSeamTests.With_the_default_configuration_no_channel_fails`, `…Only_the_configured_channel_fails` · `MockProviderOptionsBindingTests.With_no_configuration_no_channel_fails` · `…No_communications_source_touches_a_network_or_names_a_credential` (the absence of any request-reachable trigger) | **Pass** |
| AC-7 | **`ProviderSeamTests.A_configured_failure_is_a_201_that_keeps_the_row`** · `InteractionTests.A_failed_send_carries_a_code_and_no_provider_id` | **Pass** |
| AC-8 | **Not tested — see Not Tested** | **Recorded unmet** |
| AC-9 | `ProviderSeamTests.The_direction_constraint_exists_and_refuses_an_inbound_row` · `…The_outcome_constraint_refuses_an_inconsistent_row` (×2) · `InteractionTests.Direction_is_always_outbound_and_takes_no_parameter` | **Pass** |
| AC-10 | `SendMessageTests.Arabic_round_trips_through_the_database` · `InteractionTests.Arabic_is_stored_byte_identical` · and the live probe below | **Pass** |
| AC-11 | `SendMessageTests.A_closed_ticket_is_refused_and_the_provider_is_not_called` | **Pass** |
| AC-12 | `SendMessageTests.A_customer_with_no_phone_cannot_be_sent_an_sms` · `…A_customer_with_no_email_cannot_be_sent_an_email` · and the live probe below | **Pass** |
| AC-13 | `SendMessageTests.An_agent_cannot_send_on_a_ticket_assigned_to_someone_else` · `…An_agent_may_send_on_an_unassigned_ticket` (the other half — see the note) | **Pass** |
| AC-14 | `SendMessageTests.A_request_with_no_token_never_reaches_the_registry` | **Pass** |
| AC-15 | `SendMessageTests.An_unknown_ticket_is_not_found` · `…An_agent_gets_not_found_for_an_unknown_id_here` · `…Reading_an_unknown_tickets_interactions_is_not_found` | **Pass** |
| AC-16 | `SendMessageTests.A_successful_send_writes_one_audit_row_without_the_body` · `AuditRedactionTests.An_outbound_message_body_is_redacted_under_both_spellings` (×2), `…An_interactions_recipient_address_is_not_redacted` | **Pass** |
| AC-17 | `ProviderSeamTests.No_communications_source_touches_a_network_or_names_a_credential` + its comment-stripper control (×5) | **Pass** |
| AC-18 | **Partial — see Not Tested.** The mock checks the token first and never converts cancellation into `Failed`; no test drives a cancelled request through the pipeline | **Partial** |
| AC-19 | `SendMessageTests.The_read_returns_the_conversation_oldest_first` · `…An_oversized_page_size_is_clamped_and_not_rejected` | **Pass** |
| AC-20 | `SendMessageTests.A_ticket_with_no_interactions_returns_an_empty_page` | **Pass** |
| AC-21 | The live Arabic probe below — `type`, the `errors` key and `status` byte-identical while `title` and `detail` translated · `locales/catalogues.test.ts` (38) for the client keys | **Pass** |
| AC-22 | `TicketMessagesPanel.test.tsx` — `offers only the channels the server reported`, `renders an unknown failure code as a generic sentence, never raw`, `labels an accepted delivery as accepted and never as delivered`, and 24 more | **Pass** |
| AC-23 | The Arabic and English browser walks below | **Pass** |
| AC-24 | **`ProviderSeamTests.A_stub_provider_is_routed_to_instead_of_the_mock`** | **Pass** |

Two criteria are **not** claimed: AC-8 (unmet) and AC-18 (partial). Both are in
**Not Tested** with the reason.

## Negative controls

| # | What was broken | Expected | Observed |
|---|---|---|---|
| C1 | A documented `type` row for `no-contact-for-channel` omitted from `error-handling.md` | `Every_registered_type_is_in_the_documented_table` red | **Red on the first full run**, naming `{"no-contact-for-channel"}`. Not staged deliberately — `016`'s own guard caught `021`'s omission |
| C2 | The three `021` endpoints built while their `NotBuiltYet` entries stood | `No_pending_entry_names_an_endpoint_that_now_exists` red | **Red**, naming all three |
| C3 | `SendMessageCommandValidator` given a constructor dependency | The three validator-scanning guards red | **Red ×3**, `MissingMethodException: No parameterless constructor defined` |
| C4 | A `LiveChat` provider registered with no recipient rule | AC-24's stub test to pass with `201` | **`409`** — and the product was right. Spec A-3 says registration needs a recipient rule too; the test's expectation was wrong. Split into two tests, each asserting what it actually proves |
| C5 | `Interaction.Body` unredacted in the audit diff | `A_successful_send_writes_one_audit_row_without_the_body` red | **Red on the first run**, printing the whole body. BR-9.7's list was short for the third time |
| C6 | The AC-17 scan run without stripping comments | Nothing, ideally | **Red on its own prose** — `MockCommunicationProvider.cs`'s comment promises "no `HttpClient`, no `SmtpClient`, no `WebSocket`" and the scan reported all three |

### The control that was not a control: the binder

`MockProviderOptionsBindingTests` exists because two measurements disagreed, and it is the
only reason the right thing was fixed. See finding 4.

## Live-server verification

API on `:5272`, client on `:5173`, real SQL Server via compose.

| Probe | Result |
|---|---|
| `GET /api/communications/channels` | `Email, WhatsApp, Sms` — enum declaration order |
| `POST /messages` Email, Arabic body | `Accepted`, `providerMessageId=mock-0833…`, `body -ceq` sent **True** |
| `POST /messages` Sms | `Accepted`, recipient `+96650738269` — resolved from the customer |
| `GET /interactions` | `totalCount=2`, order `Email → Sms` (oldest first) |
| `POST /messages` on a customer with no email **and** no phone | `409 errors/no-contact-for-channel`, and the body did **not** name any address |
| The same `409` under an Arabic token | `title` and `detail` Arabic; `type`, `status` and `errors.channel` **byte-identical** to English (AC-21) |
| With `FailChannels: ["Sms"]` | Sms → `Failed` / `MockConfiguredFailure` / `providerMessageId` null; **Email still `Accepted`** in the same process |

**The `409` on a contactless customer is real seeded data, not a contrived case.**
`--seed-bulk` creates customers with neither an email nor a phone, which BR-4.1 allows —
so a reviewer opening the Messages tab on a random seeded ticket will meet AC-12's `409`.
Recorded under **Known limitations** in `summary.md` as a demo-data gap rather than a
product defect.

## Browser walk — Arabic and English

`1440 × 960`, Chrome, both languages on the same ticket.

| What | Arabic (`dir="rtl"`) | English (`dir="ltr"`) |
|---|---|---|
| The third tab | «الرسائل», **no count** | "Messages", no count |
| «الأحدث أولاً» note | **Hidden** on this tab — it describes the timeline's order and the conversation reads oldest-first | same |
| A row's leading edge | On the **right** | On the **left** — `border-inline-start`, one rule |
| Channel | «بريد إلكتروني» / «رسالة نصية» with glyphs | "Email" / "SMS" |
| Recipient | `c90ae7713@example.com`, `+96650738269` — **LTR inside the RTL row** | same |
| Accepted badge | «مقبولة», green, with a tick | "Accepted" |
| Failed badge | «فشلت», red, with an alert glyph | "Failed" |
| The failure sentence | «رفض المزوّد هذه الرسالة. هو مُهيَّأ للفشل على هذه القناة.» | "The provider refused this message. It is configured to fail on this channel." |
| The raw code on the page | **Absent** — `MockConfiguredFailure` appears nowhere | absent |
| Composer | «القناة» dropdown, «الرسالة *», the hint about the address | "Channel", "Message *", same hint |
| Empty body | Send **disabled**; enabled at one character | same |
| A successful send | Toast «أُرسلت الرسالة / أُرسلت إلى c90ae7713@example.com عبر بريد إلكتروني.», field cleared, list refetched | same, in English |

**An Arabic message body renders right-aligned inside the English panel** (`dir="auto"`) —
the field the product never translates, displayed in the language it was written in.

## Findings

### 1. `Interaction.Body` was going into the audit diff in full — BR-9.7's list, short for the third time

Found by `A_successful_send_writes_one_audit_row_without_the_body` on its first run, which
printed the message text inside `Changes`.

BR-9.7 enumerates five things: a password, a hash, a token, a signing key, a full comment
body. **An outbound message is the most obviously sensitive free text in the product — it
is the only text a *customer* receives — and it was on none of those lists.** Three
features have now found the same gap from three directions: `013`'s comment body was in
the original five, `016`'s escalation reason was not, and this was not.

`AuditRedaction` gained `Interaction.Body` and `Interactions.Body`.
**`RecipientAddress` is deliberately NOT redacted** — AC-16 requires it, because an
auditor asking *where did this message go* must be answerable from the trail, and the
address is the whole answer. Asserted as a decision by
`An_interactions_recipient_address_is_not_redacted`.

### 2. Four dead exemptions in `OpenApiContractTests`, all the same mistake

`021` held two entries in `NotBuiltYet` — `POST /api/communications/inbound` and
`GET /api/tickets/{id}/interactions/{interactionId}` — for endpoints **no contract
declares** and which `021`'s own contract explicitly refuses to build. The guard written
to catch that found two more of the same kind on its first run:

| Entry | What its contract actually says |
|---|---|
| `GET /api/locales` | `005`'s contract lists it in an **out of scope** table: *"a round trip to learn something the bundle already contains"* |
| `GET /api/tickets/{id}/comments/{commentId}` | `013`'s contract: *"there is no … in the endpoint inventory and **there will not be one**"* — while the exemption's own note claimed the contract *described* it |

All four deleted. An entry reading "contracted, not built yet" for a rejected endpoint says
the opposite of the truth, and it would silently exempt the path if anybody ever built it.

### 3. `003b`'s restricted principal makes a schema assertion report the wrong thing

AC-9 asks for a **non-null** `definition` from `sys.check_constraints`. Read on the runtime
connection it came back **NULL** — because `definition` requires `VIEW DEFINITION`, which
`db_datareader` does not grant, and SQL Server returns null rather than erroring.

So the test reported a missing constraint for one that was present and working. The
definition is read on the **migrator** connection now, and the refusal is still proved on
the runtime connection — a schema question and a behaviour question, asked by the principal
entitled to ask each.

### 4. Three consecutive configuration attempts failed, and the cause was a stale process

`FailChannels` had no effect through an environment variable, a `--Key=Value` argument, or
`appsettings.Development.json` — while `ProviderSeamTests` proved the same setting works
through `UseSetting`. Three negative results pointing at the binder.

**`MockProviderOptionsBindingTests` was written to ask the binder directly, and it passed
all five.** So the binder was not the fault — and only then did reading `api6.log` reveal:

```text
System.IO.IOException: Failed to bind to address http://127.0.0.1:5272: address already in use.
```

**Every restart had failed, and every probe had been answered by the original process.**
`pkill -f "Wasl.Api"` did not kill it because the process is `dotnet`; killing by port
owner did. On a genuinely fresh process the setting worked first time.

`CLAUDE.md` already says *"kill stray `Wasl.Api` processes first"* for the build. It is the
same hazard for a **measurement**, and the saving grace is the order of operations:
measuring the suspect directly instead of "fixing" it. Had the binder been changed to
satisfy three false negatives, the change would have been permanent and pointless.

### 5. AC-24 could not be proved on the channel the spec suggested

Registering a stub for `LiveChat` makes the channel sendable — the validator accepts it,
the endpoint lists it — and then the handler answers `409 no-contact-for-channel`, because
there is no rule for resolving a live-chat recipient. **The product was right and the test
was wrong:** spec A-3 says in advance that a new channel needs *"one registration line per
channel plus a recipient-resolution rule for it."*

Split in two: AC-24 now replaces the mock on `Email` and asserts `providerName` on the
row, and a second test keeps the `LiveChat` case asserting the `409` — which is what it
actually proves, and it documents where the seam ends.

### 6. The migration was generated and never applied to the development database

Both new endpoints answered `500` in the browser — including the pure read, which is the
tell. SQL Server error **208**, invalid object name: `dbo.Interactions` did not exist.
`dotnet run --project src/Wasl.Api -- --provision` fixed it.

`CLAUDE.md` records that `dotnet ef database update` alone is not enough and `--provision`
is the second step. This is the same rule arriving through a new door: **generating a
migration is not applying it**, and the integration suite cannot notice because its
fixture builds the schema from scratch every run.

### 7. Two guards written too loose, each caught by a run

- The AC-17 network scan reported `HttpClient`, `SmtpClient` and `WebSocket` in
  `MockCommunicationProvider.cs` — **from the comment promising their absence.** `027` had
  this twice. It strips comments now, hand-rolled because a regex cannot tell a comment
  from the same characters in a string literal, and it carries a five-case control.
- `TicketMessagesPanel.test.tsx` selected the composer with
  `getByLabelText(/Message/)` and matched three elements: the field, the panel's
  `aria-label`, and the tab. A loose label regex on a panel where every string starts with
  the same word.

### 8. A constant phone number met BR-4.8's unique index

`SendMessageTests` seeded every customer with `+966501234567`, and the second one threw
`DuplicateValueException: Error.Customer.DuplicatePhone`, taking eleven tests with it. The
filtered unique index doing its job.

`RandomNumberGenerator` per customer now, not a `Guid` slice — `CLAUDE.md`'s rule, and the
reason it is a rule: `007` collided two customers on this exact index using a
time-ordered id's leading digits.

### 9. `AuthProvider` was missing from the detail page's test harness

`021` made `TicketDetailPage` read the signed-in user for Q-A's rule. `useAuth` throws
outside its provider — deliberately — so 49 tests in one file went red with one message.
The harness now wraps in `AuthProvider` and seeds a Manager session, which is what the
file's fixtures already assumed everywhere else.

## Not Tested

| What | Why |
|---|---|
| **AC-8 — a failure AFTER the provider call rolls back the row while the buffer keeps the attempt** | **Recorded unmet.** It needs a fault injected between `provider.SendAsync` and `SaveChangesAsync`, which means either a seam in the handler that exists only for the test or a substituted `IApplicationDbContext` that throws on save. The asymmetry it asserts is real and is documented on `SentMessageBuffer` — *"a diagnostic, not a ledger"* — but it is **not proved**. `A_refused_escalation_writes_no_success_row` proves the analogous rollback for `016`; nothing proves this one |
| **AC-18 — cancellation** | **Partial.** `MockCommunicationProvider` calls `ThrowIfCancellationRequested()` before recording anything, and `SendOutcome` has no factory that could express a cancelled send — so converting cancellation into `Failed` is not expressible. But no test drives a cancelled request through the pipeline and asserts no row |
| A concurrent duplicate-provider registration | The registry is immutable after construction and built once at startup. There is no runtime registration path to race |
| `LatencyMs` | Zero in every environment. It exists so a demo can show the pending state, and a test that waited for it would be a test that sleeps |
| The `500` path when a provider **throws** | `MockCommunicationProvider` throws only for cancellation, so inducing it needs a throwing stub. The shape is specified in the contract and handled by `002`'s middleware, which every other feature's `500` path already exercises |
| The Messages panel's focus order and a screen-reader pass | Not walked. Same gap `016` recorded for its dialog |
| A second page of interactions | `pageSize=50` from the client and no seeded ticket has more. The clamp and `page=0` are tested; a genuine page 2 is not |
