# Interface localization (F44)

**Date:** 2026-10-09
**Status:** draft for owner review (revision 2). Brainstormed with the owner
on 2026-10-09; every decision below was approved in that session. Revision 2
applies the first review: only explicit acknowledgement advances translation
hashes, a stored unavailable language renders English, `uiLanguage` has a
single writer, and `maxLength` is a lint. No feature code has been written.
**Amends:** the S3 copy substrate (`copy/`), `src/main/settings.js` +
`settings-schema/schema.json` (new `uiLanguage`), the `blanc-chrome://` and
`blanc://` protocol handlers (`src/main/chrome-protocol.js`,
`src/main/pages.js`), every Blanc-authored string surface, and the
architecture text in `CLAUDE.md`/`AGENTS.md`. Adds feature F44 and divergence
D27 to `spec/`.
**Unrelated to:** F43 on-device web-page translation, which stays paused
(2026-10-08 no-go). Nothing here translates websites.

## Why

Blanc's interface is English-only. Strings are hard-coded across the chrome
strip, the overlay, permission prompts, the fill-status capsule, every
`blanc://` page, native menus and main-process dialogs. Every document declares
`<html lang="en">`. There is no catalog, no language setting, and no way for a
non-English speaker to use Blanc in their own language.

This project builds the localization machinery and ships one pilot language,
German, end to end. German is the pilot because its strings run about 30%
longer than English, so it stress-tests the tight Island pill, ⌘L rows and
Settings layout. If German fits, most Latin-script languages will. Inter
covers its script, so no font work is needed.

## Decisions (owner, 2026-10-09)

| Question | Decision |
|---|---|
| First release scope | Infrastructure plus one pilot language, shipped end to end. More languages arrive later in ordinary releases. |
| Pilot language | German (`de`). |
| Who translates | AI only, no human reviewer. Compensating safeguards are in [Translation workflow](#translation-workflow). |
| How users choose | Settings picker, default **System**. A change applies after a relaunch. |
| Sync | Device-local. Never in `SYNCED_KEYS`. |
| Right-to-left | Not shipped, but nothing may block it: the catalog records direction, documents set `dir`, touched CSS uses logical properties. |
| Coverage before release | 100%. German stays hidden until CI proves every Blanc-authored string has a German entry. |
| Fixed (never translated) | Brand names (Blanc, Blanc Blocker, Blanc Patron, uBlock Origin, 1Password), slash command names (`/sleep`, `/group`), macOS modifier symbols (⌘ ⌥ ⇧ ⌃). Windows/Linux key words such as Ctrl are translated ("Strg"). Descriptive feature names are translated, pinned by a glossary (Quiet Tabs → "Ruhende Tabs", Favorites → "Favoriten"). |
| Architecture | Extend the `copy/` substrate into a full message catalog with an in-house formatter (approach A). A third-party i18n library and build-time localized HTML were both rejected. |

## Current state (verified 2026-10-09 at `f0b05b3c`)

These counts are estimates from a repository survey. They size the work; they
are not acceptance numbers.

- **About 1,900–2,100 user-visible strings:**
  - **Chrome documents, about 500:** `index.html`, `renderer.js`,
    `vertical-tabs.js`, `workspace-ui.js`, `overlay.html`, `overlay.js` (~190
    including its slash table), `permission.html`/`.js`, fill-status, the
    display-capture helper.
  - **Internal pages, about 1,050:** Settings ~365, Mahjong ~265, start page and
    onboarding ~155, tab import/handoff ~145, Favorites/History/Downloads/
    Shortcuts/error ~125, plus page `<title>`s, which become tab titles.
  - **Main process, about 400–450:** the app menu
    (`buildMenuForRuntime`, `main.js:7754`), `context-menu.js`,
    `tab-context-menu-model.js`, `browser-shortcuts.js` labels,
    `address-menu-model.js`, `dock-menu.js`, updater/sync/Patron/import/
    external-protocol/WebAuthn dialogs, `site-security.js` and
    `shield-model.js` copy, uBO popup/dashboard shim strings,
    `about-panel.js`.
- **Plurals:** about 38 hand-written English ternaries (e.g.
  `n === 1 ? 'tab' : 'tabs'`) and local `plural()` helpers that append "s". No
  `Intl.PluralRules`.
- **Sentence assembly:** the clearest case is
  `` `${host} wants to ${describePermission(…)}` `` (`permission.js:38`).
- **Formatting:** `toLocale*`/`Intl.*` with an `undefined` locale (follows the
  OS) in `newtab.js`, `history-groups.js`, `bookmarks.js`, `settings.js`,
  `error.js`, `overlay.js`, `mahjong*.js`. `Intl.ListFormat('en', …)` is
  hard-coded at `tab-import-open-tabs.js:375`. "Today"/"Yesterday" are
  hard-coded at `history-groups.js:13-14`.
- **Existing locale use:** only `app.getLocale()` for search suggestions
  (`main.js:7469`). No `--lang` switch, no spellcheck language calls, no `dir`
  attribute anywhere.
- **Existing shared copy:** `src/renderer/fill-status-copy.js` is a frozen UMD
  copy map served to the capsule and `require`d by main. It is the model this
  design generalizes. `copy/slash-commands.json` is the S3 first slice, which
  guards three desktop copies of slash hints and emits English-only mobile
  resources.
- **Packaging:** no `electronLanguages` restriction. Every Chromium
  `locales/*.pak` and macOS `*.lproj` ships, so Chromium's in-page widgets
  already follow the OS language.

## Architecture

### Catalog (source of truth)

```
copy/
  messages/
    en.json          source: every Blanc-authored string
    de.json          German translations + per-entry source hashes
  glossary.json      fixed and translated terms
  i18n-scope.json    every string-bearing desktop file: "pending" | "guarded"
  build.mjs          extended: build, --check, --status <locale>
  generated/         mobile resources, all locales
```

`en.json` maps a stable dotted key to an entry:

```json
{
  "island.tabCount": {
    "message": "{count, plural, one {# tab} other {# tabs}}",
    "note": "Quiet count beside the active group's dots in the resting pill.",
    "maxLength": 12
  }
}
```

- **Keys** are namespaced by surface (`island.*`, `overlay.*`, `permission.*`,
  `menu.*`, `dialog.updater.*`, `settings.*`, `newtab.*`, `mahjong.*`, …) and
  describe the slot, not the English text, so rewording English never renames
  a key.
- **`note`** gives the translator context. It is required for every entry.
- **`maxLength`** (optional) is a translation-length **lint**, not a fit
  guarantee. It caps the length of each branch's literal text, with
  placeholders and `#` counted as zero, so it constrains only what the
  translator controls. It is required on static or bounded slots (buttons,
  menu items, Settings labels, the pill's fixed words). It cannot prove that a
  message fits with an arbitrary count, hostname or title, so dynamic content
  relies on runtime containment (ellipsis plus a full-text `title`, or
  wrapping). The `en-XA` sweep and the phase 10 screenshots are the
  authoritative fit checks.

`de.json` mirrors the keys:

```json
{
  "$meta": { "locale": "de", "endonym": "Deutsch", "dir": "ltr", "status": "hidden" },
  "island.tabCount": {
    "message": "{count, plural, one {# Tab} other {# Tabs}}",
    "source": "sha256:…"
  }
}
```

- **`source`** is `sha256(message + "\u0000" + note)` of the English entry the
  translation was made from. Hashing the note too means a change in meaning
  context also flags the translation. When either changes, the hash no longer
  matches and the entry is stale.
- **Only an explicit acknowledgement advances `source`.** `npm run copy:ack --
  de <key> [<key> …]` stamps the current English hash on exactly the named
  entries, after their German has been written or confirmed. It has no
  all-keys or all-stale mode. `copy:build` and `copy:check` read `source` but
  never write it, so a routine build can never make an outdated translation
  look current. An entry without `source` counts as missing.
- **`$meta.status`** is `hidden` until the unhide gate passes, then
  `selectable`. Only `selectable` languages can be chosen or resolved.
- **`$meta.dir`** is `ltr` or `rtl`. Only `ltr` languages ship in this project.

`slash-commands.json` is folded into `en.json` as `slash.<command>.hint` (and
`slash.<command>.doc` where it diverges today, e.g. `/group`). The command
name itself is a fixed glossary term and is never a message.

`glossary.json`:

```json
{
  "fixed": ["Blanc", "Blanc Blocker", "Blanc Patron", "Patron", "uBlock Origin",
            "1Password"],
  "fixedPatterns": ["(?<![\\w/:])/[a-z][a-z0-9-]*", "⌘", "⌥", "⇧", "⌃"],
  "terms": {
    "Quiet Tabs": { "de": { "form": "Ruhende Tabs", "stem": "uhend" } },
    "Favorites":  { "de": { "form": "Favoriten", "stem": "Favorit" } }
  }
}
```

The rule is the owner's decision: brand names, slash command names and the
macOS modifier symbols are fixed. Windows/Linux key *words* are not: German
keyboards print "Strg" for Ctrl, so the hand-formatted shortcut text
(`main.js:7627`, the Shortcuts page) takes its key words from catalog entries
(`key.ctrl`, `key.shift`, …) while the key letters stay as they are. Electron's
own accelerator rendering in native menus is not Blanc's to translate.
Beyond those, descriptive feature names (Quiet Tabs, Favorites, Profile
Sync, Named Workspaces, Quick Switcher) are translated with a pinned form.
Coined names that sit between the two ("Island", "Glance") are listed for
explicit owner confirmation in the foundation PR. Any later change to the
glossary needs a recorded reason, because it changes every language.

### Message format

A deliberate subset of ICU MessageFormat:

- `{name}`: plain placeholder.
- `{count, plural, one {…} other {…}}`: plural on a numeric argument, with
  `#` meaning the locale-formatted number. Branch selection uses
  `Intl.PluralRules(locale)`. Exact-value branches (`=0 {…}`) are allowed.
  `other` is required.
- `<0>…</0>`, `<1>…</1>`: numbered tags for rich text (see
  [Applying strings to the DOM](#applying-strings-to-the-dom)).
- Apostrophe escaping follows ICU (`''` for a literal apostrophe). `{` and `}`
  cannot appear literally.

Not supported: `select`, `selectordinal`, nesting, and number/date skeletons
inside messages. Dates and numbers are formatted in code with `Intl` and
passed in as placeholders. If a future language needs `select` (e.g.
grammatical gender), that is a reviewed extension of the formatter, not an
ad-hoc workaround.

**Sentences are never assembled from fragments.** A sentence with variable
parts is one message with placeholders. Where the variable part changes the
grammar, each variant is its own message. For example,
`permission.prompt.camera`, `permission.prompt.microphone` and so on replace
`"${host} wants to ${verb}"`.

### Formatter (`src/renderer/pages/i18n.js`)

A pure UMD module, like `fill-status-copy.js`, with no DOM, no IPC and no
Electron. It is loaded by every renderer document and `require`d by main.

- `createTranslator({ locale, messages, fallback })` returns `t(key, params)`.
- **Lookup:** the active locale's message, else the English message, else, for
  a missing key, the key itself. A missing key is a bug the check should have
  caught, so dev and test builds log once per key and `BLANC_TEST` runs throw.
- **Output is always plain text.** Tag-bearing messages go through a separate
  `tParts(key, params)` that returns `[{ text } | { tag: n, text }]`, so no
  caller can interpolate a message into HTML.
- Parsed messages are cached per key.

### Generated runtime catalogs

`npm run copy:build` writes one data-only file per known locale (including
the hidden ones, so a test hook can exercise them):

```
src/renderer/pages/strings.en.js
src/renderer/pages/strings.de.js
src/renderer/pages/strings.en-XA.js   pseudo-locale, see Testing
```

Each file sets `self.blancStrings = { locale, dir, messages }` and also does
`module.exports` (UMD). They live flush in `src/renderer/pages/` because
`pages.js` can only serve flat files from that one directory. Main loads the
same files, so there is exactly one runtime copy of every string. They are
generated files: they are never hand-edited, and `copy:check` fails if they
are stale.

Mobile output (`copy/generated/`) becomes per-locale `Localizable.xcstrings`
(iOS: one file, all locales, plural variations) and per-locale
`values[-de]/strings.xml` + `plurals` (Android). `SlashCommands.strings` and
`slash_commands.xml` are retired in favor of these.

### Language setting

- `uiLanguage`: `"system"` or a locale code from the catalog. Default
  `"system"`.
- **Device-local:** not in `SYNCED_KEYS` (`settings.js:52`). A synced change
  would arrive on a running device that cannot apply it without a relaunch.
- `settings-schema/schema.json` gains a `uiLanguages` enum, generated from the
  catalog's selectable locales, with endonym labels plus the `uiLanguage`
  setting entry. `settings:check` keeps the two in lockstep.
- **One writer.** `uiLanguage` is **not** admitted by `sanitize()`, so the
  generic `pages:settings:set` path (`pages.js:352`), and any other
  `setSettings()` caller, cannot change it. It is written only by a dedicated
  `settings.setUiLanguage(code)`, following the existing
  `setSupporter()`/`setPatron()` pattern of fields kept outside the whitelist.
  It accepts `system` or a currently selectable locale and persists with an
  immediate flush. The language-transition service described under
  [Settings picker and relaunch](#settings-picker-and-relaunch) is its only
  caller.
- **Stored values survive hiding.** Load-time normalization keeps any stored
  value that is `system` or a well-formed language code (`^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$`),
  even one naming a hidden or removed language, and resets only malformed
  values to `system`. So hiding a language never destroys a user's choice; how
  a stored hidden language renders is set by the resolver below.

### Resolving the active language

New `src/main/i18n.js`. Its resolution logic is a pure function with no
Electron import, so it is unit-testable; a thin wrapper reads Electron.

```
resolveLocale({ setting, preferred, selectable }) → { locale, dir, source }
```

Three distinct branches, in order:

1. `setting` is a selectable locale → that locale (`source: "setting"`).
2. `setting` is `"system"` → the first entry of
   `app.getPreferredSystemLanguages()` whose primary subtag matches a
   selectable locale (`de-AT` → `de`). If none matches → `en`
   (`source: "system"`).
3. `setting` is any other stored value (a hidden or removed language) → `en`
   (`source: "unavailable"`). It never falls through to System resolution:
   the user pinned a specific language, so Blanc must not quietly substitute
   a different non-English one. The stored value is untouched, so the choice
   comes back if that language becomes selectable again. While it is in
   effect, the picker shows **English** as the current value with no relaunch
   prompt.
- It runs once, at `ready`, before the first window is created. The result is
  frozen for the life of the process (`activeLocale()`). No code path
  re-resolves it. That is what makes relaunch-to-apply sound.

**Formatting locale** = the UI language plus the OS region from
`app.getSystemLocale()` when one is present (`de` + `AT` → `de-AT`; `en` +
`GB` → `en-GB`). Every `toLocale*`/`Intl.*` call that passes `undefined` today
passes this value instead (renderers read it from `blancStrings`). For anyone
whose UI language matches their OS language, which is everyone today, dates
and numbers render exactly as they do now.

### Delivering strings to documents

Every `blanc-chrome://` document (`index`, `overlay`, `permission`,
`fill-status`, `display-capture-helper`) and every `blanc://` page loads, in
`<head>`, before any other script:

```html
<script src="i18n.js"></script>
<script src="strings.js"></script>
```

- **`blanc-chrome://`:** `/i18n.js` and `/strings.js` join `SHARED_ASSETS` in
  `chrome-protocol.js`. `/strings.js` resolves to
  `pages/strings.<activeLocale>.js` through one exact-name branch. The
  handler's existing rejection of query strings, hashes, credentials and ports
  is unchanged.
- **`blanc://`:** in `serveBlanc` (`pages.js`), the exact basename `strings.js`
  maps to `strings.<activeLocale>.js` before the existing `^[\w.-]+$` check
  and `PAGES_DIR` join. Every other name resolves as today. Fetching
  `strings.de.js` directly is harmless: it holds the same public strings.
- **No new renderer IPC carries strings,** and CSP is unchanged (`script-src
  'self'` already allows both files).
- The locale is frozen per process, so there is no cache invalidation to
  design.

### Applying strings to the DOM

- Static HTML keeps its English text inline, so English renders even if the
  script fails and the files stay readable. Each localizable node carries
  `data-i18n="key"`, and attributes use `data-i18n-title`,
  `data-i18n-aria-label`, `data-i18n-placeholder` and `data-i18n-alt`.
  `copy:check` verifies that the inline English equals `en.json`.
- A small applier in `i18n.js` (`applyDocument(root)`):
  - sets `document.documentElement.lang` and `dir` from `blancStrings`
  - walks `[data-i18n*]` nodes, setting text with `textContent` and attributes
    with `setAttribute`, never `innerHTML`
  - maps the `<n>` tags of a rich message onto the element's existing child
    elements in order (setting their `textContent`), keeping the elements, so
    links and buttons keep their listeners and attributes
- **No flash of English:** for a non-English locale, the head script adds
  `html.i18n-pending`, which a one-line rule in the document's stylesheet
  (`.i18n-pending body { visibility: hidden }`) hides until `applyDocument`
  runs at `DOMContentLoaded` and removes the class. Chrome documents load once
  per window, so this costs one frame at window creation. English documents
  skip it entirely.
- JS-built strings call `t(key, params)` and assign the result with
  `textContent` or `setAttribute`.
- Page `<title>`s are localized the same way. They become tab titles and
  persist in `session.json` `meta` in the language active when saved, which is
  acceptable: they refresh on the next load.

### Main process

`src/main/i18n.js` exposes `t()` over the same generated catalog for:

- menus: every label in `buildMenuForRuntime`, `context-menu.js`,
  `tab-context-menu-model.js`, `address-menu-model.js`, `dock-menu.js`,
  `workspace-context-menu-model.js`, and `browser-shortcuts.js` command labels,
  which also feed the Shortcuts page
- dialogs: updater, sync, Patron, import, external protocols, Linux sandbox,
  WebAuthn, the `showOpenDialog` title, and the fill native fallback
- structured copy sent to renderers: `site-security.js`, `shield-model.js`,
  `about-panel.js`, and the "New Tab" fallback title. Where main sends
  English text to a renderer today, it either sends a key plus params or the
  already-translated text. Each extraction PR picks one per channel and records
  it in the contract.

**`role:` menu items get explicit catalog labels** wherever Electron allows a
label override, so Blanc never mixes Electron's built-in English role labels
with translated ones.

**Known limitation (macOS):** AppKit injects some menu items itself (Services,
Start Dictation, Emoji & Symbols, Enter Full Screen). These follow the OS
language and the bundled `.lproj` set, not `uiLanguage`. A German Mac with
English pinned shows those few items in German. This is accepted and
documented; restricting `electronLanguages` was rejected because it would
change Chromium's in-page widget language for every non-shipped OS language.

### What stays on the OS language (unchanged)

- The `Accept-Language` Chromium sends to websites.
- Search-suggestion requests (`app.getLocale()` → `search-suggestions.js`).
- Chromium's own in-page UI: form-validation bubbles, `<select>`, date and
  colour pickers, the PDF viewer.
- Spellcheck.

Blanc does **not** pass `--lang`. Changing it would alter what websites see
and is out of scope. If a future need arises, it gets its own privacy review.

### Settings picker and relaunch

- Settings → General → **Language**. The row renders only when the catalog
  has more than one selectable language. Until German unhides, nobody sees it.
- Options: **System (Deutsch)** (the label names what System currently
  resolves to), then every selectable language by endonym: **English**,
  **Deutsch**.
- Beneath the control, in the active language: "Translations are
  machine-generated." This is the honest disclosure for the no-reviewer
  decision.
- Choosing a value that differs from this launch's resolved language shows
  **Relaunch to apply**. It uses the existing `createAppRestarter`
  (`src/main/app-restart.js`) in the same set → flush → restart order as
  `chrome:blocking-provider` (`main.js:7297`). Page Leave/Stay prompts still
  win, and a cancelled relaunch leaves the setting saved for the next launch.
  Choosing the value that matches the current language shows nothing.
- **One language-transition service** (`changeUiLanguage(code, { restart })`
  in `src/main/i18n.js`, wired from `main.js`) owns the whole transition:
  validate against the selectable set, `settings.setUiLanguage()`, confirm the
  flush succeeded (restoring the previous value and returning `false` if not),
  then call `restartApp()` when `restart` is true and the new value resolves
  differently from this launch's language. Every entry point calls it; none
  writes the setting directly.
- `pages:settings:get` gains `uiLanguage`, the selectable list
  (`{ code, endonym }`), and the resolved `activeLanguage`. The only renderer
  write path is a new settings-host-only `pages:settings:language` handler
  (`(code, restart) → boolean`) that calls the transition service. Because
  `sanitize()` does not admit `uiLanguage`, a `uiLanguage` field in a
  `pages:settings:set` patch is silently dropped like any other unknown key.
  The preload, `pages.js` handler and `browser-api/bridges.json` change
  together, then `npm run browser-api:build` and
  `npm run audit-inventory:write`.

### Layout and CSS

- German overflow is fixed with existing patterns: ellipsis plus a full-text
  `title`, or wrapping where the surface allows. `maxLength` lints the static
  slots; containment handles everything dynamic. Type is never shrunk.
- `permissionViewBounds()` (`main.js:2963`) assumes a two-line prompt at a
  fixed 84 px. The host name is dynamic, so a `maxLength` cannot make it fit.
  The prompt must contain its text (the host truncated with an ellipsis, the
  full host in `title`) or derive the view height from the rendered height.
  The choice is made in phase 2 against the longest German prompt and a long
  host.
- CSS that an extraction PR touches moves to logical properties
  (`margin-inline-start`, `inset-inline-end`, `text-align: start`). There is no
  sweep over untouched CSS; that belongs to the future RTL project.
- `text-transform: lowercase` (3 uses in `styles.css`, 1 in `pages.css`) stays;
  setting `lang` makes case mapping locale-correct.

### Security and privacy

- Translated text reaches the DOM only through `textContent` and
  `setAttribute`. Messages cannot contain HTML; rich text uses numbered tags
  mapped onto existing elements.
- Catalog entries are fixed strings. Like `FILL_COPY`, nothing in a catalog may
  embed page-, vault-, account- or user-derived data. Such data enters only as
  placeholder values at call time.
- The protocol changes add exactly one name mapping per handler. No new
  directory becomes servable and no traversal path opens.
- No runtime network access: translations are bundled. No telemetry records
  the language. (Adding the resolved language to `/ping` would be a separate
  telemetry decision and is out of scope.)

## Translation workflow

Translation is AI-only with no human reviewer, so CI carries the checks a
reviewer would otherwise make:

1. **The PR that changes English changes German.** Editing or adding an
   `en.json` entry requires the matching `de.json` entry in the same PR. The
   agent writing the change also writes the German. For `selectable`
   languages, `copy:check` fails on a missing or stale entry. For `hidden`
   languages it warns, so the extraction phases can land incrementally.
2. **`npm run copy:status -- de`** lists missing and stale keys, with their
   English and `note`, as the agent's worklist.
3. **`npm run copy:ack -- de <keys…>`** acknowledges exactly the entries the
   agent has just translated or confirmed, advancing their `source` hash.
   **`npm run copy:build`** then regenerates the runtime and mobile files. It
   never touches `source`.
4. **Mechanical checks** (`copy:check`):
   - placeholder names and plural branches match English (`other` is always
     present)
   - numbered tags match English, in count and nesting
   - every `fixed` term and `fixedPatterns` match in the English appears
     verbatim in the translation
   - for every glossary `terms` entry present in the English, the translation
     contains its `stem`
   - `maxLength` holds for every branch's literal text (a lint; see the
     catalog section)
   - no translation is identical to its English, except entries whose English
     consists only of fixed terms, symbols or placeholders, or that appear in a
     small `sameAsSource` allowlist
5. **Escape hatch:** English is always one click away in the picker, and the
   picker shows endonyms, so a user who lands in a poor translation can always
   find "English".

Nothing calls a translation API at build time or at runtime.

## Coverage guard and phases

### `copy/i18n-scope.json`

This file lists every desktop file that contains user-visible strings, each
marked `pending` or `guarded`. The foundation PR seeds it from a repository
survey. A PR that adds a new string-bearing file must list it.

For **guarded** files, `copy:check` fails on hard-coded English:

- **HTML:** any non-whitespace text node or `title`/`aria-label`/
  `placeholder`/`alt`/`data-tooltip` attribute without a matching
  `data-i18n*` attribute.
- **JS:** a string or template literal containing letters assigned to
  `.textContent`, `.title`, `.placeholder`, `ariaLabel`, `setAttribute('title'
  | 'aria-label' | 'placeholder', …)`, or used as a `label:`, `message:`,
  `detail:`, `title:` or `buttons:` value in main. This is a heuristic
  line-anchored scan in the substrate style, not a parser.
- A short reviewed allowlist covers symbols (✕, ·, →), brand-only strings and
  non-user-visible literals. Each allowlist entry carries a reason.

The **pseudo-locale sweep** is the runtime check of the same thing (see
[Testing](#testing)). Coverage is proven when every file is `guarded` and the
sweep is green.

### Phases

Each phase is one or more ordinary PRs. German stays `hidden` throughout, so
users see no change until phase 10. Every extraction PR adds the German for its
strings and moves its files from `pending` to `guarded`.

1. **Foundation:**
   - formatter, catalog files, glossary, `copy:build`/`check`/`status`
   - generated runtime catalogs (`en`, `de` skeleton, `en-XA`)
   - `strings.js`/`i18n.js` serving and the `uiLanguage` setting with schema
     and contract
   - `<html lang>` from the catalog, the head scripts in every document
   - `src/main/i18n.js` resolution, the formatting locale passed to existing
     `Intl` calls
   - the picker and relaunch wiring (present but unrendered while only English
     is selectable)
   - `i18n-scope.json` seeded with every file `pending`
   - `slash-commands.json` folded in
   - the `en-XA` sweep script
2. **Chrome:** `index.html`, `renderer.js`, `vertical-tabs.js`,
   `workspace-ui.js`, `tab-drag.js`, `permission.html`/`.js`, the fill capsule
   (`FILL_COPY` moves into the catalog; `fill-status-copy.js` becomes a thin
   adapter over `t()` or is removed), the display-capture helper.
3. **Overlay:** `overlay.html`, `overlay.js` (including the slash table and the
   tab-switcher, Quick Switcher, panel and find copy).
4. **Main process:** menus, dialogs, shield and site-security copy, the About
   panel, the "New Tab" fallback.
5. **Settings page:** `settings.html`, `settings.js`, `settings-*-model.js`.
6. **Start page:** `newtab.*`, `onboarding.js`, wallpaper copy, `error.html`/
   `error.js`.
7. **Utility pages:** Favorites, History (including "Today"/"Yesterday"),
   Downloads, Shortcuts, tab import/handoff (including the hard-coded
   `ListFormat('en')`), `sheet.js`.
8. **Mahjong:** `mahjong.html`, `mahjong.js`, `mahjong-state.js`. Tile faces
   are glyphs and stay as they are.
9. **uBO shims:** the Blanc-authored strings in
   `ublock-popup-mainworld.js`/`ublock-dashboard-mainworld.js` only.
   uBlock Origin's upstream UI keeps its own `_locales` handling and is never
   edited (`ublock/upstream/` is untouchable).
10. **Unhide German.** The PR that flips `de.json` `$meta.status` to
    `selectable` must show:
    - `i18n-scope.json` with no `pending` file
    - `copy:check` green with German `selectable` (no missing or stale entry)
    - the `en-XA` sweep green
    - German screenshots of the main surfaces (resting pill, ⌘L panel with
      groups, shield popover, a permission prompt, Settings, start page in
      all four layouts, a utility sheet, the app menu), inspected for **fit**
      (truncation, overlap, clipping), not translation quality
    - `spec/` F44 desktop status moved to SHIPPED

    German then reaches users in the next normal release.

The order of phases 2–9 can change. Only phase 1 must come first and phase 10
last.

## Testing

**Unit (`test/unit/`):**

- **Formatter:**
  - placeholders, apostrophe escaping
  - plural selection for `en` and `de` (`one`/`other`, `=0`), and `#` formatting
    per locale
  - tags and `tParts`
  - fallback order (active → English → key), and throw-on-missing under
    `BLANC_TEST`
- **`resolveLocale`:**
  - an explicit setting
  - `system` with `de-AT`, `de-CH`, `fr-FR`, then `de`, and an empty list
  - a stored hidden or removed locale resolves to `en` with `source:
    "unavailable"` even when the preferred list contains a selectable locale
    (stored `fr`, preferred `de-DE`, `de` selectable → `en`, not `de`)
  - the formatting-locale composition with and without a region
- **Settings:**
  - `sanitize()` drops `uiLanguage`, so `setSettings({ uiLanguage: 'de' })` and
    a `pages:settings:set` patch carrying it leave the stored value unchanged
  - `setUiLanguage()` accepts `system` and selectable locales only, and flushes
  - load-time normalization keeps a well-formed hidden value and resets a
    malformed one to `system`
  - `uiLanguage` is absent from `SYNCED_KEYS`
- **Language-transition service:** a failed flush restores the previous value
  and returns `false` without restarting; `restart: false` never restarts;
  `restart: true` restarts only when the resolved language changes.
- **`copy:ack` and staleness:**
  - `copy:build` and `copy:check` leave every `source` byte-identical (run
    build on a catalog with a stale entry and assert it is still stale)
  - `copy:ack` advances only the named keys and refuses unknown keys
  - changing only an English `note` makes the translation stale
- **Protocol mapping:** `/strings.js` resolves to the active locale's file in
  both handlers; nothing else changes resolution; traversal and query
  attempts still 404.
- **`copy:check` positive controls:** fixture catalogs and source files that
  must fail, one per rule: hard-coded text node, hard-coded `textContent`
  literal, stale hash, dropped placeholder, extra plural branch, missing
  `other`, tag mismatch, missing fixed term, missing stem, `maxLength` overflow,
  a `selectable` locale below 100%, inline HTML English differing from
  `en.json`. Each test also asserts that its fixture was actually scanned, so
  a rename cannot make the guard pass silently.

**Contract:** `npm run browser-api:check` covers the new `pages:settings:get`
fields and the `pages:settings:language` handler. `npm run settings:check`
covers the schema.

**Desktop:**

- **New F44 Gherkin scenarios** in `spec/acceptance/` with desktop step
  definitions:
  - **System resolves:** with system languages `de-DE`, the chrome, ⌘L panel,
    Settings and the app menu render German.
  - **Pinned English wins:** with system languages `de-DE` and `uiLanguage:
    "en"`, everything renders English.
  - **Picker relaunch:** choosing Deutsch shows Relaunch to apply. After a
    relaunch the UI is German and the setting persisted.
  - **Unavailable pinned language:** with system languages `de-DE`, German made
    selectable by the test override, and a stored `uiLanguage` of `fr` (not in
    the catalog), the UI renders **English**, not German, and the stored `fr`
    is still in `settings.json` after quit.
  - **Websites unaffected:** `Accept-Language` sent to a local test server is
    unchanged by `uiLanguage`.

  System languages are injected through a new test-only
  `BLANC_TEST_SYSTEM_LANGUAGES` env, honored only behind the existing
  `!app.isPackaged && BLANC_TEST === '1'` gate. A further test-only
  `BLANC_TEST_LOCALE_STATUS` override can make a hidden locale selectable, so
  these scenarios run before German unhides.
- **`npm run test:i18n:desktop`** (a standalone smoke, like the wallpaper
  smoke) launches with the pseudo-locale `en-XA`. It visits the resting pill,
  ⌘L panel, slash list, find, shield popover, a permission prompt, the
  fill capsule (macOS), every `blanc://` page and utility sheet, the start
  page's four layouts and Mahjong, and captures the native menu templates
  through the test hook. It fails on any visible text node or labelled
  attribute that lacks pseudo-locale markers, outside the allowlist.
  `en-XA` is a build-time-generated locale (accented, ~40% longer, wrapped in
  `⟦ ⟧`), selectable only through the test hook and never shown in the picker
  or accepted by `sanitize`.
- **Per PR:** targeted unit tests, `substrate:check`, and the smoke for the
  surfaces it touched. The full desktop acceptance suite runs only when the
  owner asks or at release.

## Spec and parity (`spec/`)

- **F44 Interface language** (`features.md`, `parity-matrix.md`).
  - **Contract:** all Blanc-authored UI text comes from the shared catalog;
    brand names and slash command names are never translated; a missing
    translation falls back to English text, never to a key; the user can use a
    supported language different from the OS language; web-facing language
    signals are unaffected by the UI language.
  - **Status:** desktop PLANNED (SHIPPED at phase 10's release); iOS and
    Android PLANNED.
- **D27 Language picker location** (`divergence-register.md`, Features: F44).
  Desktop offers an in-app picker with relaunch-to-apply. iOS uses the system
  per-app language screen (Settings → Blanc → Language) and Android 13+ uses
  per-app language preferences (`LocaleManager`), because both platforms
  provide this natively and apply it to their own system UI too. The parity
  contract that still holds: same catalog, same fixed terms, same fallback,
  same selectable set.
- **`shared-substrate.md` S3** records that the copy substrate is now the full
  message catalog with per-locale mobile output, superseding the "first slice"
  note.
- `spec/acceptance/` gains the F44 feature file.

## Documentation

- `copy/README.md`: the catalog model, message format, glossary, the
  translate-in-the-same-PR rule, `copy:status`/`build`/`check`, the
  `i18n-scope.json` lifecycle and the unhide gate.
- `CLAUDE.md` and `AGENTS.md`: one new architecture paragraph, mirrored
  verbatim and compared with `cmp`. It covers the catalog as single source,
  `strings.js` delivery, the device-local `uiLanguage` with relaunch-to-apply,
  what stays on the OS language, the hard-coded-English guard, and "never
  `innerHTML` a message". The "Cross-platform parity infrastructure" section
  notes that S3 now covers all UI copy.

## Marketing and release

- No interface-language claim anywhere (site, social, press, release notes)
  until a public release ships German as `selectable`. Before that, the claims
  ledger has nothing to back it.
- From that release on, claims follow `docs/marketing-claims.md` and say the
  translation is machine-generated ("Blanc's interface is available in German
  (machine-translated)").
- Phase 10's release notes tell German-OS users their interface will switch,
  and how to switch back to English (Settings → General → Language).
- Release gates, updater handoffs and the freeze/soak rules are unchanged.

## Out of scope

- Right-to-left languages (a future project, with a mirroring pass over the
  Island, sheets and menus and an RTL CSS sweep).
- Any language beyond German.
- Localizing the website (`site/`).
- Web-page translation (F43, paused).
- Changing `Accept-Language`, passing `--lang`, or restricting
  `electronLanguages`.
- Translating uBlock Origin's upstream UI.
- Human translation review (the owner may add it later; the `source`-hash
  model already supports a review status per entry if needed).
- Live language switching without a relaunch.

## Risks

- **Translation quality without a reviewer.** Mitigated by the glossary, the
  mechanical checks, the disclosure line, and English being one click away.
  The residual risk is accepted by the owner.
- **Size of the extraction.** About 2,000 strings across ~60 files. Mitigated
  by phases that each leave the app shippable and English unchanged, with the
  scope file making remaining work visible.
- **Guard heuristics miss a pattern.** The source scan is a heuristic. The
  pseudo-locale sweep is the backstop for anything that renders.
- **German breaks a tight layout.** The phase 10 screenshot inspection and
  `maxLength` catch it before users do; `en-XA`'s ~40% expansion catches most
  of it earlier.
- **Test-hook drift.** `BLANC_TEST_SYSTEM_LANGUAGES` and
  `BLANC_TEST_LOCALE_STATUS` are honored only behind the existing
  unpackaged-plus-`BLANC_TEST` gate, and a unit test asserts that packaged
  builds ignore them.
