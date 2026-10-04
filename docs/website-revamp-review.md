# Website revamp review — October 2, 2026

Status: implementation and local verification complete. The owner requested PR
creation on October 3, 2026. Production publication approval, protected-branch
merge and canonical deployment are pending. This record is for the production
Astro source, not the earlier standalone storyboard.

Baseline: `ea73189cedea7c632629dbcc855c0fde5e28effa` on `origin/main`.
Working branch: `codex/website-revamp`.
Product evidence: public `v1.26.0` at
`4624b229c1a50814c42714e6175902671497e391`.
Completed release record: revision
`8e48359fae44865857a5bd3a8a955af96af71650`.

## Structure

The homepage tells the product story through the Island, tabs, privacy,
Start Page, everyday tools, the accountable maintainer and Patron. The tagline
remains **A little less browser.** Newsreader and Inter stay; the website no
longer loads JetBrains Mono. White navigation hides on downward scrolling and
returns on upward scrolling or keyboard focus. The background retains Blanc's
warm ivory, with the original gold Sunrise mark.

The hero flows directly into the Island. Features links land at that first
product section; the extra feature-jump row is removed. Compact wallpaper
controls remain under the laptop. The engine, licensing and official-download
references sit together in the project section, with their text and destinations
preserved. The band has smaller type, two engine marks and no separate card
dividers; links show an underline on hover or keyboard focus.

Patron is a complete inset warm-ink offer with one restrained golden light spill,
the original monochrome Sunrise mark, a large Newsreader name and annual price,
and a gold purchase button. The offer and its explanation sit beside one another
on desktop and stack on mobile. Membership-lapse and lifetime-access terms remain
visible below the offer. The detached historical screenshot is removed; the
supporting link opens Named Workspaces within Support. Both Patron fragments
land at the top of the panel.

The primary journey is concentrated on the homepage, with 27 indexed routes
retained after the owner's October 3 SEO correction:

- `/` — visual product story and in-page Features tour.
- `/support` — practical guides and the existing straight answers, searchable.
- `/trust` — engine, connections, choices, release evidence and known limitations.
- `/download`, `/about`, `/changelog`, `/press`, `/ambassadors`, `/privacy`, `/terms`.
- `/features` and all 16 existing `/features/*` landing pages retain their
  original URLs, unique titles, descriptions, substantive copy and section IDs.

`/import-tabs` remains an unlisted handoff utility and `/404` remains a real
noindex 404. Only FAQ, How It Works and the historical `/private` alias redirect
to Support or Trust; three legacy paths have static fallbacks and redirects for
both trailing-slash variants. Feature pages are ordinary indexable documents
with self-referencing canonicals and sitemap entries, never redirects or noindex
fallbacks. The primary Features link still opens the homepage tour. The footer's
Feature guides link opens `/features`, and each Support/Trust topic links to its
full guide. Existing release-note and related-feature links keep their original
feature destinations and fragments. Shared layout provides the redesigned
header, footer, Newsreader/Inter typography and warm background.

The restoration uses website revision `358cc02df00f10d184b84dbfdae6f6bfdfa6a790`.
Regression coverage compares every retained title, description, heading,
paragraph, caption and original section ID against that revision. Eighteen
focused navigation, claims and transparency tests pass. The production build
passes its SEO checks, and all 17 feature URLs return HTTP 200 with indexable
HTML, self-canonicals and no refresh redirects on the built preview. Quiet Tabs
and the directory were reviewed at 390px without horizontal overflow; Quiet
Tabs was also inspected at 855px.

No Search Console clicks, impressions, query positions or page-level traffic
data was accessed. This preserves the existing entry points; it is not evidence
that rankings are unchanged. Before considering any future consolidation,
review per-page search queries, clicks, backlinks and download activity. Google's
[site-move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
allows relevant consolidation but warns of visibility fluctuations and
irrelevant redirect destinations. The redesign has not been deployed.

## Trust and transparency retained

| Existing element | New placement / guard |
| --- | --- |
| Chromium + Electron icons and explanation | Homepage project section, beside licensing and official-download evidence; `/trust#engine` |
| Who develops Blanc; AI assistance and human accountability | Home closing section, About, existing Support answer |
| No independent external security audit; internal review distinction | Visible Trust introduction and audit section; Home and About |
| Known Sync account-locator, concurrent-write/deletion issues and undeployed limits | Full original audit-status section, outside disclosures on Trust |
| Per-platform verification and exact completed release evidence | Full original table, outside disclosures on Trust; direct homepage link |
| Search suggestions and usage measurement preselected on; sends wait for saving | Homepage beside privacy story; full Connections and Controls on Trust |
| Pseudonymous measurement, Cloudflare collector, optional Google mirror and excluded data | Homepage, unchanged Privacy Policy, full Support/Trust answers |
| MIT boundary, trademarks/identity and third-party exceptions | Homepage foundations and closing section; Support, About and Terms |
| Patron prices, new-workspace gate, lapse behavior and earlier lifetime access | Home Patron section, Download, About, Support and Terms |
| macOS-only explicit 1Password fill, no synced provider passkeys | Home qualification, Support setup, Trust and unchanged Download limitation |
| Reproducible missed-ad reports and evidence requirements | `/trust#ad-blocking` |
| Privacy choices and newsletter confirmation flow | Working footer controls; existing endpoints and consent code retained |

`website-revamp-trust.test.js` compares today's FAQ data verbatim and the release
verification/audit sections against `a3e4a9dbf166730856b6f5fc87417770c7886d7b`.
It also checks every old feature-guide fragment, key homepage boundaries and
missed-ad reporting requirements. Formatting whitespace is ignored for the
section-text comparison, not words or punctuation.

`website-revamp-claims-v1.26.json` records 892 current exact-wording claims and
94 retired source strings. Retired strings are predominantly repeated feature
summaries, replaced marketing headings, old image descriptions and the previous
homepage demo. This is not a record of removed capabilities: practical content
and qualifications remain in the corresponding guides. Restored feature-page
claims retain the same release evidence and qualifications; their website
source revision is recorded separately. The prior claims ledgers
remain unchanged. New homepage wording is tied to immutable release paths;
public authentication links use the completed post-release evidence revision.

## Visuals and interactions

- Enlarged native Island above the hero laptop, extracted at build time from
  `src/renderer/styles.css`, `index.html` and `renderer.js`, using the bundled
  native Inter font. Shadow DOM isolates the original geometry, material and
  SVG controls from website styles. This is an inert code rendering with sample
  tabs, not a new public-release screenshot; desktop renderer code never runs
  on the site. The Horizon Shield artwork retains the launch gate below.
  After the owner's perspective correction, the level Island tilts backward
  60 degrees around its horizontal axis: its top recedes toward the center,
  with no sideways yaw or roll. Hover eases it upright and head-on; leaving
  restores the current scroll perspective. A stable hit area avoids flicker as
  its projected shape changes. Bounded scroll parallax is presentation only.
  Reduced motion disables scroll parallax and makes hover changes immediate;
  offscreen motion pauses. Desktop 1440px and mobile 390px were inspected without overflow;
  light/dark synchronization and pointer movement were verified. The three
  new extraction/motion tests and 13 existing Island/evidence tests pass.
- Space Black hero laptop, with actual v1.25.0 light/dark wallpaper captures,
  a time scrubber and accelerated day preview. It pauses offscreen or when the
  document is hidden; manual interaction stops playback.
- Island choreography between unchanged v1.26.0 native captures, explicit
  state buttons, keyboard navigation and play/pause.
- User-directed group folding, a bounded reopening illustration, a sample
  per-site blocking switch and explicit mouse-gesture illustrations.
- Four actual v1.21.0 Start Page captures and a Mahjong detour. Capture versions
  are visible; these are historical product captures, not new release claims.
- Glance retains a fixed desktop canvas even on the mobile website. Divider
  keyboard input, swapping, close/reopen and reset work without implying a
  mobile Blanc application.
- macOS, Windows and Linux logos in download areas; attribution retained.

Hardware artwork was generated separately. Product pixels were not generated
or repainted. Hardware exports use lossless WebP; below-the-fold images load
lazily. Native Island PNGs remain byte-identical. Asset hashes, native capture
provenance and hardware prompts are committed beside this record. Wikipedia
sample-page attribution and individual image sources are shipped in
`site/public/revamp/credits.txt` and linked from the demo.

CSS and JavaScript honor reduced motion: no hero autoplay, no Island sequence
playback, and decorative transitions disabled. These branches were inspected;
an OS reduced-motion preference was not changed for testing.

## Verification

- `npm run test:unit`: **2,044 passed, zero failed**, including the new
  trust-preservation checks and existing release/capture-evidence checks.
- `npm run lint`: passed.
- `npm run compliance:check`: passed. Site SBOM now contains 286 packages after
  removing the website JetBrains Mono package; desktop licensing is unchanged.
- `npm run site:changelog:check`: passed against GitHub, 97 releases current.
- `npm run site:build`: passed. SEO verification now covers 29 real pages and 27
  sitemap URLs; three noindex legacy fallbacks are separately verified. The build
  also checks duplicate IDs, internal fragment targets and local images, and
  requires the feature pages to remain indexed, internally linked and free of redirects.
- `test/site/crawl-hygiene.test.mjs`: passed against built preview on port 4323.
- Browser: desktop 1280×900 and mobile 390×844 inspected. All retained pages
  fit the 390px viewport with no page-level horizontal overflow or broken images.
- Browser: hero appearance/time input, Island buttons and keyboard navigation,
  group folding, reopening/replay, blocking switch, Start Page selection,
  Mahjong return, Glance keyboard resize/swap/close/reopen/reset and gesture
  choices verified.
- Browser: Support search, no-match/clear, 1Password setup disclosure, old FAQ,
  How It Works and feature deep links verified. Features navigation works from
  a secondary page. Header hides downward and returns upward.
- Browser: footer Privacy choices reopen and dismiss correctly. Invalid
  newsletter input stays local; no subscription, application or purchase was
  submitted. Existing newsletter, ambassador and download service code remains.
- First-party read-only checks: Polar shows US$30/year and US$4/month plus tax;
  OpenSSF records 24/24 Level 1 and 19/19 Level 2 controls, explicitly a
  self-assessment. Neither is presented as an independent security audit.

External reference URLs:
- https://buy.polar.sh/polar_cl_auwRq39Q2hIVLJwANEqFWgWuZ8DGjdJmEI4mE0JaNDf
- https://www.bestpractices.dev/en/projects/14451/baseline-2

Built preview: `http://127.0.0.1:4323/`.
Dev preview: `http://127.0.0.1:4321/`.
Review images are stored in the task's `blanc-production-review` artifact folder.

## Delivery boundary

October 3 Patron redesign: the golden light, monochrome Sunrise mark, display
name and price are restored in a complete offer panel. The explanatory copy,
prices, new-workspace gate, lapse behavior and lifetime access remain unchanged.
The workspace guide opens correctly, the legacy fragment lands at the panel top,
and keyboard focus has a light outline on ink. Both dev and built mobile preview
fit 390px without horizontal overflow; the desktop composition was inspected at
897px. All 17 targeted navigation, claims and trust checks and the production/SEO
build pass. The removed historical screenshot caption is recorded as retired in
the claim ledger; the original capture and provenance remain unchanged.

October 3 visual refinement: the quieter hero transition and relocated trust
references were reviewed on desktop and at 390px. Wallpaper keyboard input,
appearance switching, Features navigation and focus indicators were verified.
All 17 targeted navigation, claims and trust tests and the production/SEO build
pass. No marketing claim wording or product captures changed.

October 3 PR follow-up: the test-only prose comparison now handles unterminated
markup as well as complete tags, with a regression case for the CodeQL finding.
The separate http-cache-semantics dependency finding is documented in
`docs/security-reviews/2026-10-03-http-cache-semantics.md` and OpenVEX with guarded
build-only/static-site boundaries. The full unit suite now passes **2,046 tests**;
dependency policy, lint, compliance and the static production build also pass.

No desktop product release is required. After approval of this concrete preview,
follow the root AGENTS.md website protocol: commit and push, create the PR,
wait for protected checks, merge normally, deploy the exact new main commit,
and verify the canonical site and Cloudflare Production SHA. Local success is
not a claim that Cloudflare redirects or the canonical deployment have shipped.

## Horizon Shield and blocking choices — October 3

Privacy and Control features the Sunrise bronze Horizon Shield at a large scale,
beside Blanc Blocker and uBlock Origin. The original transparent source is
exported faithfully to a 960px WebP (139,890 bytes), which remains the fallback.
A solid relief mesh follows its alpha silhouette: matching front and back
surfaces use the same original artwork and UVs, turned 180 degrees, with two
recessed seams and closed beveled bronze walls between them. The visible caption
is removed; the figure retains an accessible name.

Three.js 0.186.1 renders the model with softer lighting and a satin bronze finish:
reduced exposure, environment and edge lighting, rougher surfaces, and no
clearcoat reduce glare while retaining the original brushed artwork and relief.
Its separate chunk loads
only near the section (about 548 kB minified; 135 kB gzip). This lazy
chunk triggers Vite's 500 kB advisory, but is not part of the initial page load.
There is no animation loop: scroll/resize request a frame only when needed,
with DPR capped at 2. Scroll controls one clamped 0°–360° turn and reverses when
scrolling back. The turn begins when the figure’s top reaches 90% of the
viewport height and finishes when its bottom reaches 20%, so motion is already
visible as the artwork enters. Reduced motion keeps it upright and avoids
loading WebGL on initial load. Initialization failure or context loss shows
the static original artwork. There are no extra disclosure controls or fake
blocking counters.

The owner explicitly requested finished launch copy without “In development”
or “Upcoming” badges, and will deploy the redesigned site only after the new
app release goes live. **Do not merge/deploy this launch draft before the app
release containing uBO and Horizon Shield ships.** Candidate-backed wording is
recorded separately in `docs/website-blocking-launch.json`. Before publishing,
reconcile that ledger against the actual immutable public tag and completed
release evidence, including platform availability. Include the restored feature
pages and Support/Trust guides in the release-copy reconciliation, especially
blocking-provider and extension-runtime language. The v1.26 claim ledger does
not establish that these new capabilities are shipped.

Private-tab behavior, separate provider site settings and the required restart
remain visible. The concise Blanc Blocker description names Ghostery’s engine,
EasyList ad filters, EasyPrivacy tracker filters and bundled scriptlets. These
components were verified against v1.26.0 `adblock.js`, `adblock-snapshot.js`,
`adblock-scriptlets.js` and the pinned source manifest; the uBO candidate
retains that stack. Existing setup defaults, optional connection gating, measurement
disclosures and links to Trust remain on the homepage. The prior illustrative
site switch was removed; current site controls remain described in Trust.

Verification: `npm run site:build` passed with SEO/link/image checks. All 21
focused website, model, motion and dependency-boundary tests passed. Browser checks at
855×792 and 390×844 showed loaded artwork, no horizontal overflow and readable
copy. The browser demonstrated the 0° and 360° endpoints and reverse scrolling;
reduced-motion initialization, preference changes, lazy loading and failure
fallback passed executable unit coverage. Geometry tests verify identical front
and back UVs/relief, actual thickness, closed welded edges, and outward-facing
side triangles. Both side profiles were visually inspected after correcting
side winding. The dependency audit and regenerated site SBOM compliance check
also passed. No browser console warnings or errors were captured. The development
site remains open at `http://127.0.0.1:4321/#privacy`.

The earlier scroll start and softer satin finish were checked in the development
browser. Both faces retain the brushed texture with reduced highlights, and the
turn is visibly underway as the section enters. All five shield tests and the
production/SEO build pass after this refinement; the browser logged no warnings
or errors.

The branch also incorporates main through `03621de6`, bringing in the approved
shield asset and resolving the duplicate http-cache-semantics review while
retaining both reviews' bounded checks. No deployment was performed.

The owner's later October 3 color correction replaces bright yellow gold with
the original Sunrise sun's copper/bronze family. The bronze master feeds the website 960px WebP and both 3D faces. The
owner’s final Island correction restores the original shield-and-diagonal SVG in both the
app and enlarged hero; the native raster icon is retired. The rim is bronze and the key light is more neutral to
avoid reintroducing a yellow cast. The final alpha silhouette was retraced for
the closed 3D model. Original approval evidence remains pinned separately from
the recolored master and its exports in the launch ledger; the edit prompt is
recorded in `docs/verification/2026-10-03-horizon-shield-bronze.md`.

## Separate app and website delivery

Owner correction, October 3: the bronze shield must ship in the app before the
website deploys. App-only PR #502 (`codex/horizon-shield-bronze`, artwork commit
`5f8be929`) targets `main` and owns the shared bronze master, restored original
blocker SVG and app brand/provenance records. It contains no website
files. Website PR #491 temporarily targets that app branch so the native
changes are excluded from its review. This website PR owns the WebP export,
closed 3D outline and bronze rim/light adjustments, hero and launch ledger.

After #502 merges, retarget #491 to `main`. Publish and verify the next app
release containing the shield and required blocking changes, then reconcile
this site's release evidence before merging and deploying #491. Merging the
app artwork alone does not satisfy the website's public-release gate. Never
make the app release depend on merging or deploying the website redesign.

Bronze validation: 38 focused native-resource, shield, hero and product-evidence
tests pass, including byte-for-byte reproduction of the bronze website export,
exact native SVG extraction for the hero and closed 3D geometry. Production/SEO build and lint pass. The
hero icon, front/back and bronze side wall were inspected at 855×792, without
page overflow or console warnings/errors. The native SVG was reviewed through the source-derived hero in light and dark
appearance; no fresh native launch or packaged app release occurred here.

The owner preferred the original Blanc Blocker icon over the new Horizon
outline. Its SVG, 1.4-unit stroke and badge styling are restored directly from
`03621de6^` in app PR #502, and the hero extracts that exact original markup
and native CSS. The large bronze Horizon illustration remains unchanged.

The hero now uses the active ink-colored shield and a fixed one-count badge
matching the owner's supplied original-icon reference. Previously it forced
the native quiet/zero-count state, which is intentionally gray in the app.
The figure's accessible description identifies its tabs and badge as an
illustration; it is not a live measurement of blancbrowser.com. Native state
colors and blocking behavior remain unchanged.

## Bronze Blocker display variant (October 3)

The Privacy section now previews a second bronze 3D shield whose peaked top,
curved lower sides and diagonal slash follow the original Blanc Blocker icon.
The existing layered Horizon artwork and model remain available through the
default HorizonShield component; the homepage selects its blocker variant.
The new model has raised diagonal relief and closed bronze walls, with identical
front and back artwork. Both variants retain the existing lighting, scroll
rotation, reduced-motion handling and static fallback. The original monochrome
Island icon and app-only PR #502 are unchanged. Generation prompt, references
and export details are in docs/verification/2026-10-03-blocker-shield-bronze.md.

## Gentle left/right Island turn (October 3)

The hero Island no longer has the steep fixed backward pitch or scroll
parallax. It turns five degrees left and right around its vertical axis on an
eight-second eased cycle, with restrained perspective and no in-plane tilt.
Its native geometry and typography remain unchanged. Motion pauses offscreen
and in hidden tabs; reduced motion shows a level, stationary front view.
Native sizing and appearance synchronization with the wallpaper demo are
retained.
