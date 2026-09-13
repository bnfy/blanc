# Copy catalog (substrate S3)

One source of truth for user-facing copy, so the lowercase-mono brand voice never
forks across platforms. This is [S3](../spec/shared-substrate.md#s3-copy--string-catalog)
in two slices: **slash-command copy** and, since 2026-09-11, the **Island
action titles** (reload, stop, favorite, unfavorite, close tab, downloads, new
tab, tabs) that iPhone Duo's vertical toolbar needs a title for (D27).

Slash commands are the natural anchor — the desktop code already keeps two copies
of them by hand (`overlay.js`'s command table and `pages/shortcuts.js`'s reference
list, with a comment in `overlay.js` reminding you to sync them). This substrate
turns that hand-sync into a checked one and adds mobile string resources.

## Files

```
copy/
  slash-commands.json    slash-command copy — edit HERE
  island-actions.json    Island action titles + SF Symbols — edit HERE
  build.mjs              generator + drift checker (both catalogs)
  generated/
    SlashCommands.strings   iOS
    slash_commands.xml      Android
    IslandActions.strings   iOS   (keys island_<id>, symbol noted per line)
    island_actions.xml      Android
```

## Commands

```bash
npm run copy:build   # regenerate copy/generated/* from the catalog
npm run copy:check    # verify BOTH desktop copies match the source, and the
                      # generated files are current. Exit 1 on drift.
```

A repo-wide `npm run substrate:check` runs the tokens, settings, and copy guards
together.

## Model

Each command has a primary `hint` — what the ⌘L palette shows and what mobile
uses. `pages/shortcuts.js` (the reference page) usually lists the same text; where
it deliberately differs, the catalog carries a `doc` override. Today only `/group`
differs: the palette shows an input helper (`Type a space, then a group name…`),
the reference page shows a description (`/group <name>` → `Move this tab into a
group…`). The check validates `overlay.js` against `hint` and `shortcuts.js`
against `doc ?? hint`.

## Island actions

`island-actions.json` carries one entry per Island action: the `title` the
mobile toolbar item shows, the SF `symbol` iOS pairs with it (Android maps it to
its own icon set), and a `desktop` map naming the base label each desktop file
already carries for the same action — `renderer.js` (the resting pill's
`pillButton(...)` calls and `title` assignments) and `overlay.js` (the panel's
action cluster). The guard is deliberately **one-way**: it verifies that each
named label is still present in a label-bearing statement of that file (exactly,
or followed by a ` (` shortcut suffix such as `'New tab (⌘T)'`), so renaming a
desktop action fails `copy:check` until the catalog and the mobile resources
follow. It does not try to enumerate every desktop label. `tabs` is
`platforms: ["ios", "android"]` — the vertical tab-dots item has no single
desktop control to guard.

## Why guarded, not overwritten

Same posture as `tokens/` and `settings-schema/`: the desktop copies are
load-bearing renderer code a headless build can't exercise, and drift *prevention*
is the point. Mobile resources (new) are fully generated. A command with a
`platforms` allowlist remains in the relevant desktop catalog but is omitted
from mobile resources; `/1password` is currently `macos` only.

## Verification

- `npm run copy:check` is **green** — both `overlay.js` and `pages/shortcuts.js`
  match the catalog (including the `/group` doc override).
- Negative-tested: changing a hint in the catalog flags the mismatched desktop
  file(s) with a precise `DRIFT:` line and exits 1.
- Negative-tested (island actions, 2026-09-11): renaming `'Close tab'` in
  `renderer.js` fails `copy:check` with the file, label, and action id named.

## Expansion (not yet done)

The rest of the S3 catalog is the same pattern applied to more copy: settings
field labels and section headers (`settings.html`/`settings.js`), the newtab
ledger copy (`Where to?`, footer), empty states, and permission-prompt text.
The iOS project does not yet reference `IslandActions.strings`; Phase 2 of the
Duo plan adds it to the `Blanc` target when the vertical toolbar is built. The
**app-icon / search-engine labels are already owned by S5** (`settings-schema/`) —
don't duplicate them here.
