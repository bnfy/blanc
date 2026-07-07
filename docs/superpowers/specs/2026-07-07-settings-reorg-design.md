# Blanc — Settings screen reorganization

**Date:** 2026-07-07 (revised same day — see §0)
**Status:** Approved (round 2) — implementing directly (no separate implementation plan)
**Surfaces:** `src/renderer/pages/settings.html`, `src/renderer/pages/pages.css`, `src/renderer/pages/settings.js` (new: scroll-spy + click-to-scroll for the sidebar — this round is the first to need JS changes).

---

## 0. Revision note

Round 1 of this spec shipped a "regroup only" version: four labeled categories (General, Privacy & Security, Sync, Supporter) using a quiet uppercase eyebrow header, no new navigation, no card motif — explicitly ruling out both. After seeing it running, the user's feedback was that sections still felt jumbled: the category header's underline used the same 1px `var(--border)` hairline as every ordinary row divider below it, so a category boundary didn't read as a bigger break than an individual row.

The user then pointed to Brave's Settings screen as a reference they like: a persistent left sidebar for jumping between categories, and each group of settings bounded in its own white card panel on a gray background. This round **reverses both explicitly-declined items from round 1** (no nav chrome, no card motif) based on that concrete example. Round 1's IA work (four categories, item groupings/ordering) carries forward unchanged — this round is about visual separation and wayfinding, not regrouping the content again.

## 1. Problem

(Unchanged from round 1.) Settings had grown one control at a time as features shipped, ending up as a single flat page with inconsistent or absent section headers, unrelated controls (a theme preference, a destructive "clear all cookies" button) at identical visual weight, and closely related controls scattered apart (the ad-block toggle and its own exceptions list were sections away from each other).

## 2. Decisions locked (round 2, with the user, 2026-07-07)

- **Sidebar behaves as a table of contents, not Brave's subpage router.** Blanc has 4 categories vs. Brave's ~15; some (Supporter) are a single small card. Clicking a sidebar entry scroll-jumps to that section on one continuous page; the sidebar highlights whichever section is currently in view via scroll-spy. (Rejected: true subpages per category — bigger architectural change than this surface warrants, and tiny categories would feel like empty pages on their own.)
- **All four internal pages share one width (900px).** *(Superseded the initial "widen Settings only, leave the list pages at 760px" call — see §2a.)* Settings needs the extra room for its sidebar + card column; keeping the other three at 760px meant the shared top nav bar, its divider, and the page title visibly shifted position/width when tabbing between pages. A centered block can't stay put while its width changes, so the only way to hold the top chrome stable is one shared width — bumped the base `.page` rule to 900px rather than special-casing Settings.
- **Settings is the first tab** in the shared top nav (`Settings · Favorites · History · Downloads`), moved ahead of the three list pages. Nav order is duplicated by hand across all four page HTML files (flat-served, no shared partial), so the reorder touches each.
- **Sidebar is text-only, no icons.** Matches the existing `.page-nav` treatment (uppercase, tracked, dim) rather than importing Brave's icon language, which would be a bigger stylistic import than asked for.
- **Cards are flat: border + radius only, no shadow.** `pages.css` today has zero shadows anywhere (unlike the main chrome's `styles.css`, which uses `--shadow-pill`/`--shadow-popover`). Keeping cards flat avoids introducing a new visual primitive to this file.
- **Card background: `var(--surface-raised)`**, not the subtler `var(--surface)` — deliberately chosen for stronger contrast against the page background, closer to Brave's white-card-on-gray look. Already used elsewhere (inputs/buttons), so no new token.
- **Category label sits above and outside its card**, on the page background — not as the first row inside the bordered panel. Matches the reference screenshot exactly.

## 2a. Post-implementation adjustments (same day, after seeing round 2 running)

- **Unified page width (900px) across all four internal pages.** The original round-2 plan widened only Settings and left Favorites/History/Downloads at 760px. In practice, switching tabs then jumped the shared top nav + divider + title as the centered block's width changed. Fixed by making 900px the shared `.page` width; the list pages just render slightly wider rows. Verified via measurement: nav left edge and width are now pixel-identical across all four pages.
- **Settings moved to the first nav position.**

## 3. Information architecture

Unchanged from round 1:

| Category | Contents (in order) |
|---|---|
| **General** | Appearance (theme), App icon, Default browser, Search engine, New tab page |
| **Privacy & Security** | Block ads & trackers *(toggle)*, Ad-block exceptions *(nested directly under the toggle)*, Site permissions, Help improve Blanc *(telemetry ping)*, Clear browsing data *(destructive, placed last)* |
| **Sync** | Unchanged content (setup form / active state) |
| **Supporter** | Unchanged content |

## 4. Layout

```
┌─ .settings-shell (~900px, replaces .page for this file) ──────────┐
│ ┌─ .settings-nav ─┐  ┌─ .settings-content (scrolls) ─────────────┐ │
│ │ (sticky)        │  │                                          │ │
│ │  General        │  │  GENERAL                                 │ │
│ │ >Privacy & Sec. │  │  ┌──────────────────────────────────────┐│ │
│ │  Sync           │  │  │ card: var(--surface-raised),         ││ │
│ │  Supporter      │  │  │ 1px solid var(--border), radius 6px  ││ │
│ │                 │  │  └──────────────────────────────────────┘│ │
│ │                 │  │  PRIVACY & SECURITY                      │ │
│ │                 │  │  ┌──────────────────────────────────────┐│ │
│ │                 │  │  │ ...                                  ││ │
└─┴─────────────────┴──┴──────────────────────────────────────────┴─┘
```

- `.settings-nav`: `position: sticky`, narrow (~150px), text labels only, styled like `.page-nav` (uppercase, tracked, `var(--text-dim)`); active entry gets `color: var(--accent)` + a small left accent bar — the vertical-list equivalent of `.page-nav a.current`.
- `.settings-content`: the four category cards, each preceded by its (now page-background, not in-card) `.group-title` label.
- The top-level `.page-nav` (Favorites/History/Downloads/Settings) is untouched and sits above this new layout, unchanged — it answers "which internal page," the new sidebar answers "which part of Settings."

## 5. Card styling details

- `background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius);` with internal horizontal padding (rows currently have vertical-only padding since they ran edge-to-edge on the flat page — inside a bordered card they need left/right padding too).
- Rows within a card keep their existing divider between them (`.setting`'s current `border-bottom`), matching Brave's own internal-row dividers — but the **last** row/subsection in each card must not carry a trailing `border-bottom`, or it doubles up against the card's own bottom edge.
- Nested subsections (Ad-block exceptions, Site permissions under Privacy & Security) keep their round-1 12px left indent *inside* the card — orthogonal to the card boundary, still needed to read as children of the toggle above them.

## 6. New behavior in `settings.js`

This round is the first requiring JS changes:

- An `IntersectionObserver` watches each `.settings-group` card; whichever is most in-view gets its matching `.settings-nav` entry marked active (swap the accent-color/left-bar class).
- Each `.settings-nav` entry gets a click handler that smooth-scrolls its target card into view (`scrollIntoView({ behavior: 'smooth' })`, consistent with the existing locked-icon-swatch → Supporter jump already in this file).
- The existing `getElementById('supporterTitle').scrollIntoView(...)` jump keeps working unmodified — that id stays put, just now inside a card rather than a flat `<h1>`.

## 7. Out of scope

- True per-category subpages (routing/state) — explicitly declined in favor of scroll-spy.
- Sidebar icons — text-only, matching existing `.page-nav` language.
- Card shadows — flat border-only, matching `pages.css`'s existing lack of shadows.
- Changing what any individual control does, its copy, or its IPC wiring.
- Applying this treatment to other internal pages (bookmarks/history/downloads) — not requested.
