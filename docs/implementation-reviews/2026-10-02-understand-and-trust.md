# Website review — make Blanc easier to understand and trust

Prepared from fresh `origin/main` at `5b8fa03bda00cbd7fbcafba16384e63c7e85ff9a`
on `codex/blanc-trust`. The original dirty checkout was not changed.

Finished local preview: http://127.0.0.1:4328/ — also review `/how-it-works`,
`/faq`, `/privacy`, and footer Privacy choices. The hero uses four unchanged
public v1.25.0 wallpaper captures from an isolated fixture profile,
proportionally exported to WebP. Native capture hashes, sample local-hour
fixtures and exact-wording evidence are in `website-wallpaper-captures-v1.25.json`
and `website-trust-claims-v1.25.{json,md}`. The original static capture remains
recorded in `website-trust-capture-v1.25.json`.

The homepage, direct navigation, user-started demo, explanations and opt-in
measurement are implemented. No automatic consent prompt or Google script
loads for unset, denied or unavailable storage. Saved grants remain honored.
Withdrawal saves denial, disables dispatch, discards pending/stored/live-link
ad references and reloads; a reload/regrant cannot resurrect the landing
reference. Cloudflare cookieless and aggregate download counting remain.

Validation: all 1,989 unit tests, substrate checks, built site/SEO (28 pages,
26 sitemap URLs), consent and exact-copy tests, and `node test/site/trust-review.mjs` against the built preview.
The browser harness covers consent states and request attempts, no prompt,
withdrawal reload, keyboard menu/Escape and demo chapters, reduced motion,
desktop/mobile, 200% zoom, no horizontal overflow, and JavaScript-disabled
static image/navigation/download fallback. External requests are fulfilled
locally to avoid sending synthetic measurement. The macOS IAB preview was
also visually reviewed at desktop and 390px mobile width.

The owner authorized committing, pushing and creating the website PR on
October 2, 2026 after the finished preview. Production publication approval
remains pending; protected merge and verified deployment follow that approval.
The separate desktop change must not ship before `/how-it-works` is live.

October 2 hero refinements: centered layout and shorter tagline, matching CTA
shapes, a correctly sized mobile menu icon, seamless header at the top, and
CSS-only clipping of native traffic lights. The optional dynamic wallpaper
preview crossfades through actual dawn/day/dusk/night captures every four
seconds with a 1.2-second fade, with no visible controls. Hover or keyboard focus holds the scene;
offscreen/hidden pages suspend cycling; reduced motion and JavaScript-disabled
visitors receive a static scene. The caption explicitly qualifies the faster
preview relative to the app's local-clock phases. This adds no measurement,
storage, remote wallpaper assets, or app settings changes.

Refinement validation passed: 20 navigation/consent/release-evidence unit tests,
lint, site/SEO build (28 pages and 26 sitemap URLs), and the complete saved
browser harness with real-time crossfade, hover/focus pause, offscreen
suspension, reduced-motion and no-JavaScript static fallback. Desktop and
390px mobile control-free previews were visually reviewed. The disposable
browser host disables background throttling so macOS window occlusion cannot
stall test screenshots; production motion still suspends on hidden pages.

The owner requested a faster wallpaper cycle on October 2. The website
interval is now four seconds (previously eight) with a 1.2-second fade
(previously two). The built-site harness verifies all four phases and return
to dawn within twenty seconds, plus pause, reduced-motion, no-JavaScript,
responsive, consent and demo behavior. Site/SEO build and browser checks pass.

Hero tint correction: each signed-public-app phase was reloaded with its
sample local-hour fixture before capture. The released sampler's native
Island strip color was checked against the wallpaper's rendered top edge:
dawn #f8f1e7, day #e3e8e9, dusk #f0e7df, night #e9e4db. The screenshot and
traffic-light clipping backdrop now share one fading layer for each phase;
there is no fixed daylight-colored patch. PNG/WebP hashes and tint values
are recorded in the capture manifest. Native/exported-pixel evidence checks,
built-site pixel seam checks during every fade, the complete browser harness,
and site/SEO build passed. All assets remain native captures/proportional
exports; no source image was retouched. App responsiveness changes are a
separate unreleased development change, not a public v1.25.0 claim.

Billboard hero refinement: all four hero scenes now use the released Billboard
layout, with its large clock and frequent-site row. Four sample local history
entries populate that row; renderer-clock fixtures align the displayed time
with each wallpaper phase. No OS clock or shipped code was changed. Native
strip tints remain verified, originals are unretouched, and the caption now
identifies sample sites. The existing four-second cycle, fade, pause and
accessibility behavior remains intact.

Dark-mode hero refinement: eight signed-public-app Billboard captures now
cycle in light/dark pairs for dawn, day, dusk and night, four seconds per
scene with a 1.2-second fade. Every dark scene carries its own verified native
strip tint (#37342f, #292d31, #251e1f, #111114). The caption identifies both
modes; static/reduced-motion fallback remains light dawn. The native captures
and proportional exports remain unchanged and use the same isolated fixtures.

Summary icon refinement: small local Chromium/Electron and platform marks,
a code glyph for open source, and the existing Sunrise mark for optional
Patron support now precede the four facts. All are decorative to assistive
technology, with text and link targets retained. Sources are pinned and
notices recorded; the page makes no additional requests to logo services.

Owner color correction: every summary mark now uses the same black treatment,
including Sunrise through a presentation-only SVG color filter.
Original Sunrise pixels remain unchanged. Chromium uses the shared three-sector
monochrome browser vector; its decorative title is adapted. Platform marks
share the same visible bounds, including the Windows glyph’s corrected viewBox.

Code-review follow-up: the unenhanced navigation now grows to contain its
wrapped links when JavaScript is unavailable, keeping the hero below the
header. The browser harness asserts link containment, hero separation and
no horizontal overflow at 390px, 900px, desktop width and 200% desktop zoom.

# Desktop review — make Blanc easier to understand and trust

Prepared from fresh `origin/main` at `5b8fa03bda00cbd7fbcafba16384e63c7e85ff9a`
on `codex/blanc-trust-app`. The original dirty checkout was not changed.

Settings Help now shows the running Blanc/Electron/Chromium versions,
platform and architecture, with plain whole-app update/restart wording and
links to source, privacy, release notes and How Blanc works. Its new update
bridge is Settings-only at the exact-host/session/frame/owned-surface guard
and uses the existing manual updater through sender-derived window runtime.
No updater behavior, runtime, security control or privacy default changed.

Onboarding retains both fresh optional choices on and existing saved choices.
It names Cloudflare/Google and search-provider recipients, data categories,
the save-before-send boundary and pseudonymous measurement. Known blocking
is qualified. Help describes connections without presenting a live monitor.

Validation: all 1,985 unit tests, lint and substrate checks; 10 Settings and
onboarding desktop acceptance scenarios / 45 steps; and the disposable-profile
`node test/desktop/settings-help-smoke.mjs` checks actual running build data,
the existing manual updater dialog, fresh defaults, replayed saved choices,
and absence of the bridge on an ordinary website. Guard unit tests reject
other hosts, subframes and unowned surfaces and distinguish window runtimes.

This is an unreleased source preview. Website deployment must precede
shipping its new explanation links. Windows/Linux candidates, affected-machine
confirmation and ordinary release/updater gates remain required; no previous
release’s physical-machine evidence or waiver is carried forward.

The desktop branch was rebased onto fresh origin/main b83393a8 before the
additional owner-requested tint work. Help/onboarding remain intact.

The Island now follows wallpaper fades and post-load page changes. Each
window owns a single-flight controller: two rendered top-edge pixel rows,
80 ms minimum spacing while changing, and a one-second fallback when stable
for CSSOM/canvas changes that do not mutate the DOM. Isolated preload
notifications are empty markers, coalesced to at most ten per second; main
accepts only its owned active main frame. Pages receive no new browser API,
color input or pixels. The trusted chrome receives a small color-only event
to avoid repeated tab UI rebuilds. Samples stay in memory and are neither
persisted nor transmitted. Private tabs and internal utility pages retain
their untinted theme; background, hidden/minimized and closed windows stop
sampling. Identity, navigation epoch, active view and generation checks
discard stale captures; activation and theme changes resume sampling.

Validation on the source preview: 2,023 unit tests, lint and substrate checks,
ten Settings/theming/onboarding acceptance scenarios (72 steps), the Help
smoke, existing wallpaper smoke (48 layout/theme/phase combinations and 60
responsive placement checks), and the new page-tint smoke. The latter checks
actual intermediate colors in a two-second wallpaper fade, live DOM and
CSSOM colors, scroll, stable backoff, private/background/hidden exclusions,
window routing, navigation/switch/close races, and absence of a website bridge.
Its disposable renderers disable background throttling so automation-host
occlusion cannot stall frame observations; no shipping preference changed.
Source inventory hashes/channels were refreshed for the new boundaries; this
is scoped implementation evidence, not completion of the independent audit.

Earlier Windows/Linux candidate run 37044861852 belongs to the superseded
65a202eae4576d795de35df216599cb9c1dff4e2 commit and does not validate this tint
change. New private native candidates, affected-machine confirmation, and
the normal release gates remain required before merge or public shipping.

Code-review follow-up: the onboarding privacy explanation now opens in a
separate managed tab with no opener access. The desktop Help smoke confirms
that opening and closing it preserves step 4 and both unsaved off choices,
then verifies persistence, replayed saved choices, running build details and
the existing updater interface. The Island tint implementation was reviewed
across controller scheduling, marker-only IPC, frame/window ownership,
stale capture guards and theme/window lifecycle handling; no actionable
finding was identified there. Physical-machine review remains required.

Source integration update, October 2: the owner requested “squash merge”
after both PRs were reviewed and pushed. Desktop PR #477 was squash-merged
as a066b16699b5ddc996868adfff11f9147d56d317. Its exact candidate and pending
physical-machine/release checks are recorded in the PR description. This
request also approves the reviewed website for protected merge and verified
production deployment; earlier publication-pending notes above are historical.
