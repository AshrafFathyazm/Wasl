# `035` — Customer detail, edit, and add-as-a-sheet

**Phase:** 7 · **Role:** Spec · **Status:** Awaiting review
**Lane:** frontend, plus the backend half of `017`
**Design of record:** the three frames supplied 2026-09-03, plus
`docs/sdd/design/screens/07-customer-profile.md` and `08-create-customer.md`

---

## 1 · Why this feature exists

The customer directory landed in `033`. Three things the product owner asked for on
2026-09-03, with frames:

1. **`/customers/:id`** rebuilt to the supplied frame — avatar header, three contact
   cards with copy, notes, record information, and the customer's tickets.
2. **`/customers/:id/edit`** — the same fields as create, pre-filled, saving through
   `PUT /api/customers/{id}`.
3. **«عميل جديد» opens a side sheet** instead of navigating to `/customers/new`.

And one requirement that is not about these screens at all: **row hover on every table
in the product** (§7).

Item 3 **reverses a choice made on 2026-09-02**, and on 2026-09-03 the row click
reversed with it. `033`'s scope was picked from a question as *"033 كامل بدون Panel"* —
no side sheet, and the row click navigating straight to the profile. Both halves of that
are now superseded by frames:

- **«عميل جديد» opens the sheet** in create mode.
- **A row click opens the sheet** as a QUICK VIEW — avatar, contact fields, notes, the
  two dates, and «فتح الملف الكامل» which navigates to `/customers/:id`. The clicked row
  stays **highlighted** while the sheet is open, which is what finally gives
  `aria-selected` a producer (`035` §7 specified that state as dead CSS on arrival).

Recorded here rather than silently reversed. The earlier answer was not wrong for what it
was asked about — it predated these frames.

---

## 2 · What the backend already has, and what it does not

**This is the section every other section is measured against.** The governing rule from
`027`, restated: *build the columns the backend has; anything with no counterpart is
absent from the design.* Refined the same day: *draw the unbuilt **actions** and leave
them read-only* — because a menu row promises nothing until it is pressed, while a data
region drawn from nothing is a fact the product does not have and **looks exactly like a
working one.**

| Screen region | Endpoint | State |
|---|---|---|
| The whole profile | `GET /api/customers/{id}` | **built** (`008`) |
| Save an edit | `PUT /api/customers/{id}` | **NOT built.** `017` has a spec, a plan and a **frozen contract**; its `summary.md` reads `Status: Not started`. **This feature builds it** — §5 |
| Create | `POST /api/customers` | **built** (`007`) |
| The customer's tickets | `GET /api/tickets?customerId=` | **built** (`015`/`026`) |
| Company vocabulary | `GET /api/customers/companies` | **built** (`033`) |

### Drawn in the frames and deliberately **absent**, with the reason

| In the frame | Why it is absent |
|---|---|
| **`الطلبات` tab and its count** | There is no orders module in the product. Not deferred — it does not exist |
| **`نوع العميل` (فرد / شركة)** and its blue/green dot | `Customer` has no such field. `CompanyName` being null is **not** the same fact: a customer with no company recorded is not thereby an individual |
| **The numeric `المعرّف` (`39489`)** | The id is a `Guid`. A short number would have to be invented per row, and an invented identifier that looks like a record number is the worst kind of placeholder |
| **`سجل فحص المخاطر`, `المعاملات المخصصة`** and the rest of the reference app's nav | Different product |
| **Deactivate · reactivate · merge** | No endpoint. `007`'s contract records reactivation as **undesigned**, so this is not even a deferral with a known shape |
| **The fixed `+966` prefix box** on the phone field | `POST /api/customers` and `PUT /api/customers/{id}` both accept **any parseable E.164** (BR-4.3), so a static country code makes a non-Saudi number unenterable through a form whose own API would have taken it. The country code is a **placeholder** instead, and the server normalises. `032` ruled this once already (its Q-3); **re-ruled 2026-09-03** |
| **The required asterisk on البريد الإلكتروني** | BR-4.1 requires **one of** email or phone, and both validators enforce exactly that — a phone-only customer is valid and the server creates one. An asterisk the server does not enforce blocks that customer at the client. The **hint above the pair** is what carries the real rule |

**THE RULING THAT PUT BOTH ROWS THERE — 2026-09-03:**

> لو مش بتوافق الفلاديشن وشغل الباك اند متعملهوش

*If it does not agree with the validation and with what the backend does, do not build
it.* That is now the tie-break for every frame against every rule, and it is the reason
these two are absent rather than deferred: they are not unbuilt, they are **refused**.
`035`'s guard asserts both, because "we decided not to" is a decision a later frame can
reverse by accident.

### Drawn and rendered **read-only**, because they are actions

None. Every control the frames put on these three screens has an endpoint once §5 is
built. If review adds one that does not, it goes here — inert, with **no client fetcher
at all**, which is the form `027` settled on (a `disabled` prop is one edit away from
deletion; a function that does not exist is not).

---

## 3 · Open questions — these go to the product owner, not into the design

| # | Question | Working assumption if unanswered |
|---|---|---|
| **Q-1** | **ANSWERED 2026-09-03, and the working assumption was WRONG.** The centred pill above the breadcrumb is **product chrome**: a two-segment switcher that is built. *"فيه فوق سويتشر كدا لما بتضغط علي زرار تعديل بيتحول السويتشر فوق لتعديل العميل وزار حفظ التغيرات… لو مضغطتش علي زرار التعديل وروحت علي السويتشر فوق بتاع اضافة العميل هلاقي الاسكرين"* | Its second segment and its active label follow the mode: **detail** «تفاصيل العميل» | «إضافة عميل»; **edit** «تعديل العميل» | «تفاصيل العميل»; **add** «إضافة عميل» | «تفاصيل العميل». Pressing «تعديل» on the detail screen flips the switcher to the edit segment and the footer to «حفظ التغييرات». I had assumed it was the design canvas's artboard switcher because `027`'s frames carried a similar element — **it was not, and that is why the question was asked rather than decided** |
| **Q-2** | The frame's ticket-history block is stamped **«يحتاج 018»** by the designer, but `GET /api/tickets?customerId=` has been built since `015`. Build it now, or hold it for `018`? | **Build it.** The stamp records a dependency that has since been satisfied, and the rule is to build what the backend has. `018-customer-overview`'s frontend half is then **superseded**, recorded in its spec rather than deleted |
| **Q-3** | Does the side sheet **replace** `/customers/new` or sit beside it? A route that still exists but is unreachable is the exact defect this session found on `/tickets/new` | **Replace the entry point, keep the route.** The sheet is how the list opens create; `/customers/new` stays routed and reachable, because `033`'s no-match empty state links to it **carrying the search term** and a sheet cannot be deep-linked |
| **Q-4** | `030` records that the drawer's design **contradicts itself** — `10-shared-patterns.md` says a navy `--surface-inverse` header at h56, the newer spec says a **white** header, and the enter duration is 250ms in one and 220ms in the other | **The frame wins.** It draws a white header with a title and a subtitle, an × at the inline-end, and a footer holding «حفظ العميل» and «إلغاء». A frame from the product owner outranks two documents that disagree. **The contradiction is closed by this ruling, and `030` is told** |

---

## 4 · The three screens

### 4.1 `/customers/:id` — detail

One column of content, no rail. From the frame, top to bottom:

| Region | Content | Source |
|---|---|---|
| Breadcrumb | «العملاء › ‹name›» | route + `fullName` |
| Header | 56px avatar with the first letter, `fullName` as `h1`, `companyName` under it, **«تعديل»** at the inline-end | `GET /{id}` |
| Contact strip | **three cards in one row** — البريد الإلكتروني · الجوال · الشركة. The first two carry a copy control; the third does not | `email`, `phoneE164`, `companyName` |
| الملاحظات | The note, or a muted line when empty | `notes` |
| معلومات السجل | تاريخ الإضافة · آخر تحديث · المعرّف (truncated, with copy) | `createdAtUtc`, `updatedAtUtc`, `id` |
| سجل التذاكر | The customer's tickets, newest first, with a link to the filtered list | `GET /api/tickets?customerId=` |

The avatar's tint is **derived from the name**, never invented — `027`'s ruling and its
FNV-1a hash over five hues, because summing code units clusters on Arabic names (two of
three seeded agents collided at four buckets *and* at five). **A person is one colour
everywhere**, so it does not de-collide per region.

An empty `phoneE164` or `companyName` renders the card with an em dash, not a missing
card: three cards that become two change the layout depending on the data, and a reader
comparing two customers cannot tell an absent phone from a differently-built screen.

### 4.2 `/customers/:id/edit` — edit

The same field set as create, pre-filled, in the same order the frame draws: الاسم
الكامل (required) · البريد الإلكتروني · الجوال (with the `+966` prefix affordance) ·
الشركة · الملاحظات. Footer: **«حفظ التغييرات»** and «إلغاء», with the hint *«الحقول بلا
نجمة اختيارية»* at the inline-start.

- **`PUT` replaces; it does not merge.** The frozen contract says so in words: an omitted
  or `null` optional field is **cleared**. The form therefore always sends every field,
  including the ones the reader did not touch.
- **`expectedVersion` comes from the read**, never from a previous write's response.
- The id appears as a chip beside the title, matching the frame.

### 4.3 The add sheet

Opens from «عميل جديد» on `/customers`. White header with «عميل جديد» and *«أدخل
البيانات ثم احفظ»*, × at the inline-end, the create fields, and a footer with «حفظ
العميل» / «إلغاء». On success it closes and the list refetches — it does **not** seed the
list cache from the write response (`026` §5, and `032` AC-1 asserts the same rule for
the profile).

---

## 5 · The backend half — `017`, built here

`PUT /api/customers/{id}`, exactly as `specs/017-update-customer/contracts/customer-update-api.md`
freezes it. Nothing in this feature changes that contract; if something must change it
goes under **Contract changes** in `plan.md` and both lanes are told.

What the contract already fixes, and what this feature must therefore not re-decide:

- `expectedVersion` is **required**. Missing → `400`. Malformed or the wrong length →
  `400`, **not** `409`: the client sent something the server cannot interpret.
  `004b` already length-checks a base64 buffer before allocating it, and that check is
  reused rather than rewritten.
- **Two different `409`s on one endpoint**, because they need opposite actions from the
  reader: `errors/duplicate-customer` (BR-4.4/4.5, against a **different** active
  customer) and `errors/concurrency-conflict` (ADR-006).
- BR-4.1 — at least one contact method **after** the update — is enforced by the
  validator, by `Customer`'s own mutator, and by `CK_Customers_Contact`. Three layers,
  each with its own reason, exactly as `007` recorded them.
- The command is `IAuditableCommand`: BR-9 writes the row **in the same transaction**, so
  it is absent when the update rolls back. `Changes` carries no sensitive value (BR-9.7's
  redaction already covers the contact columns).

`Customer` gains its **second** mutator (`SupportUser.ChangeLanguage` was the entity
layer's first, in `014`). It takes already-normalised contact values, for the reason the
factory's own remarks give: a null from `ContactNormalisation` has to become a `400`
naming a field, and only the boundary knows the field's name.

---

## 6 · Out of scope

| Excluded | Where it lives |
|---|---|
| A rows-per-page control in the pager | Backed by `pageSize`, so it is buildable — but it is a **list** feature and belongs with `033`, not here |
| Ticket **counts by status** on the profile, and the `See all` variants beyond one link | `018`, narrowed by Q-2 rather than closed |
| Deactivate · reactivate · merge | No endpoint; reactivation is undesigned |
| Attachments | Out of product scope entirely |
| Types generated from OpenAPI | `028`, still blocked. The update shape stays **provisional**, marked in the file that declares it |
| A general modal/dialog primitive | `030`. This feature builds **one** sheet, not a primitive, and does not promote it — a promotion needs a second consumer and a written-up case (`033` §7.1) |

---

## 7 · Row hover — every table in the product

Specified by the product owner on 2026-09-03 with the CSS and its constraints. It lands
in the **`Table` primitive**, so it applies to `/tickets`, `/customers`, and every table
after them.

```css
tbody tr        { cursor: pointer; transition: background 120ms linear; }
tbody tr:hover  { background: #D6E4E8; box-shadow: inset 3px 0 0 #9FB4BC; }

/* the selected/open row wins, and hover does not touch it */
tbody tr[aria-selected='true'],
tbody tr[aria-selected='true']:hover {
  background: #F3F3FB;
  box-shadow: inset 3px 0 0 #1D174D;
}
```

The constraints, each with what it prevents:

| Constraint | What it prevents |
|---|---|
| The hover is on the **`<tr>`**, not the `<td>` | The row must light **once**. Today it is `.row:hover .td`, which lights eight cells that happen to abut |
| `border-collapse: collapse` on the table | Without it the `inset` box-shadow does not paint. **Already set** in `Table.module.css` — asserted, not assumed |
| The 3px rail sits on the **leading** edge | Right in RTL, left in LTR, from the table's own direction. No second rule and no physical value |
| **No `padding`, `height` or `border` change on hover** | Any size change makes the row jump under the cursor |
| `cursor: pointer` **only when the row is clickable** | A pointer over an inert row promises a click that does nothing. `Table` already knows: `onRowClick` is optional |
| If a row carries an **inline** background from JavaScript, CSS cannot win | Then it is done with `mouseenter`/`mouseleave`, **skipping the selected row**. Asserted as a source scan: no inline row background exists today, and if one appears this rule applies |

**Two of these four colours are not in `tokens.css`.** `#1D174D` is `--navy-900` and
`#F3F3FB` is `--purple-50`; `#D6E4E8` and `#9FB4BC` are new and become **tokens**, named
for their role, because colour lives in the token file and nowhere else (DESIGN-BRIEF
rule 3).

**`--surface-row-hover` is NOT the table row's token, despite the name.** This section
said it was and that it should be rewritten to #D6E4E8; implementation counted the
consumers and there are **eleven** — one table row, and ten faint hovers on the ticket
detail's menu items and panel rows plus the segmented tab track, every one of which wants
the near-white. Rewriting it would have restyled nine surfaces nobody asked about. The
table row gets its own four tokens (`--surface-table-row-hover`,
`--border-table-row-rail`, and the selected pair) and the old one keeps its value with an
honest description. Renaming it is a separate cleanup with eleven call sites.

**`aria-selected` has no producer yet.** No table in the product marks a row selected, so
the second rule is dead CSS on arrival. It is specified anyway and asserted by a test
that sets the attribute directly — because the ticket detail's row-flyout and this
feature's sheet both create the state, and a rule written after the fact is a rule
written twice.

---

## 8 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | The profile reads from `GET /api/customers/{id}` only. **No `setQueryData` seeds a customer key**, asserted by a source scan (`032` AC-1, `026` §5) |
| AC-2 | An unknown id **and** a malformed id both render not-found — asserted with **both**, because the API answers `404` to each |
| AC-3 | Copy writes the **raw** value: the assertion compares the clipboard payload to the API's value, never to the rendered text. The phone is rendered spaced and the id truncated, so a DOM assertion passes on the wrong string |
| AC-4 | Absent `email`, `phoneE164` or `companyName` renders **three cards** with an em dash in the empty one, asserted **distinct** from the skeleton and the error state |
| AC-5 | The avatar's tint is derived from the name by FNV-1a over five hues, and **the same person is the same colour** on the list, the profile and the sheet — asserted across two renders, not within one |
| AC-6 | `PUT` sends **every** field, including untouched ones. Asserted by clearing a field and reading the request body — the contract replaces rather than merges, and a merge-shaped client silently keeps a value the reader deleted |
| AC-7 | `expectedVersion` is the value from the **read**. Asserted by a second save after a successful one: it uses the `version` the refetch returned, never the first response's |
| AC-8 | `409 errors/concurrency-conflict` and `409 errors/duplicate-customer` render **different** copy and offer **different** actions, and the assertion branches on `type` — never on `title` or `detail`, both of which are localized |
| AC-9 | A `400` renders the **server's** message under the field the server named, and the assertion **reads the string**. A raw resource key fails it — `errors[field]` with one entry is a shape assertion, and seventeen unresolved keys once shipped under exactly that assertion |
| AC-10 | One request per submit, on the sheet and on the edit page. The control is inactive while in flight and **its accessible name does not change** |
| AC-11 | The sheet closes on success and the list **refetches**; nothing writes a customer into the list cache from the write response |
| AC-12 | `/customers/new` stays routed and reachable, and `033`'s no-match CTA still carries the search term into it (Q-3). Asserted, because an unreachable route is the defect this session found on `/tickets/new` |
| AC-13 | The audit row for an update exists, carries the actor, and is **absent** when the transaction rolls back — asserted by forcing the rollback, not by reading the happy path |
| AC-14 | Hover paints on the `<tr>`, and **no** rule under `:hover` changes `padding`, `height`, `border` or `border-width` — asserted by a source scan over the primitive's stylesheet, because jsdom draws no boxes |
| AC-15 | The rail is on the leading edge in **both** directions, measured in a real browser at one viewport in `ar` and `en`, and the number is recorded |
| AC-16 | `cursor: pointer` appears only when `onRowClick` is passed — asserted both ways |
| AC-17 | A row with `aria-selected="true"` keeps its own background and rail **under hover**, asserted by setting the attribute directly |
| AC-18 | `#D6E4E8` and `#9FB4BC` appear in `tokens.css` and **nowhere else**. **`--surface-row-hover` keeps `#FAFCFC` and is not repurposed** — this AC said the opposite until implementation counted its consumers: eleven, of which ten are faint hovers on the ticket detail and the tab track. The table row has its own four tokens |
| AC-19 | Every new i18n key exists in `en` **and** `ar`; both screens and the sheet viewed in Arabic and rendering RTL |
| AC-20 | The generated OpenAPI matches `017`'s frozen contract, in both directions |

---

## 9 · What could go wrong, from this codebase's own history

Read before implementing. Each row is a defect this repository has already had.

| Risk | The rule it comes from |
|---|---|
| The edit form is written from the **contract example** rather than driven end to end | `009` invented two enum members and two wrong values that way. An entity written only from outside the real path is unverified — and the first real request is its first test |
| A create and a read of the same customer return **different** bodies | `007` AC-14: full .NET tick precision in memory against `datetime2(3)` in the column. Truncation lives in `RequestTimestamp`, and an update must read the same instant |
| The duplicate check is done in the client first | `032` AC-8 forbids it by name. Check-then-create is a race both requests pass; BR-4.8's filtered index is the guarantee |
| `expectedVersion` is taken from the write response | `014` recorded the analogous trap: a token is immutable after signing. Here the contract states the rule and AC-7 asserts it |
| A `409` is branched on `title` | BR-8: `title` and `detail` are localized, `type` is not |
| The sheet's own `position: sticky` or `z-index` swallows a flyout | `027`, twice in one session: `sticky` establishes a stacking context, and an inline `style` beats the stylesheet |
| The hover guard passes on its own prose | Twice in `027`. The scan strips comments first, and carries a control proving the stripper ran |

---

## 10 · Task shape

Numbering per `specs/README.md` — `BE-035-nn`, `FE-035-nn`, `TEST-035-nn`. Written into
`tasks.md` after approval, with an **Agent** and a **Skill** on every row: a task with
neither is a task nobody owns.

Order is forced by one dependency: **the sheet and the edit page share a form**, and the
edit page needs `PUT`. So the backend half goes first, the shared form second, and the
two consumers after it. The hover work (§7) is independent of all of it and can land
first — it touches only the primitive.
