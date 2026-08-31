# 028 — Generated API types

**Lane:** Frontend · **Status:** spec, awaiting review · **Split from:** `FE-014-12`, 2026-08-30

## 1 · Why this is its own feature

`FE-014-12` said *"provisional request type replaced with types generated from the OpenAPI
document."* It sat inside `014` because that is where the language work needed a request
type. Regenerating types touches **every consumer of one file** — a horizontal change inside
a vertical feature, which is the shape that makes a language feature fail on a type error in
a screen it never meant to touch.

Split by the product owner on 2026-08-30.

## 2 · The condition is met, and it was never `/swagger`

`024` §10 shelved hand-written types *"until `/swagger` is real and generation runs."*

**There is no `/swagger`, and there never will be.** `002c` generates the OpenAPI document
and deliberately does **not** serve it: serving it needs `AllowAnonymous` and would make it
the third anonymous endpoint after `/health` and `POST /api/auth/token` — a list `004` AC-10
counts and asserts.

What the condition meant is a document to generate *from*, and that landed 2026-08-30. The
condition is satisfied; the wording was wrong. `024` §10 now records both.

## 3 · In scope

- Generate types from the OpenAPI document `002c` produces
- **Delete `src/wasl-web/src/lib/api-types.provisional.ts`** — deleted, never edited. This read "shrink to the error shapes only" for one day, while the document named a content type the server never sent; `5dedb62` closed that and §3b keeps the record
- Move every consumer to the generated types
- Delete `scripts/check-no-domain-types.mjs`, or repoint it at the generated module — the
  guard exists to contain the hand-written file, and outlives it only if it is given a new job
- The generation step in CI, so a contract change fails the build rather than a screen

## 3b · This section was wrong twice. Here is the settled version

It is kept as a record rather than rewritten clean, because both errors were the same kind:
**a claim about the document, made without reading the document.**

| Version | Claimed | Reality |
|---|---|---|
| 1 | The document declares **no statuses** — AC-3 not claimed | **38 `[ProducesResponseType]` on 13 actions**, 21 on `TicketsController` alone. `002c` deferred the criterion on reading the SOURCE rather than the document it is about. I repeated it without checking |
| 2 | Statuses fine, but every error declares `text/plain, application/json, text/json` — so error bodies must stay hand-written | True when written, **fixed the same day** (`5dedb62`) |
| **3 — current** | Statuses and media types are both correct **and asserted** | Verified here: `OpenApiContractTests` — 6 passed |

### What the guard actually asserts

Not merely that the document is right today. For every operation, every response with status
≥ 400 that declares content must include `application/problem+json` — and the failure message
names `028` as the reason. **The regression cannot come back silently.**

### So the recommendation returns to §3, unchanged

| | Generate? |
|---|---|
| Paths and parameters | yes |
| Request bodies | yes |
| Success response types | yes |
| **Error bodies (`ProblemDetails`)** | **yes** — this is what version 2 said no to |

**The file is deleted, not shrunk.** `check-no-domain-types.mjs` retires or repoints with it
(Q-3). Nothing in the document now forces a hand-written residue.

### One narrow gap, offered rather than filed

The assertion skips a response whose `Content` is **empty**: `content is { Count: > 0 }`
guards it, and the `undeclared` check only catches operations with *no responses at all*. So
a `4xx` declared with zero content types passes both — and gives a generated client nothing
to type that failure as, which is the thing `028` would then hand-write around.

No such response exists today, or the run would have caught it. Raised as an observation for
the backend lane, not as a defect.
## 4 · Out of scope

| Excluded | Where |
|---|---|
| Serving the OpenAPI document | `002c`, ruled: it is generated and not served |
| A generated **client** (fetchers, hooks) | Types only. A generated client would replace `lib/api.ts`, which carries the auth, language and error contracts |
| Changing any contract | If a generated type disagrees with a hand-written one, **that disagreement is the finding**, not a licence to edit either side |

## 5 · The one thing this feature is actually for

`api-types.provisional.ts` was authorised on 2026-08-26 against ADR-011 §6, on the condition
that it stays one file and is **deleted** rather than edited. Six interfaces and four unions
now live in it, hand-transcribed from four frozen contracts.

**Every one of them is a claim that a human copied a contract correctly.** Two have already
been caught by their own comments: `Sms` is not `SMS`, and `WhatsApp` has a capital A — a
wrong character produces a `400` that reads as a backend bug while the frontend lane
investigates its own code.

This feature replaces ten transcriptions with a derivation. That is the whole point, and it
is why the file is deleted rather than kept "for reference".

## 6 · Open questions

| # | Question | Why it matters |
|---|---|---|
| Q-1 | Which generator — `openapi-typescript` (types only) or `orval`/`openapi-fetch` (types + client)? | §4 excludes a generated client, which points at types-only. Naming it is a dependency decision |
| Q-2 | Does generation run in CI, in a pre-commit hook, or as a checked-in artefact? | A checked-in artefact can drift; a CI-only step means a contract change is invisible locally until push |
| Q-3 | `check-no-domain-types.mjs` — retire or repoint? | It has fired twice in one session and both times was right. Deleting a working guard needs a reason |
| ~~Q-4~~ | ~~When is the OpenAPI media type corrected?~~ | **CLOSED 2026-08-30, `5dedb62`.** Fixed and asserted; verified here, 6 tests passed. Error bodies are generatable and the file is deleted rather than shrunk | — |
