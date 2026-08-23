# Figma Extraction Plan

Calls against the Figma MCP are **rate limited on a View seat**, so they are a scarce
resource. This is the order to spend them in, and what to do when one fails.

## `get_variable_defs` is not something you click in Figma

It is a tool on the Figma **MCP server**, not a menu item. Two servers exist and they
are not equivalent:

| | Remote — `https://mcp.figma.com/mcp` | Local desktop — `http://127.0.0.1:3845/mcp` |
|---|---|---|
| Setup | None | Figma desktop app → Dev Mode (`Shift+D`) → **Enable desktop MCP server** in the inspect panel |
| Input | A node link | The current **canvas selection** |
| `get_variable_defs` | Not available | Available |
| Seat required | Lower | **Dev or Full seat on a paid plan** |

So the tool lives only on the local server, and the local server needs Dev Mode.

## Why it is currently unavailable here, and what to do instead

Three signals line up and they all say the same thing:

1. The call returned `You currently have nothing selected` — that is the **local**
   server reading the canvas.
2. The next call returned `You've reached the Figma MCP tool call limit for your
   **View seat** on the Professional plan`.
3. The Figma Properties panel shows **Dev Mode as "Request access"**.

A View seat cannot enable Dev Mode, and without Dev Mode the local server cannot be
enabled. `get_variable_defs` is therefore out of reach until the seat changes. That is a
plan and billing question, not something to work around in tooling.

**And it does not need working around.** The layer inspect panel already shows variable
data — that is exactly where `Text/Primary = #0D2626` and `Neutral/800 = #606873` came
from. The MCP tool would return the same values faster; it returns nothing the panel
does not already show.

## Harvesting the palette by hand

Select a layer, read the **Colors** section of the right panel, record the token name
and hex. Roughly fifteen clicks covers the whole system, because a design system reuses
the same tokens everywhere.

Click these, in this order — each one is chosen to surface a token the others will not:

| # | Select | Tokens it should reveal |
|---|---|---|
| 1 | Page background, empty area | Surface / page |
| 2 | A card or panel | Surface / card, plus its border |
| 3 | A divider line | Border / default |
| 4 | Primary button — fill, then its label | Action / primary, and the text on it |
| 5 | Secondary button — fill, border, label | The secondary triple |
| 6 | A **disabled** button | The disabled tokens, which are the ones nobody records |
| 7 | An "Approved" badge — fill, then text | Success pair |
| 8 | An "In progress" badge — fill, then text | Warning pair |
| 9 | A "Rejected" badge — fill, then text | Danger pair |
| 10 | A link, or a blue "View details" | Info / link |
| 11 | Table header cell — fill and text | Surface / subtle, Text / secondary |
| 12 | Placeholder text in an empty input | Text / placeholder |
| 13 | An input border, then a **focused** input border | Border default and focus |
| 14 | Active sidebar item — bar and label | The active-nav tokens |
| 15 | A muted timestamp or helper line | Text / muted |

Six, thirteen, and the second half of each badge pair are the ones usually skipped, and
they are the ones whose absence shows up later as an invented value.

Send the token names and hex values and they go into `design/tokens.css` under their
real names.

## Styles and Variables are different panels

Worth being explicit, because it changes which panel to open.

- **Styles** — the older system. Text styles, colour styles, effect styles. This is
  where the type scale was found.
- **Variables** — the newer system. Collections of named values with modes, which is
  what supports light/dark and locale switching. **This is what `get_variable_defs`
  reads**, and it is a separate panel from Styles.

The type scale came out of Styles. The colour system was *not* in Styles in any usable
form, which makes the Variables panel the next place to look. If it is empty too, then
the colour system genuinely does not exist as tokens yet — and the values in
`design/tokens.css` extracted from the vector export are the best record of it that
exists.

## If a Dev or Full seat becomes available

Then the calls are worth spending, in this order. The rule: **each call should target
the largest node that still returns.** A call on a page-level frame returns far more
than a call on a button, and both cost the same.

| # | Call | Target | What it answers |
|---|---|---|---|
| 1 | `get_variable_defs` | The **design-system / tokens page**, not a screen | The whole variable collection in one call: colours, type scale, spacing, radii. This is the single highest-value call available and it closes Q-13 |
| 2 | `get_variable_defs` | The **login frame** | Typography and spacing actually applied on a real screen — confirms which tokens are live rather than merely defined |
| 3 | `get_design_context` | The **login frame** | Reference code plus a screenshot. Reference only — it is adapted, never pasted |
| 4 | `search_design_system` | query `Button` | Whether a component library exists and whether Code Connect is wired |
| 5 | `download_assets` | The logo and the login panel artwork | Only after Q-11 is settled |

Stop after 1 and 2 if the budget is tight. Those two close the typography and spacing
gaps, which are the only things currently blocking the token set.

## What each call must produce

Whatever comes back is transcribed into `design/tokens.css`, with the source labelled —
`(A)` Figma export, `(B)` shipped app, `(C)` Figma variables. A token whose provenance
is unrecorded gets "corrected" later by whoever compares it against a different source.

## If the calls stay blocked

The manual route produces the identical output, because the output is a token file:

1. Open the file in Figma desktop.
2. Local variables panel → read the collections directly.
3. Text styles panel → family, size, weight, line height, and the Arabic face.
4. Transcribe into `design/tokens.css`.

Slower, and not worse. Transcribe from the **variables and styles panels**, never from
values sampled off a rendered frame — a sampled value is a rounded approximation of a
token, and a set of approximations is not a system.

## Do not fill the gap

Until the numbers are in hand, `design/tokens.css` keeps its labelled placeholders. An
invented font or spacing scale looks deliberate and is wrong in a way nobody catches —
which is worse than an obvious blank.
