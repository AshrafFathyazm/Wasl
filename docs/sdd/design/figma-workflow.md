# Figma Workflow

How design values get from Figma into this repository, and how they get refreshed.

## Before anything

Answer `11-open-questions.md` **Q-11** (permission) and **Q-12** (does an implemented
component library exist). Q-12 decides the framework — see ADR-009.

## Two routes

### Route A — the Figma MCP connector

If the Figma connector is available, the design file can be queried directly rather
than read by eye. The relevant tools and what each is for:

| Tool | Use |
|---|---|
| `search_design_system` | Find components, variables, and styles by name. The first call — it tells you what actually exists rather than what you assumed |
| `get_variable_defs` | Pull variable definitions for a node. **This is the token extraction step** |
| `get_libraries` | Which libraries a file depends on. Reveals whether tokens live in a shared library or locally |
| `get_design_context` | Structured design context for a node — the primary design-to-code call |
| `get_metadata` / `get_screenshot` | Structure and a visual reference for a frame |
| `download_assets` | Icons and images. Check Q-11 before pulling any logo |
| `get_code_connect_map` | Whether Figma components are already mapped to code — a direct answer to Q-12 |
| `add_code_connect_map` | Map a Figma component to the implementation, once one exists |

Suggested order:

```text
1. get_libraries          — where do the tokens live?
2. search_design_system   — what components and variables exist?
3. get_code_connect_map   — is there already an implementation? (answers Q-12)
4. get_variable_defs      — extract the tokens
5. get_design_context     — per primitive, for states and measurements
6. download_assets        — icons only, subject to Q-11
```

**Read tools before write tools.** Nothing in this workflow modifies the design file,
and nothing should — this repository consumes the design system, it does not maintain
it.

### Route B — manual extraction

Without connector access: open the file, read the variables panel, transcribe.

Slower and more error-prone, but the output is identical because the output is a token
file. If this is the route, transcribe the **variables panel**, not values sampled from
rendered frames — a sampled value is a rounded approximation of a token, and a set of
approximations is not a system.

## What lands in the repository

```text
src/wasl-web/src/styles/tokens.css      the extracted tokens, committed
design/design-tokens.md                what was extracted, and how it maps
design/component-inventory.md          the eight primitives and their states
```

Tokens are **committed**, not fetched at build time. A build must not depend on network
access or on the design file being in a particular state on a particular day.

## Refresh

A refresh re-runs the extraction and commits the diff.

Because the tokens are committed, the diff is visible in review before it ships. A
large diff is information — something changed upstream, and this is where you find out
rather than after a deploy.

Refresh on a real trigger: a brand change, or a component whose spec has moved. Not on
a schedule; there is no value in a weekly no-op diff.

## What not to do

| Don't | Because |
|---|---|
| Sample colours from a screenshot | You get a rounded approximation of a token, and a set of approximations is not a system |
| Copy CSS from Figma's inspect panel into a component | Produces absolute pixel values and hard-coded colours — the exact thing tokens exist to prevent |
| Pull an entire icon set | Take the icons the screens use. An icon set nobody imports is dead weight in the bundle |
| Copy a screen layout | ADR-009. Abyan has no support-queue screens, and a borrowed layout carries assumptions this CRM does not share |
| Fetch tokens at build time | A build that needs the design file to be reachable is a build that fails for reasons unrelated to the code |
| Invent a token that looks like it belongs | Worse than an obvious one-off, because it is indistinguishable from the real system until someone tries to change it upstream |

## Right-to-left

If the source system already encodes direction handling — which spacing is logical,
which icons mirror, how numerals are treated — **inherit those answers**. ADR-007
derives the same rules from first principles; a system that is already shipped and used
beats one that is reasoned.

Where the two disagree, the design system wins and ADR-007 is amended with a note
explaining what changed and why.
