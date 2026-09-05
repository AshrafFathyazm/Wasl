# `035` — Tasks

**Lane:** frontend, plus the backend half of `017` · **Approved:** product owner,
2026-09-03 («اكتب spec» … «واعملهم بعدها»)
**Owner of every row:** this session.

Order is forced by one dependency: the sheet and the edit page share a form, and the edit
page needs `PUT`. The hover work is independent of all of it and landed first.

## §7 — row hover, in the primitive

| # | Task | Owner | Skill | Closes |
|---|---|---|---|---|
| FE-035-01 | `tokens.css` — `--teal-100` / `--teal-300`, and **four** table-row tokens. `--surface-row-hover` is NOT repurposed: it has eleven consumers, ten of them faint hovers elsewhere | session | — | AC-18 |
| FE-035-02 | `Table.module.css` — hover on the `<tr>`, the 3px rail on the **leading** edge via a per-direction custom property, nothing under `:hover` touching a size | session | frontend-design | AC-14 · AC-15 · AC-16 · AC-17 |
| TEST-035-03 | `tableRowHover.test.ts` — 12 assertions, one per constraint, plus the comment-stripping control | session | — | §7 |

## §5 — `PUT /api/customers/{id}`, on `017`'s frozen contract

| # | Task | Owner | Skill | Closes |
|---|---|---|---|---|
| BE-035-04 | `Customer.Update` — the entity layer's **second** mutator. Takes already-normalised contacts, clears what it is given as null, touches neither `IsActive` nor the timestamps | session | dotnet-architect | §5 |
| BE-035-05 | `UpdateCustomerCommand` · `Handler` · `Validator` — three ordered checks, and the version is checked **before** the duplicate rule | session | dotnet-architect | AC-6 · AC-7 · AC-8 |
| BE-035-06 | `UpdateCustomerRequest` + the `HttpPut` action — no role policy, because the contract permits both roles (BR-6) | session | — | §5 |
| BE-035-07 | Three `expectedVersion` messages in both catalogues | session | — | BR-8.6 |
| TEST-035-08 | `UpdateCustomerTests` — 18 tests, two negative controls | session | — | AC-6 – AC-9, AC-13 |

## §4.3 — the side sheet

| # | Task | Owner | Skill | Closes |
|---|---|---|---|---|
| FE-035-09 | `components/SideSheet` — one shell, escape, focus, scroll lock, a body that **pads nothing** | session | frontend-design | §4.3 |
| FE-035-10 | `CustomerQuickView` — renders the row it was given and fetches nothing | session | frontend-design | §4.3b |
| FE-035-11 | `CreateCustomerForm` extracted from the page, which becomes a wrapper — one form, two consumers | session | — | AC-11 · AC-12 |
| FE-035-12 | `Table` — `selectedRowKey`, the first producer of `aria-selected` | session | — | AC-17 |
| FE-035-13 | `lib/tint.ts` — `tint` promoted out of `TicketDetailPage`, so one person is one colour on every screen | session | — | AC-5 |
| TEST-035-14 | `customerSheet.test.tsx` — 13 tests | session | — | AC-1 · AC-4 · AC-10 · AC-11 |

## §4.2 — the edit screen and the switcher

| # | Task | Owner | Skill | Closes |
|---|---|---|---|---|
| FE-035-15 | `updateCustomer` + the two provisional types, marked and sourced to `017` | session | — | §5 |
| FE-035-16 | `EditCustomerPage` — the create form's schema, `expectedVersion` from the READ, a `409 concurrency-conflict` branch with its own control | session | frontend-design | AC-6 · AC-7 · AC-8 |
| FE-035-17 | `CustomerScreenSwitcher` — two segments, both with real targets | session | frontend-design | Q-1 |
| FE-035-18 | «تعديل» on the profile, and the note that said it could not exist replaced by the quotation of itself | session | — | §4.1 |
| FE-035-19 | `routes.tsx` — `/customers/:id/edit` | session | — | §4.2 |

## Forced by review, not planned

| # | Task | Closes |
|---|---|---|
| FE-035-20 | The list's name cell made a real `<Link>` — `033` navigated with `onRowClick` alone, which the primitive's contract forbids, so a keyboard could not reach a customer profile **at all** | AC-12 |
| FE-035-21 | The `Table` error notice: one shape and one set of words for every table, drawn **under the header** instead of replacing the card | «ثبت شكل دا لكل جداول السيستم» |
| FE-035-22 | The create form reordered to the frame — name · **company** · email · phone · notes | «دا الشكل الصحيح لاضافة عميل» |
| FE-035-23 | The sheet's layout rebuilt: a flush flex body, one scroller, a plain flex footer | «لسه فيه اسكرول في الجنب» |
| FE-035-24 | `Input.module.css` — `:placeholder-shown` scoped to `[dir='auto']`, which is what was overriding the phone field's pinned `ltr` | the `+966` order |
| TEST-035-25 | `createCustomerContract.test.ts` — 8 assertions that the form accepts everything the API accepts | §2 |

## Refused, because they contradict the validation or the backend

The ruling: **«لو مش بتوافق الفلاديشن وشغل الباك اند متعملهوش»**.

| Drawn in a frame | Why it is not built |
|---|---|
| A fixed `+966` prefix box | Both write endpoints accept any parseable E.164 (BR-4.3) |
| A required asterisk on the email | BR-4.1 requires **one of** email or phone, and the server creates a phone-only customer |
| The switcher's third segment | From `/customers/new` its pair has no customer to point at — **Q-5** |
| `الطلبات` · `نوع العميل` · a numeric `المعرّف` | No module, no field, no such id |
