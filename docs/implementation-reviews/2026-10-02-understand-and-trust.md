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
preview crossfades through actual dawn/day/dusk/night captures every eight
seconds, with no visible controls. Hover or keyboard focus holds the scene;
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
