# Handoff: New tab v2 layouts + first-run onboarding dialog

> Vendored verbatim from the Blanc Browser Design System project
> (`design_handoff_newtab_onboarding/README.md`, projectId
> `bee811df-e403-446a-9c63-078528dedf2c`) on 2026-08-16 so the spec and plan
> can cite it offline. The companion prototype is `NewtabOnboarding.dc.html`
> in this directory. Do not edit — push changes to the DS instead.

## Overview
Two features for the Blanc browser (Electron, vanilla JS renderer in `src/renderer/`):
1. **New tab layouts** — the `blanc://newtab` page gains three alternative layouts beside the shipped ledger (billboard / shelf / tally), user-selectable and persisted as a setting.
2. **First-run onboarding** — a 5-step centered dialog shown over the new tab page on first launch: default browser → import → meet the island → Blanc Blocker → theme pick.

## About the Design Files
The files in this bundle are **design references created in HTML** (Design Component prototypes) — they show intended look and behavior, not production code to copy. Recreate them in the browser's existing renderer environment (`src/renderer/` vanilla JS + CSS, per-page HTML under `src/renderer/pages/`) using its established patterns: CSS custom-property tokens, `[data-theme]` scopes, the shared icon glyph set, and the existing newtab page as the base.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, copy, and interaction states are final and use the shipped token names verbatim. Recreate pixel-perfectly; every color below is a token reference, never a literal (the sole literals are in the theme-pick preview cards, which intentionally depict both themes at once).

## Screens / Views

### 1 · New tab — shared frame (all layouts)
- Resting island pill floats top-center (existing chrome; unchanged).
- Footer, absolute bottom 24px, inset 48px left/right, flex space-between, opacity .8, all `--font-mono` 11.5px `--text-dim`:
  - left: `{n} ads blocked this week` (n = live weekly count, `toLocaleString`)
  - center: layout switcher — `layout: ledger · billboard · shelf · tally`; active layout `--text`, others `--text-dim`; click switches instantly (design intent: this control may instead live in Settings — footer placement is how the prototype demonstrates it; product call for code)
  - right: `⌘L to go anywhere` (⌘ glyph in `--font-kbd`)
- Page background `--bg`; all layouts re-ink under `[data-theme="light"|"dark"]` with no layout-specific colors.

### 2 · Layout "ledger" (shipped today — unchanged reference)
Centered 760px column, padding 110px 48px 96px: mono date line (12px, `--text-dim`, tracking .08em) · "Where to?" 28px/600 tracking -0.015em · `favorites` mono section label (11px, tracking .12em, 52px above) · favorite rows (16px favicon in 2px-radius tile, 14.5px title, mono 11.5px domain, gap 12, row gap 14) · `pick up where you left off` label · group rows (3-dot cluster 6px `--text-dim`, mono 13px name, mono 11.5px dim count).

### 3 · Layout "billboard"
Everything centered in the viewport, column flex:
- mono date, 12px `--text-dim`, letter-spacing .18em
- **Clock**: `--font-mono` 148px/700, letter-spacing -.04em, line-height 1, `font-variant-numeric: tabular-nums`; formatted with `toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit"})` — 12h locales show a lowercase meridiem (`pm`) as a separate 24px mono `--text-dim` span, baseline-aligned, gap 14px; 24h locales show none. Ticks live (update per minute).
- mono 12.5px `--text-dim` line: `{n} ads blocked this week · nothing followed you home`, 20px below
- Favorites: horizontal row, gap 36px, 64px below — each favorite is a 32px favicon in a 6px-radius tile over a mono 11.5px `--text-dim` short label, column-stacked, gap 10px
- Groups: pill chips (1px `--border`, radius 999px, padding 7px 16px), dot cluster + mono 12.5px name, gap 14px, 38px below

### 4 · Layout "shelf"
Content block inset 110px left/right, top 120px:
- Header row: "Where to?" 28px/600 left, mono date right, baseline-aligned
- Favorites: 4-column grid, gap 14px, 30px below. Tile = 1px `--border`, radius 6px, padding 18px 16px 14px, column flex gap 14px: 28px favicon in 6px-radius tile, then 13.5px title + mono 11px `--text-dim` domain (3px gap). Hover: border-color → `--text-dim`.
- Second row: 2-column grid, gap 14px. Left card: `pick up where you left off` mono label + group pill chips (as billboard, plus mono 11px dim count). Right card: `blocked` mono label + count numeral `--font-mono` 34px `--accent` tabular-nums + mono 11px dim `ads this week`, baseline gap 10px.

### 5 · Layout "tally"
Two absolute columns, top 120px:
- Left (width 460px, left 110px): the ledger column verbatim (date, Where to?, favorites, groups as chips).
- Right (width 280px, right 110px): `blocked this week` mono label · count `--font-mono` 64px/700 tracking -.03em tabular-nums, 14px below · **week bar chart**, 26px below: 7 bars, flex align-end, gap 8px, height 110px, container bottom border 1px `--border`; past-day bars `--accent-dim` fill with 1px `--border` stroke (no bottom border), today 100% height solid `--accent`; day initials row beneath (mono 10px `--text-dim`, centered per bar, 8px above) — labels rotate so today is last · two-line mono 11.5px dim caption 20px below (`busiest day friday.` / `nothing followed you home.`). Bar heights = real per-day blocked counts normalized to the max day.

### 6 · Onboarding dialog
Over any layout: full-viewport scrim `rgba(0,0,0,0.4)`, dialog centered, width 460px, `--surface-raised`, 1px `--border`, radius 10px, `--shadow-popover`.
- **Header row** (padding 18px 24px 0): mono 11px `--text-dim` tracking .12em step label `{i} / 5 — {name}` (names: default browser · import · the island · ad blocking · theme); right: `skip setup` mono 11px `--text-dim`, hover `--text`, dismisses.
- **Content area**: padding 2px 24px 0, min-height 264px.
- **Footer** (padding 16px 24px 20px, top border 1px `--border`, 18px above): Back button left (hidden on step 1 via `visibility`), 5 step dots center (6px, active `--accent`, rest `--border`, gap 7px), primary button right. Buttons: 12px `--font-ui`, padding 7px 14px, radius 6px; secondary = 1px `--border` on `--surface-raised`, hover border `--text-dim`; primary = `--accent` fill, `--surface-raised` text. Primary reads `Continue`, on step 5 `Start browsing` (dismisses).

Steps (each: h1 20px/600, body 13px `--text-dim` line-height 1.55, 10px below h1):
1. **Make Blanc your default** — "Links from other apps open here. You can change this anytime in Settings." Vignette: app row — four 44px hairline tiles (radius 10px, 1px `--border`, 20px stroke glyphs in `--text-dim`: globe, compass, mail window, network) with a 52px accent-filled tile (radius 12px, `--shadow-pill`) center carrying the blanc master mark in `--surface-raised`. CTA `Set as default` (primary); after click becomes disabled-looking secondary reading `Blanc is your default` (calls the OS default-browser API).
2. **Bring your bookmarks & passwords** — "Imports happen on this device — nothing is uploaded." Vignette: heart tile + key tile (40px hairline, `--text-dim`) → 20px arrow glyph → 48px accent blanc tile. Source list: bordered rounded-6px list, rows padding 9px 12px, 13px, 1px `--border` separators; radio = 14px hairline circle with 6px `--accent` dot when selected; selected row bg `--accent-dim`; hover `--accent-dim`. Sources: Chrome (default) · Safari · Firefox · Edge.
3. **Meet the island** — "Everything lives in one floating pill — address, tabs, commands. Press ⌘L to summon it anywhere, type / for commands." (⌘L in `--font-kbd`.) Center: mini resting pill (dots + mono domain, `--surface`, `--shadow-pill`). Below, centered mono 11px `--text-dim`: `/history · /clear · /group · /theme`.
4. **Block ads & trackers** — "Pages load faster and nothing follows you around. Turn it off per-site with /off-leash." Vignette: the **Blanc Blocker** glyph, 44px, `--accent`, stroke 1.4 — the exact `shield` glyph from the icon set (silhouette + edge-to-edge brand diagonal `M4.4 11.47 12.61 3.55`; never a generic check-shield) — flanked left by three 7px dashed hollow dots fading in opacity (.35/.55/.8, `--text-dim`) and right by three solid `--accent` dots fading out (1/.65/.35). Control: bordered row (1px `--border`, radius 6px, padding 12px 14px), label 13px + the standard 36×20 toggle (999px track, `--accent` when on, 16px knob, 140ms slide). Default ON.
5. **Pick your ink** — "Paper by day, ink by night. Change anytime with /theme." Two theme cards, flex gap 10px: each radius 6px, 1px border (`--accent` when selected, else `--border`); preview area 64px tall depicting the theme with literal colors (light: `#ffffff` bg, `#dedede` hairline, pill outline; dark: `#0e0e0e` bg, `#2e2e2e` hairline, `#1f1f1f` pill); caption row mono 11px `--text-dim` with name left and `●` mark right when selected. Picking re-inks the whole app instantly (sets `[data-theme]`).

## Interactions & Behavior
- Layout switch: instant, no transition; persists (settings storage) and syncs to the Settings page (add a "New tab layout" select there).
- Onboarding shows once on first run (`onboardingComplete` flag); `skip setup` and `Start browsing` both set it. Re-runnable from Settings (design intent).
- Step navigation: Continue/Back, no wrap; dialog is not dismissible by scrim click (deliberate — skip is explicit).
- Theme pick applies live during the flow (step 5), not on finish.
- Set-as-default click: fires OS prompt, then button flips to confirmed state (secondary style, `Blanc is your default`).
- Toggle: 140ms ease slide (shipped Toggle spec). Hover states per system: bg fills `--accent-dim`/`--surface-raised`, text `--text-dim`→`--text`, buttons brighten border to `--text-dim`. No scale/translate anywhere.
- Clock updates per minute; date line per day. Respect `prefers-reduced-motion` (no new motion beyond the toggle/hover fades anyway).

## State Management
- `newtabLayout: "ledger" | "billboard" | "shelf" | "tally"` — persisted setting, default `ledger`.
- `onboarding: { step: 0–4, done, defaultSet, importFrom, adblock, theme }` — `done` persisted; the rest transient per run.
- Data feeds: weekly + per-day blocked counts (already tracked by the blocker), favorites list, tab-group names/counts, synced-device tabs.

## Design Tokens
All from `src/renderer/styles.css` / DS `tokens/`: `--bg --surface --surface-raised --border --text --text-dim --accent --accent-dim --shadow-pill --shadow-popover --font-ui --font-mono --font-kbd`. Radii: 6px standard, 10px dialog, 999px pills/chips. Type sizes as listed inline above. No gradients, no blur, no imagery; the scrim (`rgba(0,0,0,0.4)`) is the only translucent black.

## Assets
- Blanc master mark: `assets/blanc-symbol.svg` (used in vignette tiles — render the provided asset, never redraw).
- Blanc Blocker glyph: `shield` in `components/icons/Icon.jsx` (already in the renderer's glyph set).
- Favicons: real site favicons via the browser's own favicon cache (the prototype stubs them with Google's favicon service).
- Vignette glyphs (globe, compass, mail, network, heart, key, arrow): 16px-grid 1.5px rounded strokes, `currentColor` — add to the shared glyph set if missing.

## Screenshots
`screenshots/` — the five dialog steps (`onboarding-step1…5`) and the four layouts (`newtab-ledger/billboard/shelf/tally`), captured from the prototype in dark mode. Note: favicon images render blank in these captures (cross-origin capture limitation) — in the prototype and product they are real site favicons.

## Files
- `NewtabOnboarding.dc.html` — the full prototype: all four layouts, footer switcher, 5-step dialog (template markup + logic class in one file).
- `New Tab v2.html` — the exploration canvas the three new layouts came from (2a billboard · 2b shelf · 2c tally), static.
- Reference in the codebase: shipped newtab (`src/renderer/pages/`), token sheet (`src/renderer/styles.css`), icon glyphs (`Icon.jsx` equivalents).
