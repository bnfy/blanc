# Copy catalog (substrate S3)

One source of truth for user-facing copy, so the lowercase-mono brand voice never
forks across platforms. This is the [S3](../spec/shared-substrate.md#s3-copy--string-catalog)
first slice: **slash-command copy**.

Slash commands are the natural anchor — the desktop code already keeps two copies
of them by hand (`overlay.js`'s command table and `pages/shortcuts.js`'s reference
list, with a comment in `overlay.js` reminding you to sync them). This substrate
turns that hand-sync into a checked one and adds mobile string resources.

## Files

```
copy/
  slash-commands.json    the source of truth — edit HERE
  build.mjs              generator + drift checker
  generated/
    SlashCommands.strings   iOS
    slash_commands.xml      Android
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

## Why guarded, not overwritten

Same posture as `tokens/` and `settings-schema/`: the desktop copies are
load-bearing renderer code a headless build can't exercise, and drift *prevention*
is the point. Mobile resources (new) are fully generated.

## Verification

- `npm run copy:check` is **green** — both `overlay.js` and `pages/shortcuts.js`
  match the catalog (including the `/group` doc override).
- Negative-tested: changing a hint in the catalog flags the mismatched desktop
  file(s) with a precise `DRIFT:` line and exits 1.

## Expansion (not yet done)

The rest of the S3 catalog is the same pattern applied to more copy: settings
field labels and section headers (`settings.html`/`settings.js`), the newtab
ledger copy (`Where to?`, footer), empty states, and permission-prompt text. The
**app-icon / search-engine labels are already owned by S5** (`settings-schema/`) —
don't duplicate them here.
