# Design system — "Arena"

**Direction:** Apple-grade restraint as the base (calm surfaces, real typography, physical motion, translucent materials) with **Aceternity-style highlight effects** (spotlight, aurora, beams, glowing borders, 3D tilt) used only at a few hero moments. The result should feel like a premium Apple event keynote that happens to run on Ethereum.

The system is code-first: tokens live in `web/src/app/globals.css` (`@theme`), components in `web/src/components/ui/` and `web/src/components/fx/`, and everything is shown on the living page **`/system`**. Build the system (Task 3 in the plan) **before** any product page.

## 1. Principles
1. **Calm by default, spectacular on purpose.** At most **one ambient hero effect** (`components/fx/hero/*`: Spotlight, Aurora, BorderBeam) visible per screen. Transient celebrations (VoteBeam, Confetti) play only on their trigger. Small motion utilities (`components/fx/*`: NumberTicker, ListeningOrb, TiltCard) are not hero effects. Everything else is quiet.
2. **Response first.** Every pressable gives feedback on pointer-down (scale 0.97, ≤ 100 ms). Nothing waits for a network round-trip to acknowledge a tap — use optimistic states.
3. **Physical motion.** Springs, not durations, for anything a person touches. Critically damped by default; bounce only after a gesture that carried momentum (flick, drag release) or for a celebration.
4. **Interruptible.** No animation blocks input. Sheets can be grabbed mid-animation. Animate from current values (motion does this by default — never `set` to a start value before animating).
5. **Spatial consistency.** Things leave the way they came; popovers and sheets grow from their trigger (`transform-origin` at the trigger).
6. **Trust is designed.** On-chain facts (verified, confirmed, block number) get a consistent visual language: mono type + check glyph + "Details" disclosure.
7. **Plain words.** Never show "transaction", "gas", "nonce", "hash" in primary copy (see [product.md](product.md#copy-and-voice)).

## 2. Colour

OKLCH everywhere. Two themes: `light` and `dark`, following the system (`prefers-color-scheme`) with a manual toggle stored in `localStorage` (`arena:theme`). **The Stage page is always dark.** Theme switches cross-fade over 200 ms (no brightness jump).

### 2.1 Neutrals ("graphite")
| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `oklch(0.985 0.002 270)` | `oklch(0.145 0.006 270)` | Page |
| `--color-bg-elevated` | `oklch(1 0 0)` | `oklch(0.19 0.007 270)` | Cards, sheets |
| `--color-bg-sunken` | `oklch(0.96 0.003 270)` | `oklch(0.12 0.005 270)` | Inputs, wells |
| `--color-fg` | `oklch(0.2 0.01 270)` | `oklch(0.97 0.003 270)` | Primary text |
| `--color-fg-muted` | `oklch(0.47 0.012 270)` | `oklch(0.72 0.01 270)` | Secondary text (≥ 4.5:1 on bg) |
| `--color-fg-subtle` | `oklch(0.6 0.01 270)` | `oklch(0.58 0.01 270)` | Placeholder, disabled (large text only) |
| `--color-border` | `oklch(0.2 0.01 270 / 0.10)` | `oklch(1 0 0 / 0.10)` | Hairlines |
| `--color-border-strong` | `oklch(0.2 0.01 270 / 0.18)` | `oklch(1 0 0 / 0.18)` | Inputs, focusable outlines |

### 2.2 Brand and semantic
| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-accent` (Iris) | `oklch(0.55 0.22 280)` | `oklch(0.68 0.19 280)` | Primary actions, links, focus ring |
| `--color-accent-fg` | `oklch(0.99 0 0)` | `oklch(0.15 0.02 280)` | Text on accent |
| `--color-live` (Ember) | `oklch(0.64 0.21 32)` | `oklch(0.72 0.18 35)` | "Live", recording, beacon pulse |
| `--color-verified` | `oklch(0.6 0.16 155)` | `oklch(0.75 0.16 155)` | In the room ✓, confirmed |
| `--color-warning` | `oklch(0.75 0.16 75)` | `oklch(0.82 0.15 80)` | Clock skew, low gate balance |
| `--color-danger` | `oklch(0.58 0.22 25)` | `oklch(0.7 0.19 25)` | Errors, destructive |
| `--color-prize` | `oklch(0.8 0.15 85)` | `oklch(0.85 0.14 88)` | Prize amounts, winner |

Semantic colours above are **fills and icons** (dots, badges backgrounds, chart marks). For **text** in a semantic colour use the matching `-text` token, tuned darker in light theme / lighter in dark:
```
--color-live-text, --color-verified-text, --color-warning-text, --color-danger-text, --color-prize-text
light: same hue, lightness lowered until ≥ 4.5:1 on --color-bg (start at L 0.5)   dark: raised until ≥ 4.5:1 (start at L 0.8)
```
**Contrast rules (enforced by `contrast.test.ts`, which is the authority — tune lightness, keep hue, until it passes):**
| Pair | Minimum |
|---|---|
| `fg`, `fg-muted` on `bg`, `bg-elevated`, `bg-sunken` | 4.5 |
| every `*-text` token on `bg` and `bg-elevated` | 4.5 |
| `accent-fg` on `accent` | 4.5 |
| `accent`, `danger`, `verified`, `border-strong` on `bg` (UI parts) | 3.0 |
| every `entry-*` colour on `bg` and `bg-elevated` (chart marks) | 3.0 |
| `fg-subtle` | exempt (placeholder/disabled, large text only) |
`/system` shows each pair with its measured ratio (OKLCH → sRGB → WCAG contrast helper shared with the test; fail = red badge).

### 2.3 Entry palette (results)
Eight distinct hues tuned for equal lightness so no entry looks "more important", checked for common colour-vision deficiencies. Values below are the **dark-theme** starting points; light theme uses the same hues at lower lightness (start at L 0.58) — the contrast test decides final values.

**Colour assignment:** with ≤ 8 live entries, colours are **stable by entry id order** (entry with the lowest id = entry-1) so an entry never changes colour. With > 8 live entries, the hemicycle shows the **top 7 by current votes** in entry-1…7 (sticky: an entry keeps its colour while it stays in the top 7) and groups the rest as "Others" (`--color-entry-other`); the ranked list still shows every entry.
```
--color-entry-1: oklch(0.68 0.17 280);  /* iris   */
--color-entry-2: oklch(0.72 0.16 35);   /* ember  */
--color-entry-3: oklch(0.72 0.14 155);  /* mint   */
--color-entry-4: oklch(0.78 0.14 85);   /* gold   */
--color-entry-5: oklch(0.68 0.15 220);  /* sky    */
--color-entry-6: oklch(0.68 0.18 330);  /* orchid */
--color-entry-7: oklch(0.74 0.12 120);  /* lime   */
--color-entry-8: oklch(0.66 0.12 250);  /* steel  */
--color-entry-other: oklch(0.6 0.01 270);
```
Colour is never the only signal: the ranked list shows names and numbers, and hovering or tapping a seat highlights its entry.

## 3. Typography
Fonts from the `geist` package: **Geist Sans** (UI + display) and **Geist Mono** (addresses, hashes, numbers in tables). Fallback `system-ui, -apple-system, sans-serif` and `ui-monospace`. Enable `font-variant-numeric: tabular-nums` on all changing numbers.

Size-specific tracking and leading — never one letter-spacing for every size:
| Token | Size (rem / px) | Line height | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `display-xl` | `clamp(3rem, 7vw, 5.5rem)` | 1.0 | -0.035em | 650 | Landing hero, winner reveal |
| `display` | `clamp(2.25rem, 4.5vw, 3.5rem)` | 1.05 | -0.03em | 650 | Page titles |
| `title-1` | 1.75 / 28 | 1.15 | -0.02em | 600 | Section titles |
| `title-2` | 1.375 / 22 | 1.2 | -0.015em | 600 | Card titles, sheet titles |
| `title-3` | 1.125 / 18 | 1.3 | -0.01em | 600 | List headers |
| `body` | 1 / 16 | 1.5 | 0 | 400 | Body |
| `callout` | 0.9375 / 15 | 1.45 | 0 | 450 | Buttons, inputs |
| `footnote` | 0.8125 / 13 | 1.4 | 0.005em | 450 | Captions, meta |
| `caption` | 0.75 / 12 | 1.35 | 0.01em | 500 | Badges, labels (uppercase only with +0.06em) |
| `mono` | 0.8125 / 13 | 1.4 | 0 | 450 | Addresses, hashes |
| `numeric-xl` | `clamp(3rem, 8vw, 7rem)` | 1.0 | -0.04em | 600 | Stage counters, prize |

Implement as Tailwind utilities via `@utility text-display { … }` (one per token) so size, leading, tracking and weight always travel together. Spacing uses `rem` so a larger browser text size scales the layout.

## 4. Space, radius, layout
- **Spacing scale (4 pt base):** Tailwind's default `--spacing: 0.25rem` — use the scale, no arbitrary values (`p-[13px]` is a lint smell).
- **Radii:** `--radius-xs 6px` (chips), `--radius-sm 10px` (inputs, buttons), `--radius-md 14px` (cards), `--radius-lg 22px` (sheets, modals), `--radius-xl 32px` (hero panels), `--radius-full`. Use continuous corners where supported: `@supports (corner-shape: squircle) { .squircle { corner-shape: squircle; } }` on cards and sheets.
- **Layout:** max content width 1200 px; gallery grid `repeat(auto-fill, minmax(280px, 1fr))`, gap 16 px (phone) / 24 px (desktop). Breakpoints: Tailwind defaults; design and test at **390 px** and **1440 px**, check 768 px.
- **Touch targets:** ≥ 44 × 44 px. Primary action on phone sits in a bottom bar within thumb reach, above the home indicator (`env(safe-area-inset-bottom)`).

## 5. Materials and depth
| Material | Recipe | Use |
|---|---|---|
| `glass-thin` | `bg: color-mix(in oklch, var(--color-bg-elevated) 55%, transparent); backdrop-filter: blur(12px) saturate(170%)` | Chips over content, presence chip |
| `glass` | 70%, `blur(20px) saturate(180%)` | Nav bar, bottom action bar |
| `glass-thick` | 82%, `blur(32px) saturate(190%)` + `shadow-lg` | Sheets, Connect sheet, popovers |
| `solid` | `--color-bg-elevated` + `--color-border` hairline | Cards, forms |

Rules: never stack glass on glass; bigger surface = thicker material and deeper shadow; a 1 px top highlight (`inset 0 1px 0 oklch(1 0 0 / 0.08)` in dark, `/0.6` in light) makes glass read as a material. Sticky headers use a **scroll-edge fade** (mask gradient) instead of a border, and only when content is underneath.

Shadows (light theme; in dark use the same offsets at 1.5× opacity plus the top highlight):
```
--shadow-sm: 0 1px 2px oklch(0.2 0.01 270 / 0.06), 0 1px 1px oklch(0.2 0.01 270 / 0.04);
--shadow-md: 0 4px 12px oklch(0.2 0.01 270 / 0.08), 0 1px 3px oklch(0.2 0.01 270 / 0.06);
--shadow-lg: 0 16px 40px oklch(0.2 0.01 270 / 0.14), 0 4px 12px oklch(0.2 0.01 270 / 0.08);
```
Modal tasks (Connect sheet, Vote confirm) dim the page (`oklch(0 0 0 / 0.4)` scrim) and scale it to 0.98. Non-blocking panels (Gate history) don't dim.

Accessibility media queries are part of the material: `prefers-reduced-transparency: reduce` → materials become solid; `prefers-contrast: more` → solid + `--color-border-strong` borders.

## 6. Motion (motion.dev)
Import from `motion/react`. Wrap the app in `<MotionConfig reducedMotion="user">`. Tokens live in `web/src/lib/motion.ts`:
```ts
export const spring = {
  snappy:  { type: "spring", visualDuration: 0.25, bounce: 0 },    // press, toggles, chips
  smooth:  { type: "spring", visualDuration: 0.4,  bounce: 0 },    // layout, cards, page elements (default)
  sheet:   { type: "spring", visualDuration: 0.35, bounce: 0.15 }, // sheets/drawers after a drag release
  flick:   { type: "spring", visualDuration: 0.4,  bounce: 0.2 },  // released with momentum only
  celebrate: { type: "spring", visualDuration: 0.6, bounce: 0.35 } // winner, vote confirmed seat pop
} as const;
export const fade = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } as const; // opacity-only and reduced-motion
export const stagger = 0.04; // list reveals, max 8 items staggered, rest appear together
```
Rules:
- Animate only `transform` and `opacity` (plus `filter: blur` for materialising glass). No layout-thrashing properties.
- **Press:** `whileTap={{ scale: 0.97 }}` with `spring.snappy`.
- **Sheets:** draggable (`drag="y"`), 1:1 tracking with pointer capture, rubber-band past the top, dismiss decided by **velocity sign + projected position** (`current + (v/1000) * 0.998 / (1 - 0.998)`), hand release velocity to the spring.
- **Materialise:** glass surfaces enter with `opacity 0 → 1`, `scale 0.96 → 1`, `filter: blur(8px) → blur(0)`.
- **Numbers:** vote counts and prize use `NumberTicker` (spring on the value, tabular nums).
- **Reduced motion:** springs become `fade`; no parallax, no tilt, no aurora movement, no confetti (show a static "Winner" badge instead); seats appear without the beam.
- Haptics: `navigator.vibrate?.(10)` on vote confirmed and on Gate success, same frame as the visual. Skip where unsupported.

## 7. Effects library — the Aceternity layer
Ambient hero effects live in `components/fx/hero/` (Spotlight, Aurora, BorderBeam); transient ones in `components/fx/hero/` too (VoteBeam, Confetti); utilities in `components/fx/` (TiltCard, NumberTicker, ListeningOrb). `BentoGrid` is layout and lives in `components/ui/`.
Built in-house, **inspired by** Aceternity UI patterns (don't copy their source). Each effect has a reduced-motion fallback and a performance budget (60 fps on a 2020 mid-range Android; pause when off-screen via `IntersectionObserver`; pause when `document.hidden`).

| Effect | Where it's allowed | Spec |
|---|---|---|
| `Spotlight` | Landing hero | Radial gradient that follows the pointer (desktop) with `spring.smooth`; static on touch |
| `Aurora` | Landing hero background, Stage **before voting opens** (replaced by BorderBeam while live — never both) | 3 blurred OKLCH blobs (accent, live, entry-5) drifting slowly (one cycle ≥ 20 s, never near 5 s); opacity ≤ 0.35 |
| `BorderBeam` | The single "live now" card, Stage frame | A light travelling around the border (conic gradient mask), 6 s per lap |
| `TiltCard` | Entry gallery (desktop pointer only) | Max 8° rotate, perspective 1000 px, specular highlight follows pointer; off on touch and reduced motion |
| `VoteBeam` | Contest page after vote confirms | A glowing line from the tapped card to the new seat in the hemicycle, 600 ms, then seat `celebrate` pop |
| `NumberTicker` | Counters everywhere | Spring-driven value, digits don't jitter (tabular) |
| `Confetti` | Winner reveal only | Canvas, 120 particles in entry colours, 1.8 s, once |
| `BentoGrid` | `/manage` dashboard, landing "how it works" | Layout only, no motion beyond hover lift |
| `ListeningOrb` | Presence chip | Small orb that breathes while listening, ripples on token received, turns `--color-verified` |

## 8. Components (`components/ui/`)
Each component ships with: all states (default, hover, pressed, focus-visible, disabled, loading, error), light + dark, phone + desktop, keyboard support, and a `/system` demo. Use `cn()` (clsx + tailwind-merge). Prefer native elements (`button`, `dialog`, `input`) for free accessibility.

| Component | Notes |
|---|---|
| `Button` | Variants `primary` (accent), `secondary` (glass), `ghost`, `danger`; sizes `sm 32px`, `md 40px`, `lg 48px`; `loading` shows a spinner and keeps width |
| `TxButton` | Wraps `Button` for writes. States: `connect` → `wrong-network` ("Switch to Sepolia") → `ready` → `confirm-in-wallet` → `pending` (with Details link) → `confirmed` ✓ → `error` (plain message + Try again). Never disabled without saying why |
| `Sheet` | Bottom sheet on phone, centred dialog ≥ 768 px; draggable, focus-trapped, `Esc` closes, returns focus to trigger |
| `ConnectSheet` | Wallet list from EIP-6963 discovery (icon + name), WalletConnect (our QR on desktop, deep link on phone), "Create a wallet with Face ID" (Base Account), short "What's a wallet?" disclosure |
| `Input`, `Textarea`, `Field` | Label above, helper below, inline validation on blur, counter for byte limits |
| `DateTimeField` | Native `datetime-local` + presets chips; shows the timezone |
| `SegmentedControl` | Presence mode, tabs; sliding indicator with `layoutId` |
| `Toggle`, `Checkbox`, `Radio` | Native inputs, custom visuals |
| `Badge`, `StatusPill` | `live` (Ember dot pulse), `upcoming`, `ended`, `verified` |
| `Countdown` | `useNow` tick, tabular nums, switches to "Ended" with a cross-fade |
| `AddressChip` | Avatar (deterministic gradient from address), short address (`0x12…abcd`, mono), copy, Etherscan link |
| `Card`, `EntryCard` | Image (aspect 4:3, blur-up), name, tagline, vote count; `TiltCard` on desktop |
| `Hemicycle` | See §9 |
| `RankedList` | Rank, colour dot, name, count, % bar; layout animation when ranks change |
| `PresenceChip` | `idle` → `listening` (ListeningOrb) → `in-room` ✓ → `stale` → `mic-denied` (offer QR scan) |
| `QRCode`, `QRScanner` | Render (qrcode.react) / scan (BarcodeDetector → @zxing/browser) |
| `Toast` | Bottom on phone, top-right on desktop; status, success, warning, error |
| `EmptyState`, `ErrorState`, `Skeleton` | Every list and page has all three |
| `ThemeToggle` | Light / Dark / System |

## 9. Hemicycle (signature visual)
A parliament-style half circle where **every seat is one vote**.
- **Layout:** for `n` seats choose rows `r = clamp(ceil(sqrt(n / 4)), 1, 14)`. Row `i` (0 = inner) has radius `R_i = R0 + i * gap` and seat count proportional to its arc length; distribute seats so the sum equals `n`; place seats at equal angles from 180° to 0°. Seats are sorted **by entry rank, left → right across all rows by angle**, so each entry forms a wedge.
- **Scale:** `perSeat = n <= 600 ? 1 : ceil(n / 600)`; `seats = ceil(n / perSeat)` per entry group (round each group up, so every entry with ≥ 1 vote gets ≥ 1 seat); caption "1 seat = N votes" when `perSeat > 1`.
- **Colour:** per the assignment rule in §2.3. When ranks change, seats glide to new positions (`layout` spring.smooth) — with reduced motion they cross-fade.
- **New vote:** seat appears with `spring.celebrate` scale 0 → 1 (+ `VoteBeam` for your own vote).
- **Empty (n = 0):** a separate placeholder state — faint outline of 100 seats + "No votes yet" (not counted as seats).
- **Accessibility:** `role="img"` with an `aria-label` summary ("Results: Project A 12 votes, Project B 9…") plus the `RankedList` as the accessible table.
- The "Others" wedge (entry id 0 in `hemicycle.ts`) always sits last, whatever its votes. Ties in rank and in top-7 selection break by entry id ascending.
- Implement as SVG (`<circle>` per seat) — fine up to 600 nodes; memoise seat geometry by `n`.

## 10. Iconography and imagery
- `lucide-react`, stroke 1.75, sizes 16/20/24, always paired with text for primary actions.
- Entry images 4:3, `object-cover`, blur-up placeholder (dominant colour from metadata or neutral).
- Default cover for contests without an image: generated gradient mesh from the contest id (deterministic).

## 11. Accessibility checklist (blocking)
- AA contrast for every pair (auto-checked on `/system`).
- Visible focus: 2 px `--color-accent` ring with 2 px offset, never removed.
- Keyboard: every flow completes without a mouse; sheets trap focus; `Esc` closes.
- Screen readers: live regions for vote confirmations and presence status (`aria-live="polite"`).
- Reduced motion / transparency / contrast media queries honoured (see §5, §6).
- Text zoom to 200% doesn't break layouts.
- Mic and camera prompts are preceded by a plain-language explainer and never auto-triggered.

## 12. `/system` page contents
Colour swatches with contrast ratios (both themes), type scale specimen, spacing/radius ruler, materials over a busy image, shadows, motion playground (each spring token with a replay button), every `ui/` component in every state, every `fx/` effect with an on/off toggle and a "reduced motion" preview switch, Hemicycle with a slider for 0–800 votes and an "add vote" button.
