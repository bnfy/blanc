# Blubird in the desktop app

**Date:** October 15, 2026
**Status:** Draft for owner review. Nothing here is built.
**Aligns with:** PR #836 (cinematic homepage redesign, draft), which puts
Blubird on blanc.day and builds on #828.

## Goal

The app's internal pages read in the same type as the redesigned website:
Blubird Display for large headlines and Blubird Text for copy. The Island and
everything else drawn by `blanc-chrome://` keep Inter, just as the website keeps
its product replicas in Inter.

## Decisions already made (owner, October 15)

1. **The licence gates everything.** Blubird ships in the app only after Rajesh
   Rajput grants an app licence and written permission. Until then nothing
   merges. The font files never enter git; builds install them from private
   storage, as #836 does for the website.
2. **Scope is headings plus page copy.** Blubird replaces Newsreader in
   headings and Inter in the copy of the internal pages. The Island, the
   overlay panels and the other chrome documents stay in Inter.

## What users will see

- The Start Page, onboarding and the five utility sheets (Favorites, History,
  Downloads, Settings, Shortcuts) change to Blubird: headings, labels, rows,
  buttons and form text.
- Numbers that are set to line up today (download sizes, counts and similar)
  and keyboard keys stay in Inter (see *Facts*).
- The Island, ⌘L panel, find bar, shield and Spaces popovers, permission
  prompts and the 1Password capsule look exactly as they do today.
- Mahjong is unchanged, including its JetBrains Mono tile faces.
- Builds without the licensed files (contributors, forks, CI test jobs) show
  Inter everywhere these pages used Newsreader or Inter. Official releases
  cannot ship without the files (see *Release gate*).

## Facts this design rests on

**Licence.** The EULA in `Blubird.zip` is a Regular Licence: web and print use,
for an individual. It says the files "must not be modified or redistributed,
Online or Offline" without the author's written permission, and directs app
licences to the author. #836's `docs/brand-usage.md` (Licence paragraph,
lines 300–306 on that branch) already records that app use needs written
permission first. Every Blanc installer contains its fonts inside `app.asar`,
which is redistribution.

**The font.** Inspected from the supplied files:

- Two optical cuts, Display and Text, each in static weights Thin to Black with
  italics. #836's `site/src/styles/blubird.css` declares them as the CSS
  families "Blubird Display" and "Blubird Text". A variable file (`Blubird-VF.ttf`, 207 KB) has `wght` 100–900, `opsz`
  12–72 and `ital` 0–1.
- 360 characters. It covers English, German, Spanish, French, Portuguese and
  Italian letters, except capital ẞ.
- It lacks ⌘ ⌥ ⇧ ⌃, the arrows ← → ↑ ↓, ≤ ≥ and №. Chromium draws a missing
  character from the next font in the stack, so these fall back to Inter or the
  system font.
- **No tabular figures.** Its OpenType features are `aalt frac liga locl ordn
  sups`; there is no `tnum`. `font-variant-numeric: tabular-nums` has no effect,
  so changing numbers shift width as they update.
- The embedding flag (`fsType`) is `0x0008`, editable embedding. That is the
  font's technical flag; the licence still decides.
- The website uses four Web-PS WOFF2 files, about 21 KB each:
  `Blubird-RegularDisplay`, `Blubird-RegularText`, `Blubird-MediumText`,
  `Blubird-SemiBoldText` (`site/scripts/blubird-fonts.mjs` on #836).

**How the app loads fonts today.**

- `src/renderer/styles.css:6-8` and `:44`: the chrome loads Inter and defines
  `--font-ui`.
- `src/renderer/pages/pages.css:4-33` and `:61-62`: the internal pages load
  Inter, Newsreader Condensed, JetBrains Mono and Caveat, and define `--font-ui`
  and `--font-display`.
- `--font-display` is used by six rules: sheet titles (30px/500), Shortcuts
  section titles (21px/500), moving-in checklist (28px/400), Billboard clock
  (80–148px/500), Ledger "Where to?" (32px/400), onboarding titles (22px/400).
- `tokens/tokens.json:38-39` holds both stacks, and `npm run tokens:check`
  guards them against the CSS. The generated `ios/Blanc/Tokens.swift` carries
  the strings, but no iOS code reads them.
- `src/main/pages.js` serves only flat files in `src/renderer/pages/`, so the
  font files must sit directly there.
- `package.json` `build.files` packs `src/**/*` from disk, so git-ignored files
  present on disk are packed.
- The release dirty check (`scripts/release.sh:245-252`) uses
  `git ls-files --others --exclude-standard`, which skips git-ignored files.
  Installed fonts do not make a release checkout "dirty".
- The uBO popup and dashboard reuse `inter-latin.woff2`
  (`src/main/ublock-package.js:70,89,244`) and stay as they are.

**Owner decision, October 15:** the Billboard clock read too plain in Regular
Display. Of the heavier cuts rendered with and without tighter tracking, the
owner chose Medium Display at 0 letter-spacing. That adds a fifth file,
`Blubird-MediumDisplay.woff2`, to the pinned set, the secrets and the licence
request.

**Owner decision, October 15 (page copy width):** the Text cut read wider
than wanted. Page copy now uses the supplied variable file `Blubird-VF.ttf`
at optical size 28 (about 2% narrower than Inter instead of 2% wider). The
three static Text files are dropped; the pinned set is the Regular and Medium
Display webfonts plus the variable file. The website (#836) still uses the
static Text files, so its copy is slightly wider than the app's until it
adopts the same setting.

**Owner decision, October 15 ("Where to?"):** the Display cut read too tight
at 32px, which #836's brand rule already flagged as the Display cut's lower
limit. "Where to?" now uses the variable file at optical size 32, so Regular
Display is no longer used and leaves the pinned set: Medium Display (the
Billboard clock) and the variable file remain.

## Approaches considered

**A. The website's four static files (recommended).** Same files, family names
and `@font-face` rules as #836, so the app and blanc.day render identically. The
files are used exactly as supplied, about 85 KB in total, and the licence
request can name four files. Weights map onto 400, 500 and 600–700, as on the
site. The cost is that in-between weights snap to the nearest file
(550 → 600, 650 → 600).

**B. The variable font.** One file gives every weight, and the pages already
set `font-optical-sizing: auto`, so each heading would get its own optical
size. The costs:

- It draws in-between cuts the website never shows.
- It is a 207 KB TTF; converting it to WOFF2 would modify the file.
- Its default instance is Black Display, so any axis mistake renders the
  heaviest cut.
- The licence request would cover a second set of files.

**C. Commit the files to the repository.** Ruled out by decision 1.

## Design

### Type roles

| Surface | Today | After |
|---|---|---|
| Billboard clock (80–148px) | Newsreader Condensed | Blubird Display, 500 (Medium; owner choice, October 15) |
| Ledger "Where to?" (32px) | Newsreader Condensed | Blubird Display, 400 |
| Sheet titles, Shortcuts section titles, checklist heading, onboarding titles (under 32px) | Newsreader Condensed | Blubird Text, at today's weight (400 or 500) |
| Copy on the Start Page, onboarding, utility sheets, error page, Tab import, Tab handoff | Inter | Blubird Text |
| Rules that set `tabular-nums` (9 in `pages.css`), and `kbd` | Inter | Inter |
| Island, overlay, permission prompt, fill capsule (`styles.css`) | Inter | Inter |
| uBO popup and dashboard | Inter | Inter |
| Mahjong page and tile faces | Inter, JetBrains Mono | unchanged |
| Sync guide icon word | Caveat | unchanged |

Headings under 32px use the Text cut. #836's brand rule switches the lockup to
the Text cut at about 32px and under, because the Display cut's fine joins close
up there; this design applies the same threshold to headings. Blubird is set at
0 letter-spacing, as #836's brand rule sets Blubird Display. The
negative tracking these headings carry today (−0.03 to −0.045em) was tuned for
Newsreader Condensed and is removed.

### Tokens

In `pages.css` `:root`:

- `--font-ui` is unchanged: the Inter stack shared with the chrome. Figures,
  `kbd` and Mahjong keep using it.
- `--font-text` (new) is `"Blubird Text"` followed by the Inter stack.
- `--font-display` becomes `"Blubird Display"` followed by the Inter stack.
  Newsreader leaves the stack.

Every `font-family: var(--font-ui)` rule in `pages.css` and `tab-handoff.css`
moves to `--font-text`, except the figure and `kbd` rules. `styles.css` and
`mahjong.css` do not change. `tokens.json`
gains `font-text` (consumers: pages) and the new `font-display` value, and
`npm run tokens:build` regenerates the mobile files.

### Font files and where they live

- `fonts/blubird/pinned.json` (committed) lists the four file names, their
  sizes and SHA-256 digests, and the folder they come from in the zip
  (`Blubird/Web-PS/`). It holds hashes, not font data.
- `.gitignore` excludes `src/renderer/pages/Blubird-*.woff2`.
- `scripts/blubird-fonts.mjs` (new, desktop) has two commands:
  - `install <zip or folder>` copies the four files into `src/renderer/pages/`
    and refuses any file whose digest differs from `pinned.json`.
  - `check [--asar <path>]` reports whether the files are present and match,
    in the checkout or inside a packaged `app.asar`.
- npm scripts: `fonts:install` and `fonts:check`.
- #836's `site/scripts/blubird-fonts.mjs` stays as it is. Merging the two
  installers can follow once both have landed, so this desktop PR does not
  touch `site/`.

### Where each build gets the fonts

| Build | Source | If missing |
|---|---|---|
| Local `npm start`, `dist:dir` | `npm run fonts:install -- ~/Downloads/Blubird.zip` | Inter fallback, with a warning from `fonts:check` |
| CI test jobs (unit, acceptance) | none | Inter fallback; tests do not depend on the font |
| macOS release (`release.sh`) | 1Password document "Blubird fonts" in vault Dev, read with `op` after the existing sign-in | release stops |
| Windows/Linux workflow, `mode=release` | four Actions secrets holding base64 WOFF2 (each about 28 KB, under the 48 KB limit) | job fails |
| Windows/Linux workflow, `mode=validation` | the same secrets | builds with a warning |

Fork pull requests cannot read the secrets, which is what we want.

### Release gate

Public releases must never fall back silently.

- `scripts/release.sh` installs the fonts before building and then runs
  `fonts:check --asar` on both Mac architectures, next to the existing
  `verify-packaged-adblock` and `verify-packaged-compliance` checks
  (`release.sh:350-360`).
- `release-windows-linux.yml` installs the fonts before electron-builder. In
  `mode=release` it runs `fonts:check --asar` after packaging, next to the
  existing packaged checks (lines 188–194 and 470–476).
- A digest mismatch fails both, so a different file from a future font
  update cannot slip in. Updating Blubird becomes a reviewed release input, like
  the blocker lists: change `pinned.json` and the secrets together.

### Licence record and notices

- Record the permission's scope and date in `docs/brand-usage.md` next to #836's
  licence paragraph. Keep the signed permission itself private, not in the repo.
- `THIRD-PARTY-NOTICES.md` and `compliance/policy.json` gain a Blubird entry: a
  commercial licence held by the licensee, not MIT, not redistributable apart
  from Blanc. Regenerate the packaged notices and runtime SBOM. The compliance
  model's licence allowlist (`compliance/policy.json:10`) needs an explicit
  commercial category for this one asset.
- Remove Newsreader from the app: `newsreader-condensed-latin-opsz-normal.woff2`,
  `newsreader-OFL.txt` and its compliance entry. The website keeps its own copy.
- Update `docs/repository-inventory.md` and run `npm run audit-inventory:write`.

### Docs to update

- `docs/brand-usage.md`, *System v2*, about lines 240–253: in-app roles move to
  Blubird, Inter stays the operating face of the chrome, and the type section
  gains the 32px Display/Text rule.
- `spec/acceptance/newtab-layouts.feature:71` and `onboarding.feature:11` name
  Newsreader and need new wording.
- The Bowser Design System's `typography.css`, after merge and only with
  approval before the push.

## Testing

Unit tests:

- Rewrite `test/unit/start-page-fonts.test.js`: the role table above, Newsreader
  gone, and `styles.css` naming no Blubird family.
- `test/unit/migration-checklist-page.test.js:83` changes with it.
- New test: `pinned.json`, the `@font-face` rules and `.gitignore` agree on the
  same four names, and no Blubird file is tracked by git.
- Compliance tests cover the new entry.

Acceptance (`test/desktop`):

- `test-hook.js:1112-1139, 1322, 1871` and the two step files assert Newsreader
  today. They should instead assert the computed family stack (Blubird first)
  and the title-fit checks. CI runs them without the fonts.

With the fonts installed locally:

- Before/after crops of the four Start Page layouts, onboarding, and each sheet
  in light, dark and private.
- `npm run test:i18n:desktop` and the de, fr and it sheets, checking for
  truncation.
- Onboarding title fit.

Platforms:

- Windows and Linux VMs: compare Web-PS and Web-TT rendering at 13px. Keep
  Web-PS (as the website does) unless Web-TT is clearly sharper there.

Gate checks:

- Positive control: `fonts:check --asar` fails on a build with one file
  missing and on a build with one file altered.
- Packaged: `npm run dist:dir` with the fonts, then a `mode=validation` Windows
  build installed in the VM.

## Risks

- **Licence terms.** The checklist below covers what the permission has to say.
  If the author declines app use, this design stops. The website is not
  affected.
- **Open-source posture.** Official builds would carry one commercially
  licensed asset; the source stays MIT. Forks and from-source packages get
  Inter. The FAQ and Terms may need a sentence. This is an owner decision before
  release, and the release note follows `docs/marketing-claims.md`.
- **Third-party packages.** The community Snap and Flatpak packages may
  repackage official builds, and would then redistribute the font.
- **Website captures.** Start Page and sheet images on blanc.day show the old
  type until they are re-captured after release.
- **Billboard clock.** Without tabular figures, the centred clock shifts a
  little when its digits change, once a minute. Owner review point.

## Review points for the owner

1. Headings under 32px in Blubird Text, larger ones in Display.
2. Error page, Tab import and Tab handoff change too, because they share
   `pages.css` rules. Excluding them needs a scope class.
3. The Billboard clock in Blubird Display, or kept in Inter.
4. A sentence in the FAQ/Terms about the commercially licensed typeface.

## Licence request checklist

The written permission should cover:

1. Embedding the named WOFF2 files (the website's four plus Medium Display), unmodified, in the Blanc desktop app
   for macOS, Windows and Linux, given away free to unlimited users, including
   automatic updates.
2. Users can technically extract the files from the app package (Electron's
   `app.asar` is not encrypted).
3. Keeping the files in private build storage: 1Password, encrypted GitHub
   Actions secrets and private CI artifacts.
4. The app's source code is public under MIT. The font files stay out of it,
   and the stylesheets name the font.
5. Whether unmodified official builds may be repackaged by third parties
   (community Snap and Flatpak).
6. Duration (ideally perpetual) and future updates of the font.
7. The licensee: Bananify Creative rather than an individual. It is worth also
   moving the website's licence to the company at the same time.
8. Optional: future iOS and Android apps.
