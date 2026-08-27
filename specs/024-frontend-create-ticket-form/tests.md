# 024 · Create-ticket form — what was run, and what was seen

**Lane:** frontend. **Backend feature:** `009-create-ticket`, not yet delivered.
**Date of the run:** 2026-08-26. **Every output below was observed.** Nothing here is
asserted from memory, and the two things that could not be exercised are named in §9 rather
than softened.

---

## 1 · The commands, and their observed output

```text
$ npx tsc -b
(no output — exit 0)

$ npx eslint .
(no output — exit 0)

$ npx stylelint "src/**/*.css"
(no output — exit 0)

$ npm run format:check
Checking formatting...
All matched files use Prettier code style!

$ npm run lint:i18n
Locale parity OK — ar, en · 4 namespaces · 62 keys compared.

$ npm run lint:types
✓ no hand-written domain types outside src/lib/api-types.provisional.ts

$ npx vitest run
 ✓ src/features/tickets/createTicket.schema.test.ts (7 tests) 19ms
 ✓ src/features/tickets/CreateTicketPage.test.tsx (4 tests) 4527ms
   ✓ TEST-024-07 … issues NO request below two characters              1132ms
   ✓ TEST-024-07 … issues ONE request for a burst of keystrokes         939ms
   ✓ TEST-024-06 … sends the ticket ONCE when submit is clicked twice  1274ms
   ✓ TEST-024-05 … preserves subject, description, and all three selects 1177ms
 Test Files  2 passed (2)
      Tests  11 passed (11)

$ npm run build
dist/assets/CreateTicket.module-*.js     0.87 kB │ gzip:  0.35 kB
dist/assets/TicketCreatedPage-*.js       1.34 kB │ gzip:  0.68 kB
dist/assets/CreateTicketPage-*.js      119.97 kB │ gzip: 36.12 kB
dist/assets/index-*.js                 329.06 kB │ gzip: 105.61 kB
✓ built in 975ms

$ grep -rlE 'CreateTicketPreview|data-preview-state' dist/
(no match — clean)
```

### The workflow itself has never run

Every command above was executed **locally**, in the order
`.github/workflows/ci-frontend.yml` lists them, and the output is what is transcribed here.
The workflow file has **never executed on a runner**. No push has triggered it, so nothing
has proven that `actions/setup-node@v4` resolves, that the lockfile cache path is right, or
that the `dist/` grep step behaves the same under `ubuntu-latest` as it does here.

A workflow that is written and not run is a **claim**, not a gate, until the first push
executes it. It is recorded here as a claim and in `summary.md` §6 as a known limitation
rather than counted among the checks above.

Eleven automated tests, not more. The six named in `tasks.md` are `TEST-024-01 · 02 · 05 ·
06 · 07 · 11`; four of them expanded into more than one `it` where a single assertion would
have been ambiguous, and the counts above reflect what actually ran.

---

## 2 · Every gate was made to fail before it was trusted

A gate that has only ever been green has not been tested — it has been *observed while
nothing was wrong*, which is a different claim.

### `TEST-024-01`'s mutant — `.trim()` removed from the subject rule

```text
$ # subject: z.string().trim().min(1, …)   →   z.string().min(1, …)
$ npx vitest run src/features/tickets/createTicket.schema.test.ts
 ❯ src/features/tickets/createTicket.schema.test.ts (7 tests | 3 failed) 24ms
   × TEST-024-01 … rejects a subject of spaces alone                      15ms
   × TEST-024-01 … is not satisfiable by length alone — three spaces …     2ms
   × TEST-024-01 … sends the TRIMMED value, which is what the server …     2ms
   ✓ TEST-024-01 … applies the same rule to description                    1ms
   ✓ TEST-024-02 … (3 tests)
 Tests  3 failed | 4 passed (7)
```

The `.trim()` was restored and the suite returned to 7/7. Three of the four `TEST-024-01`
assertions are load-bearing; the fourth (`description`) stayed green because the mutation
was applied to `subject` only, which is the correct result and worth seeing.

### `TEST-024-11` — the ADR-011 §6 gate, against a deliberate violation

A file was added containing one violation of each rule and then deleted.

```text
$ cat src/features/tickets/__violation.ts
export interface TicketSummary { id: string; ticketNumber: string }
export type CaseChannel = 'email' | 'whatsapp' | 'sms';

$ node scripts/check-no-domain-types.mjs
✗ ADR-011 §6 — 2 hand-written domain type(s):

  src/features/tickets/__violation.ts:2  [R1]  `interface TicketSummary` is named after a domain resource.
  src/features/tickets/__violation.ts:6  [R2]  `type CaseChannel` restates a contract enum (email, whatsapp, sms).

Domain types belong in src/lib/api-types.provisional.ts, written from the frozen contract.
If the contract is silent, ask the backend lane — do not guess a shape.
A deliberate exception goes in this script's ALLOWED list with a reason and an owner.
exit 1

$ rm src/features/tickets/__violation.ts && node scripts/check-no-domain-types.mjs
✓ no hand-written domain types outside src/lib/api-types.provisional.ts
exit 0
```

`R2` matched `'email' | 'whatsapp' | 'sms'` in **lower case**. That is deliberate: a wrong
casing is not a typo the compiler can see, and it is the exact shape of the `'SMS'` defect
the spec's §11 is built around.

---

## 3 · Every AC, and how it was established

`test` = an automated assertion. `obs` = a recorded browser measurement. `no` = not
established, with §9 saying why.

| AC | How | Result |
|---|---|---|
| AC-1 | `obs` §11 | **Proven end to end against the running API, in both locales.** `201`, the real `Location` followed, `TCK-2026-000007` / `TCK-2026-000008` rendered verbatim in Latin digits. Two defects were found doing it |
| AC-2 | `obs` §6 | The fieldset is `disabled`, and the accessibility tree names the group `"Ticket Select a customer to continue"`. A defect was found and fixed here |
| AC-3 | `test` `TEST-024-07` | 0 requests at one character; exactly 1 for the burst `G-u-l-f`, carrying `"Gulf"` |
| AC-4 | `obs` §5 | Listbox present at ≥2 characters, `ArrowDown` 0→1, `ArrowUp` 1→0, focus stays on the input, `Enter` selects and closes. **Deviation** on `dir="auto"` — see §8 |
| AC-5 | **partly `no`** | "No matching customers" renders, with the create-customer affordance and its unavailability note. There is **no link and no `returnUrl`** — see §8 |
| AC-6 | `test` `TEST-024-01` + `obs` | `"   "` is rejected client-side: `requestsSent: 0`, `aria-invalid="true"`, message `Subject is required` / `الموضوع مطلوب` |
| AC-7 | `obs` §6 | Absent at 179, appears at 180 as `180 / 200`, turns the warning colour at `200 / 200`, disappears below 180. `aria-live="polite"`, `dir="ltr"`. **A defect was found and fixed here** |
| AC-8 | `test` `TEST-024-02` + `obs` | `priority` is absent from `Object.keys`, from the parsed JSON, and from the serialised string. Confirmed again over the real `api.ts` path against a stubbed `fetch` |
| AC-9 | `obs` §4 | No hand-typed option list remains. **A defect was found and fixed in the dev preview** |
| AC-10 | `obs` §7 | A `400` attached `errors.subject` and `errors.channel` to those two controls by the server's own keys; `description` was untouched; focus moved to `subject`. **A defect was found and fixed here** |
| AC-11 | `test` `TEST-024-05` | The picker is cleared and empty; `subject`, `description`, `category`, `priority`, `channel` all unchanged; the reason renders in an `alert` |
| AC-12 | `test` `TEST-024-06` + `obs` | Two synchronous clicks → `createTicket` called **once**. In the browser, three clicks → one request. **A defect was found and fixed here** |
| AC-13 | `obs` | `git grep` for `ticketNumber =`, `allowedTransitions`, `createdByUserId` outside the provisional file returns one line: `TicketCreatedPage` *reading* the number out of navigation state. Nothing computes or sends any of the three |
| AC-14 | `test` `TEST-024-11` | Above, §2 |
| AC-15 | `test` `lint:i18n` | 62 keys, 4 namespaces, `ar` and `en` at parity. One key per enum value, keyed on the wire value |
| AC-16 | `obs` §5, §7 | Every control keyboard reachable; focus moves to the first invalid field on a failed submit in **both** locales. **A defect was found and fixed here** |
| AC-17 | `obs` §6 | The Arabic walk, below. Two defects found |
| AC-18 | `obs` | Rendered in `FE-024-00`'s preview and reviewed before wiring. `Textarea` has no height token — `resize: block` and `rows` only |
| AC-19 | `obs` | The preview was built and reviewed **in Arabic first**, before any wiring. The three-selects row was decided on the Arabic labels: three at 213px inside a 720px card, no overflow |
| AC-20 | `test` §1 | All six gates exit 0 |

---

## 4 · AC-9 — the option lists, and the one place they were restated

The check:

```text
$ grep -rnE "'(Billing|Technical|Account|General|Low|Normal|High|Critical|Email|WhatsApp|LiveChat|Sms|WebForm|New|Open|InProgress|PendingCustomer|Resolved|Closed)'" \
    src --include=*.ts --include=*.tsx | grep -v api-types.provisional | grep -v '\.test\.'
```

**First run — thirteen hits, all in `src/dev/CreateTicketPreview.tsx`.** The preview
hand-wrote all three enum lists as `as const` arrays of `[wireValue, arabic, english]`.

This is the same failure the `vite.config.ts` selector-stripping exists to prevent, and it
had gone unnoticed because the preview is dev-only: the contract gains a channel, the
preview keeps showing four, and the screen it is previewing shows five. **A preview that
restates a value is a preview that can lie about it.**

Fixed by typing the label tables as `Record<TicketCategory, …>`, `Record<TicketPriority, …>`
and `Record<CommunicationChannel, …>` and deriving the rows from `TICKET_CATEGORIES`,
`TICKET_PRIORITIES` and `COMMUNICATION_CHANNELS`. A contract value added is now a **missing
key** and one removed is an **extra key** — both compile errors, in the file that would
otherwise have drifted silently.

**After the fix the grep still returns lines from that file**, and they are recorded here
rather than filtered away: they are the *keys* of those records and the *English labels*,
e.g. `Billing: ['الفوترة', 'Billing']`. The key is compile-checked against the contract type;
the English label happening to equal the wire value is a coincidence of this domain, not a
restatement. Nothing in `src/features/` or `src/components/` matches.

---

## 5 · AC-4, AC-16 — the listbox, walked with the keyboard

```json
{ "belowMinChars": { "listbox": false },
  "options": [
    { "text": "شركة الرياض القابضةali@exa", "bdiCount": 2 },
    { "text": "مؤسسة الخليج للتقنيةnoura@", "bdiCount": 2 },
    { "text": "عبدالله بن محمد العتيبيabd", "bdiCount": 2 } ],
  "selectedBefore": 0, "afterArrowDown": 1, "afterArrowUp": 0,
  "focusStayedOnInput": true, "enterSelectedAndClosed": true }
```

Focus never leaves the input while arrowing, which is what keeps the caret usable — the
handler sits on a wrapper `<div>` and relies on React's event bubbling rather than on the
list being focusable.

---

## 6 · AC-17 — the Arabic walk of this screen

`localStorage['wasl.lang'] = 'ar'`, reload, then every value below read from
`getComputedStyle` or `getBoundingClientRect`. Nothing eyeballed.

### Correct, measured

| Check | Measured |
|---|---|
| Document direction | `lang="ar"`, `dir="rtl"` |
| Typeface | `"IBM Plex Sans Arabic", "IBM Plex Sans", system-ui, …` |
| Back link and title | Back at the inline-**start**: `right: 1296` against a head-row right edge of `1296` |
| Field labels | All six `direction: rtl`, `text-align: start` |
| The three selects | Right-to-left in DOM order — Category `1058`, Priority `830`, Channel `601` |
| Actions row | Submit at the inline-**end** (`576`), Cancel beside it (`682`) — the correct mirror of `[Cancel] [Create]` |
| A customer's Latin email inside an Arabic row | `<bdi>` computes `ltr` inside an RTL block |
| Validation message | `الموضوع مطلوب`, `direction: rtl`, `text-align: start` |
| Focus after a failed submit | Moved to `subject` — in Arabic as well as English |
| Horizontal overflow | `scrollWidth === clientWidth` at 1440 and at the walked width |

### Found and fixed — the empty search field was LTR inside an RTL form

```json
{ "htmlDir": "rtl", "formDirection": "rtl",
  "picker": { "attrDir": "auto", "computedDirection": "ltr", "textAlign": "start" } }
```

`dir="auto"` on the control is deliberate and stays — a customer named `Gulf Logistics` and
one named `أحمد` must each read correctly in either interface. But `auto` decides from the
**value**, and an empty value has no strong character in it, so the browser falls back to
`ltr`. The placeholder is not the value, which is why `auto` ignores it.

On screen: an Arabic placeholder and the caret against the **left** edge of a
right-aligned form, flipping to the right the moment the first Arabic letter was typed.

Fixed with one rule in `Input.module.css` and the same in `Textarea.module.css`:

```css
.control:placeholder-shown {
  direction: inherit;
}
```

Verified in both directions, in one probe:

| State | `direction` |
|---|---|
| empty | `rtl` (follows the interface) |
| `"Gulf"` | `ltr` |
| `"أحمد"` | `rtl` |
| cleared again | `rtl` |

`inherit`, not `rtl` — nothing in a component names a direction.

### Found and fixed — the priority list showed "عادية" twice

```json
{ "priorityOptions": ["عادية", "منخفضة", "عادية", "مرتفعة", "حرجة"] }
```

The empty option's label was `t('tickets:priority.Normal')`, chosen to tell the user what
happens if they leave it alone. The result is two identical entries with nothing on screen
to tell them apart — and **the two send different requests**: `priority` omitted versus
`priority: "Normal"`.

Fixed with a new key in both catalogues, `tickets:new.priorityDefault` =
`"{{value}} (default)"` / `"{{value}} (افتراضي)"`:

```json
{ "ar": ["عادية (افتراضي)", "منخفضة", "عادية", "مرتفعة", "حرجة"],
  "en": ["Normal (default)", "Low", "Normal", "High", "Critical"] }
```

Dropping `Normal` from the list would also have removed the ambiguity, and was rejected: a
UI that filters a contract enum is a UI editing a contract.

### Found and fixed — the subject field had no counter at all

`FE-024-14` and AC-7 ask for counters from **180** and **3800**. Measured:

```json
{ "at179": [], "at180": [], "at200": [],
  "desc3800": [{ "text": "3800 / 4000", "dir": "ltr", "live": "polite" }] }
```

The description counter existed; the subject counter did not — `Input` had `maxLength` but
no counter at all, and `counterFrom` had never been passed. `maxLength={200}` is exactly why
it is worth having: typing simply **stops**, with nothing on screen saying why. A hard cap
without a counter is a field that ignores you.

`counterFrom` was added to `Input`, mirroring `Textarea`'s implementation and its CSS, and
wired at 180. After:

| Length | Counter |
|---|---|
| 179 | absent |
| 180 | `180 / 200`, `dir="ltr"`, `aria-live="polite"` |
| 200 | `200 / 200`, warning colour (`counterNear`) |
| back to 13 | absent |

### Found and fixed — the disabled section carried the state but not the reason

The accessibility tree, before:

```text
textbox "Subject*" disableable disabled required
```

The explanatory sentence was a `<p>` beside the heading — a sibling nobody is directed to.
A screen reader landing on `Subject` heard *"Subject, edit, disabled"* and nothing about why.
AC-2 asks for the explanation to be available to a screen reader, **not only visually**, and
it was not.

`aria-describedby` on a `<fieldset>` is not reliably announced when focus lands on a child.
The mechanism that is, is a `<legend>` — it is the group's accessible name, and every
control inside inherits the announcement. The `<h3>` was kept inside it, so the section is
still reachable by heading navigation.

After, from the verbose accessibility tree:

```text
group "Ticket Select a customer to continue"
  Legend
    heading "Ticket" level=3
    StaticText "Select a customer to continue"
```

**A second defect came out of the fix.** The first version reset the legend with the
long-standing `float: inline-start; inline-size: 100%`. A 100%-wide float is out of flow, so
the following `.stack` kept its own block position and only its *line* boxes wrapped:

```json
{ "subjectBox": { "left": 1559, "w": 26 }, "cardBox": { "left": 864, "w": 720 } }
```

A 26px-wide subject input inside a 720px card. Replaced with `display: block`, which modern
engines honour on a legend, and re-measured:

```json
{ "subjectBox": { "w": 670 }, "textareaBox": { "w": 670 },
  "selectBoxes": [{ "w": 213 }, { "w": 213 }, { "w": 213 }],
  "horizontalOverflow": false }
```

Recorded because the accessibility fix broke the layout, and the layout break was in a
place nothing in the test suite looks at.

---

## 7 · AC-10, AC-8, AC-16 — the `400` path, over the real client

The backend is unreachable, so `window.fetch` was stubbed to return a real
`application/problem+json` `400`. Everything on our side of the wire is the production
code path: `api.ts` parses it, throws `ApiError`, and `handleFailure` distributes it.

```json
{ "requestBody": { "customerId": "9a1b2c3d-…", "subject": "Card declined at checkout",
                   "description": "The payment page returns an error.",
                   "category": "Billing", "channel": "Email" },
  "subject":     { "ariaInvalid": "true", "described": ["Subject must be 200 characters or fewer."] },
  "channel":     { "ariaInvalid": "true", "described": ["Channel is required."] },
  "description": { "ariaInvalid": null,   "described": ["Describe the problem in enough detail…"] },
  "focusIsSubject": true,
  "pickerStillSelected": true }
```

Four things at once: `priority` is absent from the body (AC-8, over the real serialiser);
each message reached its own control **by the server's key**, with no mapping table and
across two different control types; the untouched field kept its helper and gained no
`aria-invalid`; focus moved to the first invalid field.

### The defect this exposed — no `ref`, so focus never moved

The first measurement of a client-side failure returned:

```json
{ "requestsSent": 0, "ariaInvalid": "true", "message": "Subject is required",
  "focusIsOnSubject": false }
```

AC-6 held and AC-10 did not. React Hook Form's `shouldFocusError` and `setFocus` both work
by calling `.focus()` on the ref a field registered — and `Input`, `Select` and `Textarea`
did not forward one, so there was nothing to focus. Registered, never attached.

Fixed by wrapping all three primitives in `forwardRef` (the ref pointing at the **control**,
never the wrapper) and passing `ref={field.ref}` from all five `Controller`s. Re-measured:
`afterIsSubject: true`, in English and in Arabic.

---

## 8 · Deviations from the acceptance criteria as written

| AC | What differs | Why |
|---|---|---|
| AC-4 | Results carry `<bdi>` isolation rather than `dir="auto"` on the row | Same conclusion `023` reached under *one field, two edges*: `dir="auto"` on a container makes a Latin row hug the opposite edge from its Arabic neighbours. `<bdi>` keeps the block following the interface and the text following itself — which is what the AC is for. Two `<bdi>` per row, measured |
| AC-5 | The create-customer affordance is a **disabled span**, not a link, and carries no `returnUrl` | There is no customer-create screen to return from (spec Q-2). The copy and the unavailability note are present so the shape is visible; the link and its `returnUrl` land with that screen. Recorded rather than claimed |
| AC-7 | Counters were built into `Input` as well as `Textarea` | `Input`'s props table was frozen by `023` and this adds `counterFrom` to it. The alternative was leaving AC-7 half-met on the subject field |

---

## 9 · Not verified, and why

| Not verified | Why | Who closes it |
|---|---|---|
| ~~AC-1 end to end~~ | **Closed 2026-08-27** — see §11. The API was started and the round trip run through the real browser UI | — |
| Customer search against the real endpoint | `GET /api/customers` returns **404** — measured 2026-08-27, the endpoint is not built. `STUBBED_CUSTOMER_SEARCH` stays `true`; the stub and the real call sit side by side, so the switch is one constant | `008`, then `FE-009-05` |
| The generated OpenAPI compared against `contracts/tickets-api.md` | `GET /swagger/v1/swagger.json` returns **404** — measured 2026-08-27, not merely assumed. `REV-024-03` stays deferred | `FE-009-05` |
| `401` → the sign-in screen | There is no sign-in screen; the branch navigates to `/`. The branch exists because the contract is frozen | `004-auth-and-roles` |
| The screen below 780px, and `prefers-reduced-motion` | Same two gaps `023` left open, for the same reason: no measurement was taken, so no claim is made | A later feature |
| Screen-reader announcement *as heard* | The accessibility **tree** was read, which is not the same as hearing NVDA or VoiceOver say it. The tree is evidence the name exists, not evidence of how it is spoken | Manual QA |

---

## 10 · The measurement tools, again

Two more instances of the category recorded in
[`023/tests.md` §12](../023-frontend-foundation/tests.md), both caught the same way — by
checking the tool against something at a lower level than itself.

- A browser probe counted `document.querySelectorAll('[role="option"]')` and reported
  **one** option. Testing Library's `findByRole('option')` reported **sixteen**: a native
  `<option>` carries the role implicitly, and this form has three `<select>` elements. The
  attribute query and the role query are not the same question. Fixed by scoping the query
  inside the listbox — and the disagreement is why the test comment says so.
- The ADR-011 §6 gate's **first output** was
  `CreateTicketPage.tsx:17 [R1] type CustomerListItem` — a line inside
  `import { …, type CustomerListItem } from …`. The gate's opening accusation was against
  the one call site using the provisional file correctly. Fixed by requiring what *follows*
  the name and by skipping import spans; the script now also refuses to report success if it
  cannot find the declarations it is required to find.

Filing either one without the second look would have been a false accusation — in the
gate's case, against our own correct code; in the enum script's case in `023`, against the
backend lane.

---

## 11 · AC-1, end to end against the running API — 2026-08-27

Run at the product owner's instruction, after `024` was accepted. The API was started
locally; **nothing in `src/Wasl.*` was touched.**

```text
$ docker compose up -d db                       # started, healthy — and unused, see below
$ dotnet run --project src/Wasl.Api -- --seed
  No migrations were applied. The database is already up to date.
  Seed skipped: tickets already exist.
$ curl -s http://localhost:5272/health
  {"status":"Healthy","checks":[{"name":"database","status":"Healthy"},{"name":"self","status":"Healthy"}]}
```

**The port is 5272, not 5000.** From `src/Wasl.Api/Properties/launchSettings.json`, the
`http` profile. `.env.example` guessed 5000 (spec Q-4); that guess is now answered.

**The Docker database is not the one the API uses.** `appsettings.Development.json` points
at `Server=.\SQLEXPRESS`, so `docker compose up -d db` started a container that nothing
connected to — its `sys.databases` has no `Wasl`. Recorded because the health check said
`database: Healthy` throughout and would have been read as confirmation that the container
was in use.

### Two defects, both found only by running it

**D-1 · CORS — the request never reached the server.**

```text
Access to fetch at 'http://localhost:5272/api/tickets' from origin
'http://localhost:5199' has been blocked by CORS policy: Response to preflight
request doesn't pass access control check: No 'Access-Control-Allow-Origin'
header is present on the requested resource.
```

The screen showed `Failed to fetch` — which is exactly what it should show, and says
nothing about why. **Not fixed in the API.** Fixed on this side, in this lane's own file:
`vite.config.ts` now proxies `/api` to the API in development, so the browser makes a
same-origin request and no preflight happens. `BASE_URL` defaults to
`window.location.origin` as a result, which removes the hard-coded port guess entirely.

The proxy fixes the development loop. It does **not** fix the gap: any deployment serving
the SPA from a different origin hits it again. That is reported to the backend lane.

**D-2 · `Location` is absolute, and the client only handled the relative form.**

```text
Location: http://localhost:5272/api/tickets/01a0449b-cdd2-7d46-9a78-d108a0384466
```

The contract (line 75) promises `Location: /api/tickets/{id}`. Both forms are legal under
RFC 9110, and the client did `location.replace(/^\/api/, '')` — which silently does nothing
to an absolute URL, so React Router would have been handed a whole URL as a path.

Replaced with a `toAppPath` helper that parses both forms through `new URL(value, origin)`
and uses only the **pathname**. Whichever way the contract difference is resolved, this
keeps working. The difference itself is a defect in one of the two documents and is
**reported, not silently absorbed**.

### The English run

```json
{ "calls": [{ "url": "http://localhost:5199/api/tickets", "method": "POST", "status": 201,
              "location": "http://localhost:5272/api/tickets/01a0449b-cdd2-7d46-9a78-d108a0384466" }],
  "pathname": "/tickets/01a0449b-cdd2-7d46-9a78-d108a0384466",
  "toastText": "Created ticket TCK-2026-000007×",
  "ticketNumber": "TCK-2026-000007",
  "ticketNumberDirAttr": "ltr", "ticketNumberComputedDir": "ltr" }
```

One request. `201`. Navigated to the path the **server** named. The number rendered verbatim.

And a `GET` on the `Location` the server returned resolves — the contract's own AC-1 clause:

```text
$ curl -s -i http://localhost:5272/api/tickets/01a0449b-…
HTTP/1.1 200 OK
{"id":"01a0449b-…","ticketNumber":"TCK-2026-000007","customer":{…},"priority":"Normal",
 "status":"New","createdByUserId":null,"allowedTransitions":["Open","Closed"],"version":"AAAAAAAApCQ="}
```

`priority: "Normal"` — the server applied its default to the omitted field, which is AC-8's
other half and could not be checked without a server. `createdByUserId: null`,
`allowedTransitions` server-computed, `version` a base64 rowversion. **The response matches
`api-types.provisional.ts` field for field**, which is the first real evidence the
hand-written types are right.

### The Arabic run

```json
{ "htmlDir": "rtl",
  "calls": [{ "method": "POST", "acceptLanguage": "ar", "status": 201,
              "location": "http://localhost:5272/api/tickets/01a0449e-9eef-7101-a914-4a71715d28f5" }],
  "pathname": "/tickets/01a0449e-9eef-7101-a914-4a71715d28f5",
  "toastText": "تم إنشاء التذكرة TCK-2026-000008×",
  "ticketNumber": "TCK-2026-000008",
  "hasArabicIndicDigits": false,
  "toastDirection": "rtl", "ticketNumberComputedDir": "ltr" }
```

`Accept-Language: ar` was sent. The message is Arabic; the **number is Latin digits**
(`hasArabicIndicDigits: false`) inside an RTL toast, with the number's own run computed
`ltr`. That is BR-8.13 and the bidi isolation working together, measured rather than
inspected.

Read back from the server:

```json
{ "subject": "الدفع مرفوض عند إتمام الطلب",
  "description": "العميل يقول إن صفحة الدفع تُرجع خطأ عند الضغط على تأكيد.",
  "channel": "WhatsApp" }
```

Arabic stored and returned intact — no `????`, so `nvarchar` is in use (ADR-013).

### What was changed to run this, and put back

The picker is stubbed, so its ids are fixtures and no ticket could be created against one.
**One line** of `STUB_CUSTOMERS` was pointed at a real seeded customer id for the duration
of the run, and restored immediately afterwards:

```text
$ diff /tmp/tickets.api.bak src/features/tickets/tickets.api.ts
(no output — identical to the backup)
```

Recorded rather than quietly reverted, because a reader comparing these transcripts to the
committed stub would otherwise find ids that do not match and have no way to know why.

### Two observations for the backend lane, neither acted on

| Observation | Measured | Why it matters here |
|---|---|---|
| `errors` keys come back **PascalCase** — `{"Subject": […], "Description": […]}` | `POST /api/tickets` with `{}` | The contract's examples use `subject` / `customerId`, and `handleFailure` looks the field up by the request field name. PascalCase keys match nothing, so per-field `400` messages fall through to a generic banner — **AC-10 breaks against the real server** even though it passes against the contract's own example |
| `Content-Language` is **not sent** on the response | Both runs, `contentLanguage: null` | `ApiError.contentLanguage` exists so a caller can tell that a request for `ar` produced English (BR-8). It will always be `null` until the header is sent |

Neither was changed. Both are differences between the running API and the frozen contract,
and the working agreement is explicit that a difference is a defect in one of the two and
is never fixed silently on one side.
