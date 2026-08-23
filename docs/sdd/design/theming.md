# Theming

How an organisation's brand colour flows through the interface. Reasoning is in
`decisions/ADR-012-tenant-theming.md`.

## The two sets of tokens

```text
BRAND — themeable                 FIXED — never themeable
  --brand                           --state-success-*
  --brand-hover                     --state-warning-*
  --brand-active                    --state-danger-*
  --brand-subtle                    --state-info-*
  --brand-border                    neutral ramp
  --brand-ring                      text, border, surface
  --on-brand   (computed)           every status and priority colour
  sidebar preset
```

**Status colour is meaning, not branding.** A tenant who could set "success" to red
would have a product that lies. Say this in the settings UI rather than only enforcing
it — otherwise the first question is why.

## Deriving the ramp

```css
:root {
  --brand: #1D174D;                                              /* from the tenant */
  --on-brand: #FFFFFF;                                           /* computed, see below */
  --brand-hover:  color-mix(in oklab, var(--brand) 88%, white);
  --brand-active: color-mix(in oklab, var(--brand) 82%, black);
  --brand-subtle: color-mix(in oklab, var(--brand)  8%, white);
  --brand-border: color-mix(in oklab, var(--brand) 24%, white);
  --brand-ring:   color-mix(in oklab, var(--brand) 22%, transparent);
}
```

`oklab`, not HSL. A fixed percentage in a perceptual space steps consistently across
every hue; the same percentage in HSL does not, which is why hand-tuned palettes exist.

## Computing the foreground

```ts
const srgb = (h: string) =>
  [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
           .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

const luminance = (h: string) => {
  const [r, g, b] = srgb(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

export const onBrand = (brand: string) =>
  ratio(brand, '#FFFFFF') >= ratio(brand, '#0D2626') ? '#FFFFFF' : '#0D2626';
```

**Validate at selection time.** If neither foreground reaches 4.5:1, reject the colour
and say why. Refusing a colour is better than rendering text nobody can read.

## Sidebar presets

Three, not a colour picker. A free colour on a 288px surface has to work against text,
icons, hover, and the active indicator all at once.

| Preset | Surface | Foreground | Notes |
|---|---|---|---|
| Light | `#FFFFFF` | `--Text-Primary` | Default; matches the house app |
| Dark | `#0D1420` | `#E8EBF0` | Muted and border derived from the foreground |
| Brand | `var(--brand)` | `var(--on-brand)` | Correct by construction for any brand colour |

In Brand mode, muted and border come from `color-mix(in oklab, var(--on-brand) N%,
transparent)` — so they track the computed foreground rather than being hard-coded for
a dark brand.

## Applying without a flash

Theme values arrive in the **bootstrap or auth response** and are written to `:root`
before first paint.

A separate fetch renders the default theme first and then snaps to the tenant's. That
flash happens on every load and is the first thing anyone notices.

```tsx
// index.html or a pre-render script, not a useEffect
const t = bootstrap.theme;
const r = document.documentElement.style;
r.setProperty('--brand', t.brand);
r.setProperty('--on-brand', onBrand(t.brand));
// sidebar preset variables
```

`useEffect` runs after paint. That is the flash.

## Testing

| Test | Asserts |
|---|---|
| Contrast, over a fixture of ~12 candidate colours including pale ones | Every computed `--on-brand` reaches 4.5:1 |
| Rejection | A colour failing both foregrounds is refused with a message |
| No leakage | No status or neutral token changes when the brand changes |
| No flash | The brand variable is set before first paint |
| Brand sidebar | Foreground, muted, and border remain legible for a light brand and a dark one |

The pale-colour fixture matters most. Theming fails for *some* tenants, not all — which
is precisely why it ships.

## Rule for anyone adding a component

If a component needs a brand colour, it uses `--brand` or a derived token. **If it needs
a status colour, it uses a fixed one.** Getting that backwards is the only way to break
theming from inside a component, and it is caught by the existing rule that components
consume semantic tokens only.
