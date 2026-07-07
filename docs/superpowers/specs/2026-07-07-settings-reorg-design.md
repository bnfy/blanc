# Blanc — Settings screen reorganization

**Date:** 2026-07-07
**Status:** Approved — brainstorm converged, implementing directly (no separate implementation plan)
**Surfaces:** `src/renderer/pages/settings.html`, `src/renderer/pages/pages.css`. `src/renderer/pages/settings.js` is unaffected — verified it only ever looks up elements by `getElementById`, never by DOM position/parent structure, so no logic changes are needed.

---

## 1. Problem

Settings has grown one control at a time as features shipped (App icon, Default browser, Sync, Supporter, …) and is now a single flat page: 7 controls at the top with **no section header at all** (Appearance, App icon, Default browser, Search engine, Block ads & trackers, New tab page, Help improve Blanc), followed by 5 headed sections (Ad-block exceptions, Site permissions, Clear browsing data, Sync, Supporter) that sit at the same visual weight regardless of how related or how consequential they are. Nothing signals category (a theme preference and a destructive "clear all cookies" button read identically), and closely related controls are scattered (the "Block ads & trackers" toggle and its own "Ad-block exceptions" list are sections apart).

The user identified the core issue as **lack of grouping** specifically — not missing navigation and not missing visual weight/hierarchy for risk. Scope is deliberately narrow: reorganize the existing controls into clearly labeled categories on the same single-scroll page. No new navigation chrome (sidebar, sticky anchors, tabs), no card/panel visual motif, no restructuring beyond grouping.

## 2. Decisions locked (with the user, 2026-07-07)

- **Four top-level categories:** General, Privacy & Security, Sync, Supporter. (Rejected: merging Sync + Supporter into one "Account & Extras" group — they don't share a real conceptual home, and collapsing them would recreate the same junk-drawer problem this work is meant to fix.)
- **Visual treatment: quiet uppercase "eyebrow" category header + rule**, reusing existing tokens (`--text-dim`, `--border`) and the same styling language as `.page-nav`. (Rejected: card/panel-style grouped sections — introduces a new visual motif that doesn't exist anywhere else in Blanc's chrome, a bigger departure from the flat/quiet aesthetic than this task calls for.)
- **No new navigation aid.** The page stays one continuous scroll; categories are a visual/organizational grouping only.
- **Skip a separate implementation-plan step.** Given the small, fully-scoped surface (two files, no JS changes), the user asked to go straight from this spec to implementation.

## 3. Information architecture

| Category | Contents (in order) |
|---|---|
| **General** | Appearance (theme), App icon, Default browser, Search engine, New tab page |
| **Privacy & Security** | Block ads & trackers *(toggle)*, Ad-block exceptions *(nested directly under the toggle — currently a separate section far below it)*, Site permissions, Help improve Blanc *(telemetry ping — it's a data-sharing toggle, belongs here rather than standing alone)*, Clear browsing data *(destructive, placed last)* |
| **Sync** | Unchanged content (setup form / active state), now a top-level group instead of a mid-page section |
| **Supporter** | Unchanged content, same treatment |

Within **General**, order follows a natural flow: appearance/identity (theme, app icon) → system integration (default browser) → navigation behavior (search engine, new tab page). Within **Privacy & Security**, the ad-block toggle now sits directly above its own exceptions list, followed by site permissions, then the lower-stakes telemetry toggle, then the single destructive action last.

## 4. Visual treatment

New category header style, additive to `pages.css`:

```css
.settings-group + .settings-group { margin-top: 48px; }
.group-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding-bottom: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
```

This produces three distinct visual weights where there were two: page title (`<h1>`, 20px/600) → category (`.group-title`, 11px uppercase/tracked) → existing subsection headers (`.section-title`, 16px, e.g. "Ad-block exceptions") → row (`.setting`). All existing row/toggle/list styling is untouched. Items nested under a subsection within a category (Ad-block exceptions, Site permissions under Privacy & Security) get 12px of left indent so they read as children of the toggle/category above rather than peers of it.

## 5. Implementation notes

- Wrap the existing `.setting` / `.section-title` blocks in `settings.html` into four `<section class="settings-group">` blocks, each with a leading `.group-title` label. Every element keeps its existing `id` — no renames.
- The "locked icon swatch → jump to Supporter" click handler (`settings.js`, `getElementById('supporterTitle').scrollIntoView(...)`) keeps working unmodified since that id stays in the DOM, just inside a new wrapper.
- `pages.css` is shared across all `blanc://` pages (bookmarks/history/downloads/settings); the new `.settings-group` / `.group-title` rules are additive and settings-only, no risk to the other pages.
- No IPC, no `settings.js` changes, no CSP changes.

## 6. Out of scope

- Any new navigation (sidebar, sticky anchor list, tabs) — explicitly declined.
- Card/panel visual motif — explicitly declined.
- Changing what any individual control does, its copy, or its IPC wiring.
- Applying the same grouped-header treatment to other internal pages (bookmarks/history/downloads) — not requested; could be a future consistency pass if those pages grow similarly cluttered.
