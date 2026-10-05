# Dark Reader built into Blanc: plan

Drafted October 5, 2026 at the owner's request. **Status: proposal. Nothing is
built yet, and the build itself needs the owner's go-ahead.**

## Goal

Websites without their own dark mode stay bright white even when Blanc is dark.
Dark Reader fixes that in other browsers by generating a dark version of any page
as it loads. This plan builds that capability into Blanc as an ordinary setting,
without an extension.

It came up from user feedback: a daily.dev reply listing the user's top five
extensions named Dark Reader alongside uBlock Origin.

## What we would use

- **The `darkreader` npm package**, version 4.9.133 at the time of writing,
  **MIT licence**, from github.com/darkreader/darkreader. It is Dark Reader's
  own engine, published for use on a single page through `enable(theme)`,
  `disable()`, `auto(theme)`, `isEnabled()` and `exportGeneratedCSS()`.
- **Its site fixes list** (`dynamic-theme-fixes.config` in the same repository,
  same licence). These per-site corrections are what make Dark Reader look good
  on popular sites. The package does not choose fixes for a URL, so Blanc would
  pin a copy and select the fix for each page itself.

## Recommended approach: the engine in a session preload

Blanc already injects small scripts into every page through
`session.registerPreloadScript` (`installSessionPreloads` in `main.js`). Dark
Reader would be one more:

1. A generated `dark-reader-preload.js` contains the pinned engine, the pinned
   fixes and a small Blanc wrapper. A sandboxed preload cannot `require` npm
   packages, so the engine is bundled into the file and pinned by hash, the same
   way `capture-runtime-lock.json` pins the capture preload.
2. The preload runs at document start in Blanc's isolated world. It never runs
   in the page's own JavaScript, so pages cannot see or call it.
3. On start it asks main, synchronously, whether to darken this page, as
   `webrtc-audio-buffer-preload.js` already does for its setting. Main answers
   with a yes or no and the theme values, and nothing else crosses.
4. When the setting, the site list or Blanc's light/dark theme changes, main
   tells open tabs and the preload calls `enable` or `disable` live, with no
   reload.

**Why not ship the Dark Reader extension the way we ship uBO:**
- Electron refuses to load extensions in temporary sessions, so private tabs
  would stay bright. The uBO feasibility test recorded that refusal.
- uBO needed a large compatibility adapter for missing browser APIs. Dark Reader
  would need a similar one for its popup, menus and shortcuts, all of which Blanc
  would replace with its own UI anyway.
- The October 5 platform decision rules out a general extension runtime. A
  preload is not one.

**Why not Chromium's own "auto dark mode" flag:** it is a single
startup-wide switch with no per-site off switch, needs a restart, and darkens
less carefully than Dark Reader.

## How it behaves

- **Setting:** Settings → Appearance gains **Dark websites**: Off (default) or
  **When Blanc is dark**. When Blanc is dark (dark theme, or system theme on a
  dark system), pages are darkened.
- **Per-site off switch:** a site list, like the ad-blocking exceptions, managed
  from Settings plus one quick control on the page. Where the quick control
  lives (the shield popover, a slash command, or both) is a design decision.
- **Sites that are already dark** (they honour `prefers-color-scheme`, which
  Blanc already sends) must not be darkened twice. The spike checks how well
  Dark Reader detects this, and the fallback is the site list.
- **Not darkened:** `blanc://` pages (they have their own dark theme), the
  chrome documents, uBO's own pages, and anything that isn't http(s). The
  preload exits at once for these.
- **Private tabs** are darkened too, because the preload is registered on both
  sessions. Whether a per-site switch flipped in a private tab is saved is an
  owner decision; the private-tab rules suggest it should not be.
- **Default off** keeps the published memory figures valid. Turning it on by
  default later would need the memory benchmark re-run and the pinned figures
  updated together.

## Known limits to measure in the spike

| Question | Why it matters | Pass condition |
|---|---|---|
| White flash on load | Darkening must start before first paint. | No visible flash on 10 test sites. |
| Iframes | Blanc's session preloads reach only main frames today (capture spike). Embedded frames such as comment widgets and some ads stay light. | Measure on the test sites; decide whether the gap is acceptable. |
| Cross-origin stylesheets | Dark Reader rewrites page CSS. From inside the page it cannot read stylesheets on other domains that lack CORS headers, and the extension normally fetches those in its background. | Count how many test sites look wrong without a fetch bridge. |
| Constructed stylesheets and shadow DOM | Some sites build styles from JavaScript. The extension catches these with a script in the page's own context, and Blanc may need to inject that piece. | Test sites using web components render dark. |
| Pages with strict CSP | Injected styles must not be blocked. | Strict-CSP test page renders dark. |
| `window.chrome` stub | The package adds a `chrome` object to the window it runs in. In the isolated world that must not collide with the page's or Blanc's compatibility shim. | Google sign-in and `chrome-compat-preload.js` behave unchanged. |
| Speed | Dark Reader can slow very heavy pages. | Load time and CPU on 5 heavy sites within an agreed margin. |

**Cross-origin stylesheets are the main open design question.** If the spike
shows real breakage, the fix is a fetch bridge: the preload asks main to fetch a
stylesheet. Main then fetches for a renderer, so the bridge must be tightly
bounded and needs a security review:
- http(s) stylesheets only, no cookies;
- no local or private-network addresses;
- a size cap;
- only URLs the requesting frame actually links to.

Ship without the bridge if the spike shows it isn't needed.

## Phases

1. **Owner decision on this plan.** This includes the open decisions below.
2. **Spike, time-boxed to about three days.** Run the engine in a dev-only
   session preload and answer every row of the table above on macOS, then check
   Windows and Linux. Output: a dated `docs/dark-reader-spike-<date>.md` with
   results and a go/no-go.
3. **Build.** Covers the following:
   - **Generated, hash-pinned preload:** add `npm run darkreader:build` and
     `darkreader:check` to `substrate:check`, so the bundled engine and fixes
     can't drift from the pinned package.
   - **Pure policy module** (no `require('electron')`): decides whether to
     darken from the URL, settings, effective theme and private state. Unit
     tested.
   - **Settings:** new keys in `settings.js` and `settings-schema/schema.json`.
     Sync is an owner decision.
   - **Settings page and quick control:** `bridges.json` and the
     `browser-api` contract are updated for any new `pages:*` or `browserAPI`
     surface, and `vectors.json` is regenerated.
   - **Slash command, if any:** add it to `copy/slash-commands.json`.
   - **Spec:** a new feature entry plus an acceptance scenario in `spec/`.
   - **Desktop acceptance test:** a white fixture page turns dark, an excepted
     site stays light, an already-dark page is untouched, a private tab is
     darkened, and theme changes apply live.
4. **Review.**
   - Source and licence review of the pinned engine and fixes.
   - Add Dark Reader to `THIRD-PARTY-NOTICES.md` and
     `src/THIRD_PARTY_NOTICES.txt`; the packaged compliance gate checks this.
   - CodeQL, plus a security review of the preload, and of the fetch bridge if
     one is added.
5. **Release.**
   - The feature ships in a normal release.
   - **Naming:** use Blanc's own feature name and credit Dark Reader in notices
     and help text. MIT covers the code, not the Dark Reader name or logo.
   - Any public mention follows `docs/marketing-claims.md` and waits for the
     release that contains it.

**Updating Dark Reader later** is a reviewed change, like the ad-block lists: bump
the pinned package, rebuild, review the diff, commit together. Blanc never
downloads fixes at runtime.

## Open owner decisions

- [ ] Go or no-go on the spike.
- [ ] Feature name, for example **Dark websites**.
- [ ] Where the per-site switch lives: shield popover, slash command, or both.
- [ ] Whether the setting and the site list sync between devices.
- [ ] Whether a per-site switch flipped in a private tab is saved.
- [ ] Brightness, contrast and sepia controls in the first version, or later.
- [ ] If the spike needs it, whether to add the cross-origin stylesheet fetch
      bridge.
- [ ] Optional courtesy: tell the Dark Reader project or support it. Not
      required by the licence.
