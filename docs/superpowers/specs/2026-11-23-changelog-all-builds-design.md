# Changelog for every Blanc build — design

Date: November 23, 2026. Status: approved by the owner on November 23, 2026, including the calls listed at the end.

## Why

`blanc.day/changelog` lists only the shipping Electron app. Since November 2026 people can install four other kinds of Blanc: Blanc Beta for Mac, Windows and Linux (the Chromium fork) and Blanc for iPhone and iPad. None of their releases appear on the changelog, so the page understates what Blanc ships and leaves people on those builds with nowhere to see what changed. The owner wants the page to fill in everything already released and to pick up every new release from now on, for every build.

## Goals

- One `/changelog` timeline holding every public release of every Blanc build, newest first, with a product filter.
- A complete backfill of what has already shipped (the inventory below).
- Every release flow adds its own entry from then on, with no hand copying.
- Release text that matches what actually shipped: the published GitHub release body or the App Store's What's New text, never rewritten.

## Non-goals

- What's New pages (`/whats-new/X.Y`) stay as they are: they are the desktop app's post-update page, keyed to Electron feature releases.
- The Download page, Roadmap, Compare, Bangs and every other reader of `site/src/data/releases.json` keep their current behavior.
- Android: nothing is released, and `CLAUDE.md` forbids any public Android claim until a release backs it. The data format leaves room for it; no Android entry, filter chip or copy ships now.
- Nightly builds, release candidates (`v1.0.0-rc.*`), unpublished drafts, `fork-windows-candidate`, `blanc-chromium-preview-*`, TestFlight-only builds and the private beta.1 never appear.

## Anti-goals (a failure even if it works)

- A beta becoming the "latest release" anywhere outside the changelog (Download, What's New redirect, Bangs pin, sitemap).
- Daily Mac betas burying stable releases in the default view.
- An existing changelog anchor (`/changelog#v1-52-0`) or the existing feed (`/changelog.xml`) changing behavior for people already linking to or subscribed to it.
- Any text on the page that wasn't in a published release.

## Inventory to backfill (as of November 23, 2026)

| Product | Releases | Source of the text |
|---|---|---|
| Blanc (desktop, Electron) | v0.1.0 to v1.52.0, already on the page | GitHub releases, unchanged |
| Blanc Beta for Mac | 2.0.0-beta.2 to beta.9 (8) | GitHub pre-releases `chromium-beta-2.0.0-beta.N` |
| Blanc Beta for Windows | 158.0.8127.902, .903, .904 | GitHub pre-releases `chromium-beta-windows-158.0.8127.N` |
| Blanc Beta for Linux | 158.0.8127.906 | GitHub pre-release `chromium-beta-linux-158.0.8127.906` |
| Blanc for iPhone and iPad | 1.0, 1.0.1, 1.0.2, 1.0.3, 1.0.4, 1.1 | App Store Connect What's New per version (1.0 has none: a first version can't carry it, so use the release-notes line in `docs/ios/app-store-listing.md`) |

The builder re-checks this list on the day of building: betas publish almost daily.

## Approaches considered

- **A. One merged file.** Add betas and iPhone versions to `releases.json` with a `product` field. Simplest page, but about 20 readers of that file (Download, Roadmap, What's New, Bangs pin, Compare, sitemap and their tests) assume it lists only stable desktop releases; each would need a filter, and a missed one makes a beta the "latest release".
- **B. One file per product, merged on the page.** Chosen by the owner. `releases.json` is untouched; new files hold the other products; only `/changelog` and the new feeds read them.
- **C. Hand-written entries.** Full editorial control, but loses automation and lets the page drift from what shipped, against `docs/marketing-claims.md`.

## Design

### Data

- `site/src/data/releases.json` — unchanged, desktop stable, still produced by `npm run site:changelog`.
- `site/src/data/beta-releases.json` — new. Every published `chromium-beta-*` GitHub pre-release, each with `platform: "mac" | "windows" | "linux"` derived from its tag (`chromium-beta-<version>` is Mac, `chromium-beta-windows-…`, `chromium-beta-linux-…`).
- `site/src/data/ios-releases.json` — new. Every App Store version that reached Ready for Sale: version, on-sale date, devices (`iphone`, or `iphone,ipad` from 1.0.3), App Store What's New text, and the App Store link.

All three use the existing entry shape (`version`, `humanDate`, `machineDate`, `anchor`, `url`, `sections` of typed spans), plus a `product` field on the new files, so the page renders them with the same components and the same escaping rules. An Android file can join later in the same shape.

### Generating the beta file

Extend `scripts/generate-site-changelog.mjs` (same parser, same span safety) with a second output instead of writing a second script. It reads the same GitHub release list it already fetches, keeps only published, non-draft `chromium-beta-*` pre-releases, and writes `beta-releases.json`. Its existing desktop filter is unchanged, and `--check` covers both files.

Beta bodies come in two formats, and the page keeps the same things from both:

- **Mac and Linux** mark sections with bold lines (`**New in this beta**`), not markdown headings, so for betas the parser treats a paragraph that is entirely one bold span as a heading.
- **Windows** (.902 to .904) has no section lines: every paragraph starts with a bold lead-in ("**Updating.** …", "**Not yet.** …") and ends with an unlabeled line about the signed installer and `SHA256SUMS`. Its lead-in paragraphs are kept as they are, in order.

What the page keeps from a beta body:

- change sections (New, Fixed, Changed, and the like) and Windows' lead-in paragraphs, in full;
- **Not in this beta yet** (Windows: **Not yet.**) in full, because it states the limits (protected video, Sync) that travel with any claim about the beta;
- **What to know** only when the entry has no change section (the first beta on each platform: beta.2, .902, .906);
- dropped: the intro paragraph (it restates what Blanc Beta is, which the entry's product label and the page's hero already say, and the Windows intros name a then-current stable version, "Blanc 1.51 stays the version to use every day", that is out of date on a page read later), **Checking the download**, **Tested on** and Windows' closing signature line, all of which the GitHub release link still carries.

Dropping whole sections is not rewriting: every kept sentence appears exactly as published.

### Generating the iPhone file

A new script, `scripts/ios-changelog.mjs` (`npm run site:ios-changelog`), reads App Store Connect through the API key `ios-testflight.sh` already uses (through `op run`): each App Store version in Ready for Sale or later and its en-US `whatsNew`. It runs only on the owner's Mac, never in CI. Devices aren't read per version: the script applies a fixed rule (1.0.3 and later are iPhone and iPad, earlier versions iPhone only, from `docs/ios/app-store-connect.md` item 24) and fails if a version is ever withdrawn from iPad, so the rule can't silently go stale. It writes `ios-releases.json` and never overwrites an entry whose text has changed without `--force`, so a later App Store edit can't silently rewrite history. Backfill is the first run of this script. For the 1.0 entry, which has no What's New, it takes the text from `docs/ios/app-store-listing.md` ("What's New in 1.0").

On-sale dates: the API doesn't expose them directly. The script records the date of the first run that sees a version on sale; for the backfill the builder takes each date from the App Store's version history, falling back to the record in `docs/ios/app-store-connect.md` (1.0: Nov 6; 1.0.3: Nov 12; 1.1: Nov 22; 1.0.1, 1.0.2 and 1.0.4 to be confirmed).

### The page

- `/changelog` merges the three files by `publishedAt`, newest first.
- Filter chips: **Stable** (selected when the page opens: desktop and iPhone releases, no betas; owner decision, November 23, 2026), **Blanc**, **iPhone & iPad**, **Blanc Beta**, **All** (everything, betas included), plus the existing **New features** toggle. A plain `/changelog` link, including the desktop app's (Settings → Release notes, the Start Page's What's New link, `src/main/whats-new.js`), opens on **Stable**. The chip choice lives in the URL (`?product=blanc|iphone|beta|all`; no parameter means Stable) so it can be linked; search keeps working across whatever is shown.
- Each entry carries a small product label (Blanc, Blanc Beta for Mac / Windows / Linux, Blanc for iPhone, Blanc for iPhone and iPad). Its title reads "Blanc Beta 2.0.0-beta.9", "Blanc Beta for Windows 158.0.8127.904", "Blanc for iPhone 1.1".
- Anchors: desktop anchors stay exactly as they are (`v1-52-0`); new ones are namespaced (`beta-mac-2-0-0-beta-9`, `beta-windows-158-0-8127-904`, `beta-linux-158-0-8127-906`, `ios-1-1`).
- Links: betas link to their GitHub release; iPhone entries link to the App Store listing.
- The hero copy changes from "mirrors Blanc's published GitHub releases" to cover every build, and says betas are previews and that the regular Blanc is the recommended browser (as every beta release already says).
- Styling follows the existing changelog CSS and tokens; no inline styles.

### Feeds

- `/changelog.xml` stays desktop-only, so existing subscribers see no change.
- New: `/changelog/beta.xml`, `/changelog/iphone.xml`, and `/changelog/all.xml` (every product, betas included), each linked from the page and declared in its head.
- The sitemap gains nothing new (anchors aren't pages).

### From now on

Desktop releases and every beta are read from GitHub releases, so the generator picks up any published one whenever it runs; the work is making sure it runs, and catching it when it didn't.

- **Desktop:** unchanged (`release.sh` runs `npm run site:changelog`). That run now also refreshes `beta-releases.json`; harmless, since a beta published earlier belongs there anyway.
- **Mac beta:** `chromium/release/daily/site-pr.mjs` runs the generator and adds `beta-releases.json` to the website PR it already opens. `site-pr.mjs` lives on `chromium/next`, so this change is pushed there (a third change beside the two PRs below), and its copy on `main` follows with the next beta's tag-to-`main` PR.
- **Windows and Linux betas:** their download-tile move (`blanc-beta-windows.json`, `blanc-beta-linux.json`) is still a hand-made website PR (#1670, #1678, #1685); neither `windows-release.mjs` nor the Linux release tool writes site data. Add `npm run site:changelog` to that PR's step in `docs/chromium-beta-release.md` ("Windows" and "Linux" sections) rather than building new site tooling into owner-run release stages.
- **iPhone:** after a version reaches Ready for Sale, run `npm run site:ios-changelog` and open a website-only PR; add that step to the iOS release record (`docs/ios/app-store-connect.md`).
- **Safety net:** `npm run site:deploy` runs `npm run site:changelog:check` first, which fetches GitHub and refuses to deploy while `releases.json` or `beta-releases.json` is behind what's published. A skipped step therefore blocks the next site deploy instead of going unnoticed. This replaces a unit test against the beta ledgers: `main`'s ledgers lag (its Windows ledger is empty, it has no Linux ledger, beta.9 isn't in its Mac ledger), and a unit test on every PR would force a merge order on every beta. iPhone has no equivalent, since only the owner's Mac can read App Store Connect; the release record step is its check.

### Tests

- `test/unit/site-changelog.test.js` gains: beta tag-to-platform mapping; nothing but published `chromium-beta-*` pre-releases in `beta-releases.json`; desktop output byte-identical to today's; the bold-heading rule and section keep/drop rules against the real beta.2, beta.9, .902 and .906 bodies; injection safety for both new files; unique anchors across all three files; the desktop anchors unchanged.
- A test that no reader of `releases.json` other than `/changelog` and its feeds imports the new files.
- The Windows-format rules against the real .902 and .904 bodies.

### Shipping

Two PRs. Generators, data files and tests in one; the page, feeds and copy in a website-only PR after it (the repository's rule for site changes). Deploy with `npm run site:deploy` and check that Cloudflare shows the commit as Production on `main`. Nothing here touches the app, a release, or `main` during a release's press gate: hold the merges if a desktop release is being prepared.

## Left to the builder

- Exact chip labels, visual treatment of the product label, and how the filter and the New features toggle combine.
- Whether `/changelog/all.xml` caps its length (daily betas make it long).
- The exact parsing code for bold-line headings.
- Where the iOS checklist step is written, as long as the iOS release record names it.

## Owner decisions (November 23, 2026)

- One timeline with a product filter, not a page per product.
- Approach B: one data file per product, merged on the page.
- The page opens on stable releases of every product (desktop and iPhone), betas behind their chip.

## Calls made in this draft (not yet confirmed by the owner)

1. `/changelog.xml` stays desktop-only; new feeds per product plus an "all" feed.
2. Beta entries keep change sections and Not in this beta yet; first betas keep What to know; intros, download-checking text and Windows' signature line are dropped.
3. The iPhone script refuses to overwrite changed App Store text without `--force`, runs only on the owner's Mac, and uses a fixed iPad-from-1.0.3 rule.
4. Windows and Linux get a runbook step, not new release tooling; `site:deploy` refuses a changelog that's behind GitHub.
