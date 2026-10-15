# Switch-page homepage redesign: draft claims ledger (October 15, 2026)

**Status: draft. None of this copy is on the site.** It is the claim check for
the homepage redesign brainstormed from Apple's "Switch to Safari" page
(apple.com/safari/switch, read October 15, 2026). When the copy is built,
convert each surviving row into a JSON ledger entry in the shape of
`docs/website-v1.34-claims.json`, with `exactWording` matching the source
file, and wire it into `test/unit/website-feature-evidence.test.js`. This
Markdown draft is deliberately not test-coupled, because the wording does not
exist in any site file yet.

- **Public release:** v1.34.0, source `ac16aae446c22732478bfebc45ecc7ce5de51fbd`.
  Every Blanc evidence path below was read at that tag.
- **Release evidence:** `docs/release-incidents/2026-10-14-v1.34.0.md`.
- **Rules:** `docs/marketing-claims.md`. Verdicts are `verified`, `qualified`,
  `aspirational`, `remove`, or `pending` (evidence not yet gathered).
- **Publication gate:** owner approval of the finished page and exact copy.
  Any campaign use of it also falls under the Launch Week preconditions in
  `CLAUDE.md`.

## Prohibited claims for this redesign

Apple's page makes these claims for Safari. Blanc has no evidence for them,
or the claim rules forbid them:

- battery life, speed, page-load, benchmark or "fastest browser" claims;
- 4K or HDR video playback, or protected streaming (Blanc v1.34.0 ships
  official Electron 44.5.1, which has no Widevine; see F-3 and row C8);
- automatic tab organization by topic, page-change alerts or any other
  AI feature (Blanc ships none);
- "more private", "more secure" or "better than Chrome" without a measured,
  qualified basis;
- statements about what Chrome does with user data, such as "collects and
  sells your data", unless a current first-party source says exactly that;
- password import, password saving or breach alerts (Blanc has no password
  manager);
- web page translation (Blanc translates its own interface, not pages);
- phone or tablet apps (Blanc is desktop only).

## A. Blanc claims

| ID | Draft wording | Section | Evidence at v1.34.0 | Qualification that travels with it | Verdict |
| --- | --- | --- | --- | --- | --- |
| A-01 | A little less browser. | Hero | Approved brand tagline, `docs/marketing-claims.md` | Tagline, not a feature claim | verified |
| A-02 | Blanc puts tabs, search and commands in one compact Island, in a slim band above the page. | Hero | `src/renderer/styles.css:63` (`--strip-h: 68px`); Island boundary in `docs/marketing-claims.md` | The band is reserved space; only the expanded panel overlays the page. Never say the resting Island floats over the page | qualified |
| A-03 | Free for macOS, Windows and Linux, with ad and tracker blocking on from the first launch. | Hero | `site/src/pages/download.astro` (requirements); `settings-schema/schema.json:32` and `src/main/settings.js:113` (`adblockEnabled: true`); `src/main/adblock.js` | Blocking reduces known ads and tracking; coverage is not universal | qualified |
| A-04 | Coming from Chrome, Edge, Brave, Arc, Safari or Firefox? | Hero chips | `src/main/browser-data-import.js` (`BROWSERS`: Chrome, Edge, Brave, Chromium, Vivaldi); `src/main/arc-import.js`; `src/main/tab-import-handoff.js` | Each chip must land on that browser's exact steps (S-01 to S-05), which carry the limits | qualified |
| A-05 | 68 px of browser. Blanc's controls sit in one slim band; the rest of the window is the page. | Proof strip | `src/renderer/styles.css:63`; Island boundary | Applies to the default horizontal layout; vertical tabs (View → Tab Layout) add a sidebar. The expanded Island overlays the page | qualified |
| A-06 | 1.3 GB in Blanc, 5.6 GB in Chrome, with six ad-dense news sites open. Brave, which also blocks by default: 1.7 GB. Blanc with its blocker off: 4.2 GB. | Proof strip | `docs/press/fact-sheet.md` (Measured memory); `site/src/components/MemoryChart.astro`; `bench/memory/results/memory-2026-08-09T17-33-45-039Z.md` | **The run measured Blanc 1.1.0 and Chrome 150.0.7871.129 on 9 August 2026**, on one Apple Silicon Mac, fresh profiles, no extensions, median of three runs, `phys_footprint` summed across processes. Both qualifications (Brave; blocker off) must sit on the card, not in a footnote. The `public-truth` test pins these figures, so a new homepage use must join it. See F-1 | pending |
| A-07 | Ad and tracker blocking, on from the first launch. | Proof strip | `src/main/settings.js:113`; `src/main/adblock.js`; bundled EasyList/EasyPrivacy in `adblock/sources/` | Coverage is not universal; private tabs always use Blanc Blocker | qualified |
| A-08 | macOS, Windows and Linux. Free and open source. | Proof strip | `site/src/pages/download.astro`: macOS 13+ (Apple Silicon or Intel), Windows 10+ x64, Linux x64 AppImage; `LICENSE` (MIT) | The Blanc name, logo and identity assets stay reserved (`ASSET-LICENSE.md`); third-party material keeps its own terms (`THIRD-PARTY-NOTICES.md`). Never call the whole repository blanket MIT | qualified |
| A-09 | Prefer uBlock Origin? Choose it from the Island's shield and restart Blanc. | Privacy | uBO boundary in `docs/marketing-claims.md`; `docs/ublock-origin-support-matrix-2026-10-03.md` | Full uBO 1.75.0 on Apple Silicon, Intel Mac, Windows x64 and Linux x64; not under Rosetta. Private tabs keep Blanc Blocker. Not general extension support | qualified |
| A-10 | Group related tabs and give each group a name. You decide what goes together. | Tabs | Named Groups boundary in `docs/marketing-claims.md`; `src/main/main.js` (`groups`) | User-directed only. Never imply automatic grouping | verified |
| A-11 | Save a window as a space, with its own colour and symbol, and switch from the Island. Free for everyone. | Tabs | Blanc Spaces boundary in `docs/marketing-claims.md`; `src/renderer/space-identity.js` | Spaces are not synced. Tabs in spaces left a while ago may reload | qualified |
| A-12 | Quiet Tabs frees memory from inactive background tabs without closing them. | Everyday tools | `src/main/tab-sleep.js`; Quiet Tabs boundary | Only eligible tabs; a quiet tab reloads when you return | qualified |
| A-13 | Fill logins from 1Password when you ask. | Everyday tools | `docs/1password-integration.md`; `site/src/pages/features/1password.astro` | **macOS only in public copy**: Windows and Linux stay unannounced under the waiver. Needs the 1Password app and account; never automatic | qualified |
| A-14 | Open a private tab when you choose. Its cookies, storage and history disappear when Blanc quits. | Privacy | Private tabs section of `CLAUDE.md`; `src/main/tab-view.js` | Files you download stay on disk | verified |
| A-15 | Nothing optional is sent until you save your setup choices. | Privacy | Fresh optional connections boundary; `site/src/pages/index.astro` ("What Blanc sends") | Usage measurement and search suggestions are preselected **on**; never imply they default to off | qualified |

## S. Switching section (import, then default)

| ID | Draft wording | Evidence at v1.34.0 | Qualification that travels with it | Verdict |
| --- | --- | --- | --- | --- |
| S-01 | **From Chrome, Edge, Brave, Vivaldi or Chromium:** Bring Your Tabs reads the profile you choose on this computer and can keep its tab groups and pins. | `src/main/browser-data-import.js` (`BROWSERS`); `src/main/chromium-session.js`; `src/main/tab-import-*.js`; Bring Your Tabs boundary | Reads the saved session locally; you pick which tabs. It does not move sign-ins, passwords, history or cookies | qualified |
| S-02 | Bring your Favorites from the same browsers, or from an HTML bookmarks file. | `src/main/browser-data-import.js` (`parseChromiumBookmarks`, read-only `open(…, 'r')`); `src/main/bookmark-import.js` | "Favorites" is Blanc's name for bookmarks; say so beside the claim | verified |
| S-03 | **From Arc:** bring each Space you pick, with pinned tabs, Today tabs, and folders as tab groups. Each becomes a space in Blanc. | `src/main/arc-import.js`, `src/main/arc-import-source.js`; Arc Spaces boundary; `docs/evidence/f45-arc-import-real-sidebars-2026-10-12.md` | Sign-ins, passwords, history, archived tabs, Notes and Easels stay in Arc. On Linux you choose a `StorableSidebar.json` copied from a Mac or PC. Not a live Arc connection | qualified |
| S-04 | **From Safari or Firefox:** send the open tabs of one window to Blanc with the companion extension. | `src/main/tab-import-handoff.js`; Bring Your Tabs and handoff boundary | One time, up to 100 tabs, URL, title, order and active tab only; no groups or pins. The extension encrypts the tab list locally before upload | qualified |
| S-05 | **Passwords:** Blanc doesn't import or save passwords. Keep them in your password manager. On a Mac, Blanc can fill logins from 1Password when you ask. | 1Password boundary ("not … a Blanc password manager"); no password store in `src/main/` | 1Password fill is macOS-only in public copy | verified |
| S-06 | **Make Blanc your default on a Mac:** Settings → General → Make default, then confirm in the macOS prompt. | `src/main/default-browser-status.js` (`canSet` on packaged macOS); `src/renderer/pages/settings.html` | The confirmation dialog belongs to macOS. Screenshot steps must come from a v1.34.0 capture | pending (needs capture) |
| S-07 | **On Windows:** Make default opens Windows Settings → Default apps, where you choose Blanc. | `src/main/windows-default-browser.js`; `build/installer.nsh` (Default Programs registration); `CLAUDE.md` Windows section | Requires the installed build (`installedOnly` hint) | qualified |
| S-08 | **On Linux:** choose Blanc in your desktop's default applications settings. | `src/main/default-browser-status.js` (`canSet` false on Linux); the AppImage desktop entry advertises `WebBrowser` | Blanc cannot set itself as default on Linux. Steps vary by desktop, so give no single path | qualified |
| S-09 | First-run setup helps you choose a default browser. | Already ledgered for the current homepage (`site/src/pages/index.astro`, "Make it your default") | — | verified |

## C. Comparison table: Blanc and a default Chrome install

The Blanc column is checked at v1.34.0. Every Chrome cell was read at a
Google-owned page on **October 15, 2026**; saved copies were kept in the
session that wrote this draft. Where a source supports only part of the
draft, the cell is narrowed to what it says. `www.google.com/chrome/terms`,
chromium.org and policies.google.com could not be reached, so C7 cites the
help page that names Chrome's governing terms rather than the terms text.

| ID | Row | Blanc | Chrome | First-party source and supporting words (accessed 2026-10-15) | Verdict |
| --- | --- | --- | --- | --- | --- |
| C1 | Ad and tracker blocking on by default | Yes (A-07) | Limited: removes ads only on sites that violate the Better Ads Standards | https://support.google.com/chrome/answer/7632919 : "Chrome removes ads from websites that violate the Better Ads Standards." Documented for Computer and Android | verified (narrowed). Say "violate", not "fail". Don't claim Chrome has no tracker blocking: no Google page says so either way |
| C2 | Full uBlock Origin | Yes, optional, on supported builds (A-09) | No. Manifest V2 extensions are off since Chrome 138; uBlock Origin Lite (Manifest V3) is available | https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline (updated 2026-09-09): "With Chrome 138 all users on all channels of Chrome have now Manifest V2 extensions disabled. Users can no longer turn them back on." https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh : "uBO Lite (uBOL) is an efficient MV3-based content blocker." The original uBlock Origin listing now redirects to the Store homepage | verified |
| C3 | macOS, Windows and Linux | Yes (A-08) | Yes | https://support.google.com/chrome/answer/95346 (Computer): Windows 10 and up, macOS 13 Ventura and up, 64-bit Linux (Ubuntu, Debian, openSUSE, Fedora) | verified |
| C4 | Phone and tablet apps | **No** | Yes | https://support.google.com/chrome/answer/95346 (iOS: "iOS 18 and up"; Android: "Android 10 and up") | verified |
| C5 | Chrome Web Store extensions | **No** | Yes, on desktop | https://support.google.com/chrome_webstore/answer/2664769 : "You can customize Chrome on your desktop by adding extensions from the Chrome Web Store." | verified (narrowed to desktop) |
| C6 | Built-in password manager | **No** (S-05) | Yes, Google Password Manager | https://support.google.com/chrome/answer/95606 : "When you use Chrome, Google Password Manager saves your passwords for different sites." | verified |
| C7 | Free and open source | Yes, MIT with carve-outs (A-08) | Free; built on the open-source Chromium project, under Google's terms | https://developer.chrome.com/docs/chromium : "Chromium, the open source browser project behind Google Chrome"; https://support.google.com/chrome/a/answer/16190511 lists the Google Terms of Service and the Chrome & ChromeOS Additional Terms for Chrome; answer 95346: "at no charge" | qualified. Don't say Chrome "isn't open source": no reachable Google page says that |
| C8 | Plays protected streaming video | **No** (F-3; owner-tested with Netflix) | Yes | https://support.google.com/chrome/answer/4410268 : "By default, you can view protected content." | verified. Google's page doesn't name Netflix, so the table row doesn't either; Netflix appears only in the Blanc FAQ (Q-03) |

Rows deliberately left out:
- **Third-party cookies blocked by default.** Blanc blocks known tracker
  requests through EasyPrivacy, but no evidence shows it blocks all
  third-party cookies by default (`src/main/` has no such policy). Chrome
  Help (answer 95647) states a default only for Incognito ("By default,
  third-party cookies are blocked in Incognito mode"), not for regular
  windows, so neither cell could be sourced.
- **"Tabs in one Island".** It's not a fair yes/no against Chrome's tab strip
  and omnibox; leave it to the Island section.
- **Memory.** It isn't a yes/no; it stays in the proof strip with its
  qualifications.
- **Tab groups.** Chrome has them too; listing it as a difference would
  mislead.

## Q. FAQ answers

| ID | Question | Draft answer | Evidence at v1.34.0 | Verdict |
| --- | --- | --- | --- | --- |
| Q-01 | Does Blanc run on Windows and Linux? | Yes. Blanc runs on macOS 13 or later (Apple Silicon or Intel), Windows 10 or later (64-bit) and 64-bit Linux as an AppImage. | `site/src/pages/download.astro` | verified |
| Q-02 | Will my Chrome extensions work? | Blanc doesn't install extensions from the Chrome Web Store. It has ad and tracker blocking built in, and on supported builds you can choose the full uBlock Origin instead. | Electron decision in `CLAUDE.md`; uBO boundary | verified |
| Q-03 | Will my websites work? | Blanc runs on Chromium, the open-source engine Chrome is built on, through Electron 44.5.1. Protected streaming video, such as Netflix, doesn't play in Blanc. | `package.json` (`electron` ^44.5.1); F-3 | verified: the streaming sentence is owner-tested. Don't add a broader "most sites work" claim without evidence |
| Q-04 | Is Blanc really free? | Yes. Every feature, including Blanc Spaces, is free. Blanc Patron is optional support at US$30 a year or US$4 a month, plus tax, and unlocks nothing. | Patron section of `site/src/pages/index.astro`; Patron section of `CLAUDE.md` | verified |
| Q-05 | What does Blanc send? | Nothing optional until you save your setup choices. Usage measurement (no URLs, searches or page contents) and search suggestions are preselected; turn either off before saving or later in Settings. | "What Blanc sends" in `site/src/pages/index.astro`; Fresh optional connections boundary | qualified: link to Trust → Connections for the full list |
| Q-06 | Can I sync with my phone? | No. Blanc is a desktop browser. Optional Profile Sync keeps Favorites, settings and open tabs in step across your computers, end-to-end encrypted with a passphrase only you know. History and passwords never sync. | `src/main/sync.js` (`STORES`); Profile Sync section of `CLAUDE.md` | qualified: open-tab sharing is per-device and optional; private tabs never sync |
| Q-07 | Does Blanc support passkeys? | On a Mac with Touch ID, Blanc creates passkeys that stay on that Mac, in Apple's Secure Enclave. It can't use passkeys saved in other password managers. macOS only. | `site/src/pages/features/security.astro`; `src/main/webauthn.js` | qualified |
| Q-08 | Can Blanc translate web pages? | No. Blanc's own interface is available in English, German, Spanish, French, Italian and Portuguese (Brazil). | Interface languages boundary | verified: say the translations are machine-made if they're described further |
| Q-09 | Does Blanc organize my tabs for me? | No. You choose what goes in each group and space. Blanc doesn't guess. | AI and Named Groups boundaries | verified |
| Q-10 | Can I go back to my old browser? | Yes. Importing reads your old browser's files without changing them, so everything stays where it was. | `src/main/browser-data-import.js` (read-only opens); Arc boundary ("without changing it") | qualified: confirm the Chromium session reader is read-only in `src/main/chromium-session.js` before shipping |

## F. Findings and open items

- **F-1, memory figures are old.** The pinned figures come from Blanc
  **1.1.0** (9 August 2026), 33 releases before v1.34.0. The ad-blocking page
  already uses them with that date. Making them the homepage's lead proof
  point needs the measured version beside the number, or, better, a fresh
  run on v1.34.0 with `bench/memory/`. Re-running means updating
  `MemoryChart.astro`, `docs/press/fact-sheet.md` and the committed run
  together.
- **F-2, Chrome column.** Resolved on October 15, 2026: every cell in
  section C now cites the Google page it was read from. Re-read them before
  publishing if more than a few weeks pass, since Chrome's documentation
  changes (the Manifest V2 timeline gained an entry on August 31, 2026).
- **F-3, protected streaming.** Public v1.34.0 uses official Electron, which
  ships no Widevine CDM. The owner confirmed it hands-on on October 15, 2026:
  starting a Netflix title in Blanc stops at Netflix's "Pardon the
  interruption" page with error **M7701-1003**, which tells the viewer to
  visit `chrome://settings/content/protectedContent`, a page Blanc doesn't
  have. Every current Blanc build ships the same official Electron, so the
  result doesn't depend on the build. Support copy that explains this error
  would save switchers a dead end. The castlabs path (ECS plus free EVS signing for
  unmodified ECS, confirmed by castlabs by email on October 6, 2026) is
  recorded in `docs/platform-migration-electron-to-chromium-2026-10-04.md`.
  It is not adopted, and Widevine L3 is typically limited to SD, so copy must
  not hint at future streaming support.
- **F-4, browser detection.** Preselecting the "Coming from" tab from the
  visitor's browser should run entirely in the page (user agent or client
  hints), send nothing, and fall back to a neutral default. It needs the same
  privacy review as any other site script.
- **F-5, footnotes.** Apple-style numbered footnotes are fine for method
  detail (A-06's test setup). Material qualifiers stay inline beside their
  claim, as `docs/marketing-claims.md` requires.
- **F-6, imagery.** Step screenshots (S-06 to S-08) and feature films must
  be captured from the public v1.34.0 build and recorded in a captures
  ledger like `docs/website-captures-v1.33.0.json`.
