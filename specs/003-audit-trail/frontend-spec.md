# 003 — Frontend Spec

**There is no UI in this feature.** No screen, no route, no component, no i18n key.

`003` is the `AuditLog` table and the pipeline behaviours that make BR-9 structural. Nothing
it produces is visible to a user, and nothing already visible changes.

| Surface | Owned by |
|---|---|
| Every screen that reads the audit log — the list, its filters by entity / actor / time range / outcome, the `Manager`-only route guard | **`019-audit-log-access`** (US-015) |
| The React application itself, the tokens, and the eight primitives | `006-design-system` |

Two consequences worth stating rather than leaving to inference:

- **No i18n keys are added here.** Audit content is always English (BR-9.10, BR-8.9) and it
  is never rendered by this feature, so there is nothing to translate and nothing for the
  key-parity test (BR-8.11) to check. When `019` renders these rows, `Action`, `Outcome`,
  and the `field` names inside `Changes` are identifiers — the *display labels* for them are
  client-authored keys (BR-8.8), and the stored values stay untranslated.
- **No Arabic pass is due.** The Definition of Done requires every screen *touched* to be
  viewed in Arabic; this feature touches none. Recorded so the empty checkbox is visibly a
  decision rather than a skipped gate.
