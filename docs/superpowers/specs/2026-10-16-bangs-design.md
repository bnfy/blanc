# Bangs

October 16, 2026. **Status: design, awaiting owner review.** Nothing here is
built yet.

## Why

A bang is a shortcut typed in the address bar that searches one site
directly: `!w golden retriever` opens Wikipedia's article, `!yt lofi` opens
YouTube's results, `!a usb cable` opens Amazon's. People who use them use
them dozens of times a day and will not switch to a browser without them.

Today bangs work in Blanc only when the search engine is DuckDuckGo or Kagi,
because those sites read the `!` on their end. With Google, Bing or a custom
engine such as SearXNG, `!w golden retriever` searches for that text
literally. Even on DuckDuckGo or Kagi, the words first travel to the search
engine before it sends you on.

Helium handles bangs inside the browser, so they work with every search
engine and the words go straight to the site. The Reddit commenter who asked
for Kagi and SearXNG (delivered in 1.34.0 through
[`2026-10-14-kagi-and-custom-search-design.md`](./2026-10-14-kagi-and-custom-search-design.md))
said on October 16 they might make Blanc their main browser once it has what
Helium has. Bangs are the first and best-fitting gap on that list; see the
memory note `blanc-helium-gap-2026-10-16`.

## Decisions (owner, October 16, 2026)

1. **Bangs resolve inside Blanc, for every search engine.** The bundled list
   is Kagi's open one. A bang never passes through the search engine.
2. **The Island shows a hint row** while a bang is typed, and **a picker**
   when `!` alone is typed: bangs used recently first, then a short popular
   set; typing more letters filters the whole list by code and site name.
3. **People can add their own bangs in Settings**, with a code, a name and
   an address holding `%s`. A custom bang with the same code as a built-in
   one replaces it; Settings says so.
4. **The on/off switch syncs** with the other synced settings, like the
   search engine choice.
5. **Portable to another browser core.** The bang logic is one pure module
   and one data file with no Electron or Node dependency, so an Island
   running as the same web page code inside a Chromium build takes both
   unchanged. This spec needs nothing from the Chromium prototype branch
   (`codex/chromium-extension-spike`, whose record is PR #873) and does
   not change the Electron direction recorded in `CLAUDE.md`; it only
   keeps the door open.

Mock-ups the owner reviewed on October 16:
`.superpowers/brainstorm/96339-1792200860/content/bangs-island.html`
(not committed). From its options, the hint row reads like a slash command
(code first, then a plain sentence) and the picker uses folded section
headers; both are my calls, taken because the owner approved the page as a
whole without choosing between the variants.

## What the user sees

### Typing a bang

In the ⌘L panel (and the vertical tab rail's input, which is the same
input), typing `!yt lofi` puts one row at the top of the list, in the slot
the search row normally takes:

```
!yt   Search YouTube for “lofi”                      ↵
```

The code is drawn like a slash command name (accent ink), the sentence in
dim ink. The rows below it are today's Quick Switcher matches for `lofi`
(open tabs, favorites, history), so a local match is still one arrow away.
No search-engine suggestions are requested while a bang is present (see
*Privacy*).

Enter opens YouTube's results for `lofi` in the current tab, exactly as
Enter on the search row would have opened the search engine. The bang works
at either end of the text: `lofi !yt` behaves the same. Codes are matched
without regard to case (`!YT` is `!yt`).

`!yt` alone, with no words, shows the hint row *Open YouTube* and Enter
opens the site's front page (`youtube.com`). Because `!yt` is also a prefix
of longer codes, the picker's filtered rows follow the hint row; Enter takes
the hint, a picker row has to be chosen.

A bang Blanc does not know (`!zzz lofi`) shows no hint row and Enter
searches the whole text with the usual engine; DuckDuckGo and Kagi may still
honour it on their side, as they do today.

**One decision, made once.** A token is a bang when it starts with `!`
followed by a code (a letter or digit, then up to 31 letters, digits,
hyphens or underscores) and stands at the start or the end of the text. The
first token wins: `!w cats !yt` searches Wikipedia for `cats !yt`. When the
code is known (custom or built-in) and bangs are on, the bang wins over
every address rule in both processes: the overlay checks `parseBang` before
`looksLikeAddress`, main checks it before `normalizeAddressInput` (and
after `handOffToOs`, which keys on the raw text's own scheme). The words
after the code are never read as an address, so `!yt foo.html` searches
YouTube for `foo.html` and shows the hint row, where the overlay's
HTML-path guard alone would have called it an address. When the code is
unknown, or bangs are off, both processes run their existing rules on the
whole text unchanged. Paired unit tests feed the same inputs to both
classifiers (HTML-looking words, URLs, unknown schemes, `site:` searches,
IPs, `localhost`) and assert they agree.

### The picker

Typing `!` alone lists bangs:

```
› recent  3
!gh   GitHub                        github.com          ↵
!k    Kagi                          kagi.com
!r    Reddit                        reddit.com
› popular  20
!w    Wikipedia                     wikipedia.org
!yt   YouTube                       youtube.com
!a    Amazon                        amazon.com
…
```

The headers reuse the panel's group-header look (`island-ghead`) but are
their own small component: they are not bound to a tab group, carry no key
cap or drag handle, and their fold state lives in the overlay for the
window's lifetime, nowhere else. *recent* holds the last ten bangs used on
this device, newest first, and is absent until one has been used. *popular*
is a fixed set of about twenty well-known sites, in a fixed order, listed in
`bangs/popular.json` (my call on the members; the builder may adjust for
sites that have since closed).

Typing after the `!` (`!y`) filters the whole list, at most eight rows. If
the typed code is itself a known bang (`!y` is Yahoo), its hint row comes
first and Enter takes it. Below that, in this order: recent bangs whose code
starts with the letters, then popular ones, then other codes starting with
the letters (shorter codes first, then alphabetical, so `!yt` beats `!ytm`
and both beat `!yahoo`), then site names containing the letters. Each bang
appears once; the earliest section that holds it keeps it. Kagi's data has
no popularity rank, so this order is the whole ranking. Choosing a picker
row (click or Enter) does not navigate: it fills `!yt ` into the input, with
the cursor after the space, so the words come next. Bangs added in Settings
appear in these lists like any other, with *yours* in place of the domain.
A bang is matched and listed by its primary code and its aliases, and
always shown by its primary code.

### Settings

**Settings → General → Search engine** gains, under the engine and the custom
address:

- **Bangs** — a switch, on by default. Hint: *Type `!` followed by a site's
  code to search that site directly, for example `!w` for Wikipedia or `!yt`
  for YouTube. Type `!` alone to see them. It syncs with your other
  settings.* Off hides the hint row and the picker and makes Enter search
  the text as typed.
- **Your bangs** — a short list with a code, a name and an address, plus
  *Add* and per-row *Remove*. The address rule is the custom search
  address's: `https://` to any server, `http://` only to this computer or
  the home network, exactly one `%s` after the host and port, at most 2048
  characters. The code follows the parser's grammar above (a letter or
  digit, then up to 31 letters, digits, hyphens or underscores), stored
  lowercase; the name is one to 60 characters. A row whose code is already
  a built-in bang's primary code or alias shows *Replaces the built-in !a
  (Amazon)* and is accepted: the custom bang shadows that one code or alias
  only, and the built-in stays reachable by its other codes. Up to 100 custom bangs. The list syncs as one value, the way
  the ad-blocking site exceptions do: the device that saved last wins, so
  bangs added on two devices before they sync are not merged. The hint
  under the list says *Syncs with your other settings; the device that
  saves last wins.*

### Shortcuts page and onboarding

`blanc://shortcuts` gains one line, *`!code words` searches one site
directly; `!` alone lists them*, next to the slash-commands section (the
page has no address-bar section; the builder places it in the category that
reads best). Onboarding does not change.

### Private tabs

Bangs work in private tabs. A bang used from a private tab is not added to
*recent*.

## How it works

### The data

A new root directory `bangs/`, built like `adblock/` and the other
substrates:

- `bangs/sources/bangs.json` — Kagi's `data/bangs.json`, committed verbatim
  (about 2.2 MB, 10,907 entries on October 15, 2026). Kagi's
  `data/kagi_bangs.json` (Kagi-internal bangs such as image and region
  search) is not taken.
- `bangs/pinned.json` — the upstream commit, the file's SHA-256 and the date,
  like `adblock/sources/pinned.json`. Updating the list is a reviewed
  release input: change the pin, run `npm run bangs:build`, commit the
  source and the generated file together. `npm run bangs:check` joins
  `substrate:check`.
- `bangs/popular.json` — the popular set: an ordered array of codes.
- `bangs/excluded.json` — codes Blanc leaves out, with a one-line reason
  each. Empty to start. Kagi's categories do not mark adult, torrent or
  similar sites (none of its 158 subcategories names them), so there is no
  rule to exclude by; this file is where the owner removes a site they do
  not want listed inside Blanc. Naming a primary code drops the whole
  entry; naming an alias drops that alias. The whole list ships otherwise.
- `bangs/build.mjs` — generates `src/renderer/bangs-catalog.js`, a compact
  array of `[code, aliases[], name, domain, template, encoding, home]`:
  - `template` is Kagi's `u` with `{{{s}}}` rewritten to `%s`, so custom
    bangs (which people write with `%s`) and built-ins read the same way.
  - `encoding` is a small integer carrying the two Kagi `fmt` flags about
    the words: encode them or not, and `+` or `%20` for spaces. Kagi's
    README says every flag is on by default and an entry's `fmt` lists the
    ones it keeps; the builder confirms that reading against Kagi's `spec/`
    tests and encodes the defaults so an absent `fmt` means "all on".
    Custom bangs always use the defaults.
  - `home` is the complete address an empty query opens, computed and
    validated at build from the other two `fmt` flags: the template's base
    path (`open_base_path`), the snap domain `ad` (`open_snap_domain`), or
    otherwise `https://<domain>`. The resolver never derives it at run
    time. A custom bang's home is its address's origin (scheme, host and
    port, so a local `http://` server keeps its port).
  - Entries are dropped at build when the template is not `https://` (or
    `http://` to a local-network host, the custom search address's rule,
    checked with `isValidSearchTemplate` from `src/main`, which the Node
    build may import), when `%s` would land in the host, when the entry
    has a regex (`x`; three on October 15), when the code contains a `.`
    (60 on October 15: a dotted code reads as a domain to
    `looksLikeAddress` and `normalizeAddressInput` and would navigate to
    `https://!foo.bar`), or when `excluded.json` names it. Aliases that
    contain a `.` are dropped individually. The build prints what it
    dropped and why.
- The generated catalog is served to the overlay over `blanc-chrome://`
  (`chrome-protocol.js` allowlist, beside `space-identity.js`) and packaged
  by the existing `src/**/*` glob. Expected size about 700 KB; it loads once
  per window.

### The module

`src/renderer/bangs.js`, pure and self-contained, shared by main and the
overlay the way `space-identity.js` is (`require` from main, `<script>` in
the overlay). No `require` of anything, no Electron, no Node API, no DOM:
the overlay's `blanc-chrome://` allowlist serves only single files under
`src/renderer/`, so the module cannot lean on `search-engine-template.js`.
Template *validation* therefore happens before the module sees a template
(at build for built-ins, in `settings.js` for custom bangs, both with
`isValidSearchTemplate`); the module only substitutes. It exports:

- `parseBang(text)` → `{ code, query, position }` or `null`, by the token
  rule above.
- `resolveBang(text, catalog, customBangs)` → `{ url, name, code, query }` or
  `null`. Custom bangs are looked up before the catalog's primary codes
  and aliases. The URL is the template with `%s` replaced by the words
  encoded per the entry's `encoding` (defaults: encoded, spaces as `+`); an
  empty query returns the entry's `home`. `code` is the entry's primary
  code whatever alias was typed, and is what *recent* records.
- `matchBangs(prefix, catalog, customBangs, recent, popular)` → the picker
  rows, in the order *What the user sees* gives.

The data format and the three signatures are the port contract. The fork's
Island loads `bangs.js` and the catalog as they are; its browser process
either runs the same resolver in the WebUI host before `navigate`, or a C++
port reads the same generated catalog. Nothing else in Blanc may depend on
how the module stores its tables.

### Resolution on Enter (main process)

Main is the authority; the overlay's hint row is display only. In
`navigateTabToAddress`, after `handOffToOs` and before
`normalizeAddressInput`, main calls `resolveBang` when bangs are on; a
known code wins there by the one-decision rule above, and an unknown code
or a disabled switch leaves the text to `normalizeAddressInput` untouched.
The `tabs:search` handler, which the search row and suggestions use, does
the same with the query. A resolved bang
navigates to its URL and records the code in *recent* unless the tab is
private. The overlay's search submit path does not change: a bang row's
Enter goes through `tabs:navigate` with the typed text, so main resolves it
once more and the two surfaces cannot disagree. The acceptance suite runs
offline and today captures searches only on `tabs:search`
(`testSearchNavigationCapture`); `navigateTabToAddress` gets the same
capture for the bang scenarios.

### Settings and storage

- `bangsEnabled` — boolean, default `true`, in `SYNCED_KEYS`.
- `customBangs` — array of `{ code, name, template }`, default `[]`,
  sanitized on read and write (rules above; unknown keys dropped; at most
  100; duplicate codes keep the first), in `SYNCED_KEYS`.
- `recentBangs` — array of up to ten codes, newest first, device-local,
  never synced, never written from private tabs. Clearing history also
  clears it.

`settings-schema/schema.json` gains `bangsEnabled` (boolean, synced);
`npm run settings:build`. `customBangs` and `recentBangs` go in
`settings.js`'s `internalDefaults`, outside the mobile schema: its generator
has no record type, and a mobile port would read `bangs/` directly. They
join the schema when a mobile port needs them.

The overlay has no settings channel today (it learns the engine label only
from a suggestions reply), so `browserAPI` gains one member: `bangs()`, an
`invoke` on `chrome:bangs` returning `{ enabled, custom, recent }`, plus a
`bangs:changed` push with the same shape whenever any of the three changes.
Both go into `browser-api/contract.json` and `npm run browser-api:build`
regenerates the vectors. The custom-bang address reuses
`isValidSearchTemplate`; the Settings page reuses the custom search
address's error copy pattern.

### Privacy

- A bang request goes only to the bang's site. Nothing is sent to Kagi; the
  list is bundled and pinned.
- While the typed text holds a bang-shaped token at either end, known or
  not, bangs on or off, no search-suggestion request is made: the overlay
  does not ask, and main's `chrome:search-suggestions` handler refuses the
  query with the same `parseBang` check beside its existing trusted checks,
  so a renderer cannot ask around the overlay's guard. `!yt lofi` never
  reaches DuckDuckGo's or Google's completion service. One qualification
  the Settings hint does not need but this spec does: the guarantee covers
  the text as typed. Someone who types `lofi` and then adds ` !yt` at the
  end has already sent `l`, `lo`, `lof`, `lofi` to the suggestion service
  before the bang existed; leading bangs (`!yt lofi`) never send anything.
  The existing rule that a custom engine gets no suggestions already covers
  custom engines.
- *recent* is usage data: device-local, not synced, cleared with history,
  never recorded from private tabs.
- No telemetry event is added.

### Copy and languages

Every new string lives in `copy/messages/en.json` and is translated into
`de`, `es`, `fr`, `pt-BR` and `it` in the same PR (`copy:ack`). The hint
sentence takes the site name and the words as parameters. `THIRD-PARTY-
NOTICES.md` and the packaged notices gain Kagi's bang list (MIT, copyright
Kagi Inc. and contributors, source and commit), and
`scripts/generate-compliance.mjs` learns the new entry.

### Parity

`spec/features.md` gains **F47 — Bangs**; `spec/parity-matrix.md` lists it
SHIPPED on desktop, PLANNED on mobile. `bangs/` is a substrate the mobile
ports would read as-is; no Swift or Kotlin is generated now.

## Not in this release

- A bang picker button or chip in the resting pill. The pill stays as it is.
- Bangs with regex templates (three in Kagi's list) and Kagi-internal bangs.
- Importing custom bangs from Kagi or DuckDuckGo accounts.
- Searching from the picker rows' context menu, pinning bangs, categories.

## Tests

- Unit: `test/unit/bangs.test.js` for `parseBang`, `resolveBang` and
  `matchBangs` (token rule at both ends, case, empty query, unknown code,
  custom overriding built-in, private-tab recents, template safety: a
  template with `%s` in the host, `javascript:` or a bare `http://` server
  is refused); `bangs/build.mjs --check` freshness; settings sanitizing.
- The overlay's `vm`-lifted tests cover the hint row replacing the search
  row and the picker's section order.
- Acceptance: `spec/acceptance/island-and-commands.feature` gains `@F47`
  scenarios: typing a bang shows the hint row and Enter lands on the site;
  a bare known code opens the site's home; a suffix bang (`lofi !yt`)
  resolves; `!` alone shows the picker, and a known prefix shows the hint
  row above it; a custom bang from Settings resolves, and one that shadows
  a built-in alias wins; turning bangs off in Settings takes effect in the
  open panel without a relaunch and makes Enter search the text; a bang
  used from a private tab does not appear in *recent*; clearing history
  empties *recent*; no suggestion request leaves while a bang is typed,
  and a direct `chrome:search-suggestions` call with bang text is refused.
- `npm run substrate:check`, `browser-api:check` and `copy:check` pass.

## Left to the builder

- Fuzziness of the picker's name match (substring is enough).
- The meaning of each Kagi `fmt` flag, from Kagi's `spec/` tests, and the
  layout of `encoding`.
- Where the shortcuts-page line goes.
- Members of `bangs/popular.json`, starting from: w, yt, a, g, r, gh, imdb,
  maps, so (Stack Overflow), tw (Twitter/X), wa (Wolfram Alpha), eb (eBay),
  ebay, gi (Google Images), gm (Gmail), nf (Netflix), sp (Spotify), tr
  (Google Translate), wiki, k (Kagi).
