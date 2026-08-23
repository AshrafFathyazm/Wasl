# Screen — Settings · Localization

**Route** `/settings/localization` · **Story** US-014 · **Agent, Manager**

## Layout

```text
‹ Back   Settings
┌────────────────┬────────────────────────────────────────┐
│ GENERAL        │  Localization                          │
│  Profile       │  How the interface is shown to you.    │
│ ▎Localization  │                                        │
│                │  ┌ Language ─────────────────────────┐ │
│                │  │ ( ) English                       │ │
│                │  │ (•) العربية                        │ │
│                │  └───────────────────────────────────┘ │
│                │  Preview: 24 August 2026 · 1,250       │
└────────────────┴────────────────────────────────────────┘
```

## Elements

| Region | Element | Component | Tokens | i18n key |
|---|---|---|---|---|
| Sub-nav | Section caption | — | `--type-caption` / 600 / uppercase | `settings:general` |
| Sub-nav | Item | — | active: 3px `--navy-900` bar inline-start + tinted row | `settings:nav.*` |
| Content | Section title | — | `--text-section-title` (Title 1, 22) | `settings:localization.title` |
| Content | Description | — | `--type-label-md` / `--Neutral-800` | `settings:localization.body` |
| Content | Language option | Radio row | h48, full-width hit area, 1px `--Neutral-200` between | — |
| Content | Language name | — | **written in its own language** — `English`, `العربية` — never translated | — |
| Content | Preview | Callout | `--surface-content`, shows a formatted date and number | `settings:localization.preview` |

Language names are not translated. Someone who cannot read the current interface must
still be able to find their own language — the same reasoning that puts the switcher on
the login screen.

## Actions

| # | Trigger | Request | Success | Failure |
|---|---|---|---|---|
| 1 | Select a language | `PUT /api/me/language` | Applies immediately — no Save button. `dir` and `lang` update, catalogue swaps, toast confirms | `400` unsupported → revert selection, message · `401` re-login |
| 2 | — | — | Choice persists across reload and across devices (BR-8.4) | If the request fails, the local change is **reverted**, not left inconsistent with the server |

No Save button: one setting with an instantly visible effect does not need a commit
step, and a Save button next to a change you can already see is confusing.

The token is not reissued. The client applies the change locally and the claim catches
up at the next token issue — forcing a reissue would need a refresh-token flow that
ADR-005 does not build.

## States

| State | Renders |
|---|---|
| Saving | The chosen row shows a small spinner; both rows non-interactive |
| Save failed | Selection reverts, error message above the group |
| Already this language | Row shows as selected; clicking it is a no-op, not a request |

## RTL

Sub-nav moves to the inline-end. The active bar follows via `inset-inline-start`. The
preview callout re-renders on switch, which is the point — the user sees the date and
number format change before committing to the language.

## Not on this screen

A third language · date-format override · timezone · number-format override · regional
variants (`ar-EG` falls back to `ar` — BR-8.2).
