# Rebrand Bowser → Blanc

**Date:** 2026-07-05
**Status:** Approved

## Goal

Rename the product from "Bowser" to "Blanc" without breaking existing
installs — auto-update must keep working, and existing users' history,
favorites, downloads, and settings must survive the rename untouched.

## Why

Bowser's name is inseparable from Nintendo's Mario villain, which doesn't fit
the "serious indie product" ambition. A wide naming search (Otto, Rex, Balto,
Scout, Beau, Bolt, Beautiful, Baseline, Bespoke, Bevel, Blanc — all starting
with B to keep the existing logo symbol) found every other candidate either
blocked (active same-space competitor, litigious trademark holder, or an
entrenched unrelated dev term) or meaningfully worse on collision risk. Blanc
cleared best: no competing browser product, the two adjacent risks
(BlancVPN — a small, unfunded extension with no word-mark; Montblanc — whose
marks and enforcement history are built on the two-word "Mont Blanc"
compound, never the bare word) are both low, and `blancbrowser.com` is
purchased.

## Decisions made

- **Mascot:** retired. The pixel-doberman sprite, its assets, and all
  references come out of the shipped app and marketing site. Clean break,
  not "supporting character" — rejected keeping it as a supporting character
  since the new name has no dog association to hang it on.
- **General branding otherwise unchanged for now.** This is a name-and-mascot
  swap, not a visual overhaul — chrome layout, tone, copy style, and design
  tokens stay as they are. A new icon/logo is coming separately from the
  user; `build/icon.png` gets swapped in whenever it's ready, out of scope
  here.
- **`appId` stays `me.bnfy.bowser`.** Only `name`/`productName` change to
  `blanc`/`Blanc`. Rejected changing `appId` to match: it's invisible to
  users but is what macOS Gatekeeper, notarization, and default-browser
  registration key off of — changing it would make the OS treat this as a
  brand-new app (fresh permission grants, fresh Gatekeeper trust, and a break
  in the update chain for existing installs, since electron-updater/Squirrel
  match on app identity). Keeping it stable lets this ship as an ordinary
  version update of the same app.
- **`userData` needs an explicit migration**, because Electron derives that
  path from `productName`/`name`, not `appId` — unlike the appId, this *does*
  change with the rename and would otherwise silently start existing users on
  an empty profile.

## What changes

| Area | Change |
|---|---|
| `package.json` | `name: "blanc"`, `productName: "Blanc"`. `build.appId` unchanged (`me.bnfy.bowser`). `build.publish.repo` → `blanc`. |
| `src/main/main.js` | Add one-time `userData` migration: on startup, if the new (`Blanc`) userData dir is missing/empty and the old `Bowser` one exists, copy it over before anything else reads from it. Same spot as the existing `-Dev` suffix logic (~line 29-31). |
| `bowser://` scheme | Rename to `blanc://` in `pages.js` (scheme registration/privileges), `tab-preload.js` and `auth-preload.js` (`window.location.protocol` checks), `auth-dialog.js`, and renderer-side URL checks in `overlay.js`/`renderer.js`. |
| User-facing copy | `<title>` in `index.html`/`overlay.html`; shield-tooltip strings in `overlay.js:192` and `renderer.js:59`; `settings.html` copy (default-browser prompt, "Help improve Bowser" ping description); `updater.js:60` update-check dialog text. |
| Mascot | Remove `bowser-sprite.js`, `bowser-sprite-sheet.png`, and the newtab page's dog section/markup; adjust `newtab.html` layout for its absence. |
| `scripts/release.sh` | Update hardcoded `REPO="bnfy/bowser"` → `bnfy/blanc`, and the `ASSETS` array's filenames (`Bowser-$VERSION-...` → `Blanc-$VERSION-...`, matching the new `productName`). |
| GitHub repo | Rename `bnfy/bowser` → `bnfy/blanc` (GitHub preserves redirects on the old URL indefinitely, so existing clones/links keep working). |
| Cloudflare Worker | Rename `bowser-ping` → `blanc-ping` in `cloudflare/ping-worker/wrangler.toml`; update `PING_ENDPOINT` in `src/main/telemetry.js:5` to the new `workers.dev` hostname; redeploy. |
| Marketing site | Rebuild `site/` copy (title, meta description, RAM-comparison labels, download links, footer repo link) for the new name; deploy to `blancbrowser.com` instead of `getbowser.com`. |
| `CLAUDE.md` | Full rewrite for the new name/architecture — implementation-detail level, not enumerated here. |

## Explicitly out of scope

- New icon/logo art (user is producing this separately).
- Any change to the ad-blocking, tab, or overlay architecture — this is a
  naming/identity change only.
- Code signing/notarization credentials — unaffected, since Apple ID, Team
  ID, and `appId` all stay the same.

## Open follow-up (not blocking)

- One-time "Bowser is now Blanc" in-app notice for existing users after the
  first post-rename update, so the userData migration and new name don't
  look like a bug. Left for the implementation plan to size.
