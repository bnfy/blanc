# Website trust redesign — claim review

Reviewed October 2, 2026 against public **v1.25.0**, commit
`ff55d5948f5c71e802ba2ac464659ef96e055ca9`. This is a website preview;
publication still requires owner review and protected-branch delivery.

The completed post-publication record lives at
`5b8fa03bda00cbd7fbcafba16384e63c7e85ff9a:docs/release-incidents/2026-10-01-v1.25.0.md`.
The immutable release tag’s copy of that incident necessarily predates
publication. Public copy links the completed record rather than calling the
tag’s preparation record final evidence.

| Wording / claim | Exact release evidence | Qualification | Verdict |
| --- | --- | --- | --- |
| “Chromium + Electron”; “Chromium renders the web. Electron brings it to your desktop.” | `v1.25.0:package.json`, `src/main/main.js`; Electron’s official process-model documentation linked on the page | Official unmodified Electron; Blanc is its own application and update channel | verified |
| “macOS · Windows · Linux” | `v1.25.0:package.json`, `.github/workflows/release-windows-linux.yml`; completed v1.25.0 publication record | Linux AppImage requirements vary; hosted evidence is distinct from physical-machine checks | qualified |
| “Real release captures with sample sites.” | `docs/website-wallpaper-captures-v1.25.json`, four native PNGs and proportional WebP exports | Unchanged installed signed public app; Billboard layout, sample renderer-clock fixtures and four local history entries, no retouching, no benchmark | verified |
| “Optional wallpaper follows your local clock.”; “This preview cycles faster through dawn, day, dusk and night.” | `v1.25.0:src/renderer/pages/newtab-wallpaper.js`, `pages.css`, `src/main/settings.js` and four bundled wallpaper assets; capture manifest | Optional/default off in the app; local assets, four clock-selected phases and two-second fade. Website cycles captured scenes every four seconds and respects reduced motion; no claim of app phase changes every few seconds | qualified |
| “MIT for Blanc’s own code”; reserved names/logos and third-party exceptions | `v1.25.0:LICENSE`, `ASSET-LICENSE.md`, `THIRD-PARTY-NOTICES.md` | No blanket MIT grant or trademark rights; upstream terms retained | qualified |
| “Free to browse”; optional Patron / Named Workspaces / price | `v1.25.0:src/main/workspaces.js`, `src/main/settings.js`, `src/main/patron.js`, `site/src/pages/faq.astro`, `site/src/pages/index.astro` | US$30/year or US$4/month plus tax; existing workspaces remain available after lapse | qualified |
| Floating island, Quick Switcher and slash commands | `v1.25.0:src/main/main.js`, `src/renderer/overlay.js`, `src/renderer/index.html` | Demo remains an illustration; screenshot is released-product evidence | verified |
| Known ad/tracker blocking with bundled EasyList/EasyPrivacy; no startup list/resource download | `v1.25.0:src/main/adblock.js`, `adblock/sources/pinned.json`, `scripts/verify-packaged-adblock.js` | Blocking is not comprehensive; user can disable globally/per site | qualified |
| Named Groups, Recently Closed, Quiet Tabs reclaim inactive-tab memory | `v1.25.0:src/main/main.js`, `src/main/closed-tabs.js`, `src/main/tab-sleep.js` | User-directed organization; no task inference; wake may reload a page | qualified |
| Whole-app updates include bundled runtime and require restarting | `v1.25.0:src/main/updater.js`, `package.json`; pinned `node_modules/electron-updater/out/AppImageUpdater.js` | Each release carries its selected engine build; not every maintenance release changes the engine version; writable AppImage location needed | qualified |
| macOS notarization, Windows timestamped Authenticode, signed manifest and provenance | `v1.25.0:scripts/release.sh`, `.github/workflows/release-windows-linux.yml`; completed release record | Authenticated artifacts, not reproducible builds; Linux lacks equivalent OS-level signing | qualified |
| Search/provider/DNS connections, Google as selected search recipient | `v1.25.0:src/main/search-suggestions.js`, `src/main/settings.js`, `src/main/network-privacy.js` | Submitted search always sends a query; eligible suggestions optional; private/sensitive exclusions; Automatic DNS can fall back | qualified |
| Pseudonymous usage fields, Cloudflare collector and optional Google mirror | `v1.25.0:src/main/telemetry.js`, `src/main/telemetry.js`, `cloudflare/ping-worker/src/index.js`, `test/unit/product-usage-wiring.test.js` | Raw install ID reaches collector but is keyed-hashed before storage/Google; fixed fields only, private feature use excluded | qualified |
| Fresh optional choices on, send only after saving, saved choices retained | `v1.25.0:src/main/settings.js`, `src/renderer/pages/onboarding.js`, `test/unit/first-run-settings.test.js`, `src/main/main.js` | Device-local preferences; browsing/search traffic still happens normally | qualified |
| Sync/Polar/macOS 1Password/handoff connections | `v1.25.0:src/main/sync.js`, `src/main/patron.js`, `src/main/onepassword-broker.js`, `src/main/tab-import-handoff.js`, `cloudflare/tab-import-worker/src/index.js` | Separate opt-in/request flows; 1Password also has explicit Verify; ChatGPT metadata path differs from locally encrypted companion path | qualified |
| No general extension runtime, no built-in AI, private tabs do not anonymize traffic | `v1.25.0:src/main/main.js`, `src/main/tab-preload.js`, `src/main/tab-view.js`, `site/src/pages/faq.astro` | Absence of a general runtime, not absence of all integrations | qualified |
| August 9, 2026 macOS memory benchmark, process-tree phys_footprint | `v1.25.0:bench/memory/README.md`, both `bench/memory/results/memory-2026-08-09*.md` runs | macOS 27 arm64 / 8 GiB, dated versions/workloads; no Windows/Linux or current-release inference | qualified |
| Four layouts, local start-page data/Mahjong and local bookmark imports | `v1.25.0:src/renderer/pages/newtab.js`, `src/main/browser-data-import.js`, `src/renderer/pages/mahjong-state.js` | Existing FAQ anchors retained; optional fixed usage events are distinguished from game/browsing state | qualified |
| Website Google/ad measurement only after grant; footer-only choices; withdrawal reload | This branch’s `site/src/scripts/site.js`, consent unit and controlled browser tests | Website behavior change, not a claim about the public app. Cloudflare cookieless/aggregate download counts remain; in-flight requests cannot be recalled | verified in preview |

Source files above were checked at the release tag. The new app Help card is
an unreleased development preview and is not claimed on the public site as
part of v1.25.0. Existing dated benchmark figures and useful feature FAQ
anchors remain qualified and accessible.
