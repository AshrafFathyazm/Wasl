# 024 · Code review — `REV-024-01`

**Verdict: Approved**, with two findings raised and fixed during the review and one
limitation carried forward to `summary.md`.

Reviewed 2026-08-26 against the checklist in `tasks.md`: ADR-011 §4 component kinds,
fetching only at the route, no barrel file, no `any`, no domain type outside the provisional
file, no hand-typed enum.

---

## 1 · The mechanical checks, and their output

```text
$ grep -rn ": any\b|<any>|as any" src --include=*.ts --include=*.tsx
(none)

$ find src -name "index.ts" -o -name "index.tsx"
(none)

$ grep -rn "@ts-ignore|@ts-expect-error|eslint-disable" src
(none)

$ grep -rnE "(margin|padding|border)-(left|right)\b|(^|\s)(left|right):" src --include=*.css
(none — every offset is a logical property)

$ grep -rln "from '.*tickets.api'|from '.*lib/api'" src --include=*.tsx
  src/features/tickets/CreateTicketPage.tsx
  src/features/tickets/CreateTicketPage.test.tsx

$ npm run lint:types
✓ no hand-written domain types outside src/lib/api-types.provisional.ts
```

**Two `.tsx` files reach the API, and one of them is the test.** `CustomerPicker` — the
component where fetching *feels* local, and therefore the one the rule exists for — imports
neither. It takes `results`, `isSearching`, `hasSearched`, `selected` and its handlers as
props.

---

## 2 · ADR-011 §4 — component kinds

| File | Kind | Correct |
|---|---|---|
| `components/{Button,Input,Select,Textarea,Badge,Loader,Toast}` | Primitive — no domain knowledge, no data | yes |
| `features/tickets/CustomerPicker.tsx` | Feature component — domain-aware, fetches nothing | yes |
| `features/tickets/CreateTicketPage.tsx` | Route — owns both fetches | yes |
| `features/tickets/TicketCreatedPage.tsx` | Route — placeholder for `010`, fetches nothing | yes, and says so |
| `features/tickets/tickets.api.ts` | Data access | yes |
| `features/tickets/createTicket.schema.ts` | Schema — types and validation from one source | yes |

`Toast` takes `children: ReactNode` and a required `dismissLabel` rather than holding any
string of its own. A primitive that holds copy is a primitive with domain knowledge.

---

## 3 · Findings raised during the review

### F-1 · The dev preview restated all three enum lists — **fixed**

`src/dev/CreateTicketPreview.tsx` hand-wrote thirteen wire values as `as const` arrays. Not
a lint failure, because the file is dev-only and never bundled — which is exactly why it had
survived. The contract gains a channel, the preview keeps showing four, and the screen it is
previewing shows five.

Fixed by typing the label tables as `Record<TicketCategory, …>` and friends and deriving the
rows from the contract constants: an added value is now a missing key, a removed value an
extra one, both compile errors. Recorded in `tests.md` §4.

### F-2 · `UserRole` was `'agent' | 'manager'` — **fixed**

Lower case, against `Agent` / `Manager` in BR-2 and BR-6. Found by the new ADR-011 §6 gate on
its first real run. The compiler cannot see this class of defect at all: `'manager'`
type-checks against `'manager'` everywhere in this app and fails at the first request that
sends it. Corrected, and the file allowlisted with `004-auth-and-roles` named as the owner.

---

## 4 · Accepted, with the reason recorded

**Three hard-coded colour literals remain**, all in `src/shell/`:

```text
src/shell/Anchored.module.css:41   box-shadow: 0 6px 20px rgb(13 38 38 / 12%);
src/shell/Sidebar.module.css:77    background-color: rgb(13 38 38 / 40%);
src/shell/Sidebar.module.css:492   box-shadow: 0 6px 20px rgb(13 38 38 / 12%);
```

These are `023`'s, not this feature's, and they are the documented outcome of a product-owner
decision: **no shadow or motion tokens exist** (`tokens.css` note 11), and the instruction was
to hard-code and record rather than invent a token. Each site carries the TODO and cites
`Q-8`. Verified present, not assumed.

Nothing in `024`'s own CSS adds a literal — `Select`, `Textarea`, `Toast` and the screen's
own module use semantic tokens throughout.

---

## 5 · What a reviewer should look at first if this breaks

In order of how quietly each one fails:

1. `.control:placeholder-shown { direction: inherit }` — removing it makes an empty Arabic
   search field render LTR, and the page still looks finished.
2. `ref={field.ref}` on the five `Controller`s — removing any one stops focus moving to that
   field on a failed submit, silently.
3. The `useRef` double-submit guard — replacing it with `isPending` restores the two-`POST`
   defect, and only under a fast double click.
4. `<legend>`'s `display: block` — reverting to `float` shrinks the subject input to 26px,
   which no test asserts on.
5. `toCreateTicketRequest` — spreading instead of building the body reintroduces
   `priority: ""`, which the server rejects with a `400`.
