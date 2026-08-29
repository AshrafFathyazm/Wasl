# `005-localization-core` — AI notes

No agent was dispatched. The expensive part was not writing the code — it was refusing to
guess about Q-G, and then noticing that a claim already written into the spec was false.

## Accepted after being run

| What | How it was verified |
|---|---|
| `.resx` side by side with the marker type, no `ResourcesPath` | Control 2 set `ResourcesPath = "Resources"` and eleven-plus tests went red across two features. The manifest name was also read out of the built assembly: `Wasl.Api.Common.Localization.SharedResource.resources`, plus an `ar` satellite |
| `LocalizedProblemMessageSource` reading `IRequestCultureFeature` rather than `CultureInfo.CurrentUICulture` | This is what makes exception-path **bodies** Arabic. `002` wrote the instruction and called it belt-and-braces; measuring shows it is load-bearing, because the localization middleware has already restored the ambient culture by the time the outermost handler runs |
| The provider list cleared before being rebuilt | AC-3 asserts three provider type names in order. Appending would have left `CookieRequestCultureProvider` second, outranking `Accept-Language` while appearing nowhere in BR-8.4 |
| `UseRequestLocalization()` between authentication and authorization | Control 1: seven tests red, every one on the `401`/`403` path, header `<null>` and title back to English |

## Rejected

| Suggested | Why not |
|---|---|
| A `LocalizationClaims` constant beside the provider | `004` already had `ActorClaimTypes.PreferredLanguage`. Two constants for one wire value is a defect waiting for one of them to change. Deleted the same day it was written |
| Fixing `Content-Language` on exception paths inside `GlobalExceptionHandler` | The cause is outside `005` (Q-G, ruled). It would have been a two-line change and an unreviewable feature |
| Making the seeded Manager prefer `en` so the old tests pass | Changing product data to make tests green. The tests were asserting English without asking for it; they now ask |
| Asserting English from an `Accept-Language: en` header | BR-8.4 ranks the claim above the header, so this would assert that the resolution order is broken. `?culture=en` is what BR-8.5 provides for exactly this |
| Splitting the catalogue per feature | The keys are already namespaced by prefix. Splitting means choosing a file for every new key and a parity test per pair |

## Three tools that misreported, and what each cost

**`ls */` piped through `head`** truncated the locale listing so `en` appeared to have three
namespaces and `ar` four — a parity divergence in the frontend catalogues that does not exist.
Caught by listing each directory separately before writing it down. Cost: nothing, because it
was checked. It would have been a fabricated defect report against another lane's work.

**PowerShell 5.1 as an editor.** `Get-Content -Raw` without `-Encoding` reads as ANSI, so a
`-replace` + `Set-Content` round trip **corrupted 25 lines of Arabic and em-dashes** across three
test files — while making the intended substitution correctly. `git diff --stat` said 136 lines
changed for what should have been 18. Reverted with `git checkout` and redone with `sed`: 18
lines, zero mojibake. This is the same family as `013`'s finding that PowerShell encodes a
request body as ASCII, and it is now two distinct ways the same shell has lied on this project.

**A docstring, which is the subtle one.**
`CatalogueParityTests.Every_shipped_key_resolves_in_both_cultures` says it is "the only assertion
that can tell a missing translation from a broken lookup". Control 2 broke the lookup and that
test stayed green. The sentence was written from intent, and nothing checked it until something
was broken on purpose — which is exactly what `CLAUDE.md` means by *a guard that has never been
seen to fail has not been verified*.

## The claim that was wrong, and how

`spec.md`'s reconciliation said **"Confirmed: `004` does not emit a language claim"**, citing
ADR-005's three-claim list. It was written in the same pass that corrected five other stale
assumptions, which is probably why it read as diligence.

Decoding a token from the running API:

```json
{"sub":"…","email":"manager@wasl.local","role":"Manager","preferred_language":"ar",…}
```

`004` shipped the column, the claim, and a constant for its name. The word *confirmed* was doing
work that no measurement had done. Corrected in `spec.md`, in the provider's remarks, and in the
test that mints tokens — all three, because the wrong version had already been copied twice.
