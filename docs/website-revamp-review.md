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

The original `website-revamp-claims-v1.26.json` review recorded 892 current exact-wording claims and
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
lazily. The Island now uses lossless center crops of fresh native v1.26.0
screenshots of NASA's Cosmic Cliffs image page. Asset hashes, native capture
provenance and hardware prompts are committed beside this record. Source
attribution is shipped in `site/public/revamp/credits.txt`, linked in the footer.
The former white veil and visible captions below the Island are removed;
state announcements and navigation instructions remain available to screen readers.

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

## Cosmic Cliffs Island scene (October 3)

Replaced the Wikipedia captures with three actual installed v1.26.0 states on
NASA Science's Cosmic Cliffs page. The app signature and five native renderer
files were verified against the public release before capture. Lossless WebP
exports preserve the exact decoded pixels inside the documented center crop.
Removed the white page veil and visible caption/source lines; credits now live
in the footer and screen-reader instructions/state announcements remain.

Validation: production site/SEO build, ESLint, and all 13 feature-evidence and
revamp-trust checks passed. Desktop and 390px mobile previews have no horizontal
overflow or browser warnings/errors. State buttons, the native-positioned
open/close hotspot, Escape, and sequence play/pause were verified in the browser.
The demo profile's sample window was closed. Website PR #491 remains a draft;
no production deployment or desktop app change is included.

## Reveal slash commands (October 3)

The Find a command step now shows a fresh native capture with `/` entered,
revealing the unfiltered list instead of selecting `/new`. The reveal extends
through the demo viewport, showing the beginning of the available commands;
additional commands are reached by scrolling the list in the real app. Updated
the accessible state description and recorded its exact public-release evidence.
The center crop remains lossless and the source/export hashes are refreshed.
Desktop/mobile preview, production site/SEO build and all 13 evidence/trust
checks passed. No visible caption or app change was added.

## Compact mobile Island controls (October 3)

At widths up to 760px, the Island switcher uses three equal-width segments
with short labels (At rest, Tabs, Commands) and an adjacent circular playback
button. All four targets are at least 44px tall. Playback retains its descriptive
accessible Play/Pause/Replay label; desktop keeps the longer visible labels.
Verified alignment and no horizontal overflow at 320px and 390px, keyboard
arrow navigation, and play/pause. Production site/SEO build and all 13
feature-evidence/trust checks passed.

## Full-viewport opening (October 3)

The opening now fills one viewport with the unchanged tagline, download links
and animated native Island. The MacBook wallpaper demo starts in its own
section below the fold, retaining its existing captures, controls and responsive
device proportions. The Island's appearance still follows the wallpaper's
light/dark selection across the separate sections. A 100vh/100svh minimum
height allows enlarged text and short landscape windows to grow without clipping.

Verified a 792px hero at 855×792 and an 844px hero at 390×844, with the MacBook
below the fold and no horizontal overflow. The relocated demo's time slider
and appearance switch work, all images load, and the browser reports no
warnings/errors. Production site/SEO build, ESLint and all 16 native-Island,
feature-evidence and trust checks passed. Website PR #491 remains a draft.

## Review findings addressed (October 4)

The newsletter honeypot now owns its hiding rule inside NewsletterForm, so
footer class changes cannot expose it. Verified desktop and 390px mobile:
opacity zero, 1px width, positioned offscreen, no horizontal overflow, and
Tab moves directly from the email field to Subscribe. No signup was submitted.

Restored the homepage's existing download_click, feature_cta_click and
supporter_click hooks with their CTA positions and feature names. The hero
also retains its prior platform-aware download behavior; the closing chooser
continues to open /download. An offline regression test reads the actual CTA
markup and exercises site.js with unset, denied and granted consent: only the
granted case dispatches events. No live analytics event was sent during testing.

Trust and the retained security guide now distinguish Blanc Blocker from the
optional bundled uBlock Origin provider, without claiming general Chrome Web
Store support. Their URLs, metadata, anchors and remaining prose are preserved.
The exact copy corrections are recorded in the preservation ledger; the uBO
paragraphs stay in the separate release-gated ledger. Candidate evidence was
refreshed to merged PR #490 revision b0462db0f10a12fc40f5edbbf1650cc5487a6cbf,
including the provider, settings, build/platform eligibility and file hashes.
A merge is not public-release evidence: publication still waits for the app.

Validation: production site/SEO build and all 37 focused consent, navigation,
claims, shield and trust checks passed. Browser checks confirmed the Trust deep
link opens the revised disclosure and both tested mobile pages fit the viewport.

## Adopt a Pixel Island scene (October 4)

Replaced the three Cosmic Cliffs stills with native captures of NASA Science's
Adopt a Pixel section, featuring the darker Roman telescope illustration. The
center crop keeps the native Island geometry and puts the telescope below it;
the NASA headline is outside the displayed crop. The resting backdrop received
a final framing adjustment; only the panels from the other stills are revealed
by the existing transition masks. No product pixels were repainted.

Captured installed public v1.27.0 in a separate Launch demo window. Strict deep
codesign passed outside the sandbox, and the five renderer files match release
602a1a85a9b80453b2561b3e10c5e5795c3ff659. The sample window was closed. Updated
asset hashes, capture history, accessible descriptions and shipped source credits.
This only updates the Island demo's version evidence; other historical demo
captures retain their recorded versions.

Validation: all three images load; desktop and 390px mobile rest/tabs/commands
previews checked with no horizontal overflow. Site build and SEO verification
passed (29 pages / 27 sitemap URLs); 13 focused feature-evidence, launch-claims
and trust regression tests passed. No production deployment.

## Tabs and sessions simplification (October 4)

The prior section put fabricated tab-group and recovery controls beside one
another, followed by profiles, Sync and Workspaces prose. Replaced that cluster
with one full-width native named-groups capture, a single introduction and a
compact row of links to the retained feature pages. The image is static and unlinked;
it does not pretend to be a working app. Removed the obsolete mockup handlers
and styles. Native group bands, counts, keyboard shortcuts, page titles, icons
and footer controls are preserved. Capture provenance and credits are recorded
in website-revamp-assets.json and the shipped credits file.

Named groups were created manually in installed public v1.27.0 using four
sample NASA/Wikipedia tabs in a separate Launch demo window, which was closed
after capture. Exact-tag v1.26.0 overlay groupHeaderRow and groupBand also support
the narrowed homepage copy; replaced claims were archived in the claim ledger.
The guides retain recovery limits, profile/Sync boundaries and workspace terms.
No trust evidence or feature landing pages were removed.

Validation: desktop and 390px mobile reviewed, native screenshot loads without
horizontal overflow, the image is unlinked and guide links remain keyboard
reachable, no browser script errors. All 26 focused website feature-evidence,
trust and attribution checks pass; site build and SEO checks pass. No deployment.
# Shield preview recovery — October 4, 2026

- Reproduced a static shield while the scroll controller continued updating its angle. The lazy renderer's Three.js dependencies returned HTTP 504 `Outdated Optimize Dep`: the running dev server's dependency cache had been replaced.
- Isolated Vite caches by Astro command so a production build cannot overwrite the live dev preview's optimized modules. Renderer initialization failures now emit a diagnostic warning while retaining the static fallback.
- Verified the real WebGL canvas loaded, ran `npm run site:build` while the dev server remained open, then reloaded and verified the canvas still loaded. Scrolling moved the solid shield from 171° to 245° and back to 134°, with its bronze side visibly rendered. All six shield tests and the site/SEO build passed.

## Astro dependency refresh (October 4)

Updated Astro 7.3.2 → 7.3.5, its Vite dependency 8.2.1 → 8.3.2,
and Sharp 0.35.4 → 0.35.5. Astro resolves its own compiler update to 0.5.1.
Updated http-cache-semantics to 4.3.0; the website now has zero npm audit
findings. Re-reviewed and updated the dependency evidence and guards; the
desktop dependency graph was not changed.

Raised the site's declared Node minimum to 22.19.0 to match the already-locked
Undici requirement. Build and preview were verified using available Node
24.19.0; the preview stays on port 4321.

Validation: site build and SEO checks pass (29 pages, 27 sitemap URLs); all
76 site, website and dependency-review unit tests pass. Dependency security
policy passes across all four lockfiles. Browser check: no script errors or
Vite overlay, Island command switching works, wallpaper advances through its
phases and pauses, and the WebGL shield rotates with scrolling. At 390px, no
horizontal overflow and the native tab-group image remains loaded and unlinked.

## Feature naming in homepage copy (October 4)

Owner direction: name the feature and say what it does. Avoid poetic headings
that require visitors to infer the product feature from a screenshot or the
paragraph below. Keep the approved tagline, “A little less browser.”

The homepage now names Start Page layouts, tab groups, ad blocking, Glance,
mouse gestures, Quiet Tabs and Mahjong directly. Existing capability limits
and transparency disclosures remain in place; exact-wording ledgers were
updated. Desktop and 390px previews, 13 claim/transparency tests, the site build
and SEO checks pass.

## Compact homepage trust section (October 4)

Kept the three technology, licensing and release-evidence columns. Removed the
large introductory headline and the disclosure block. A small attribution row
names Bananify, with direct links to About, source code and Trust. Owner direction:
the homepage should focus on the browser, with detailed development-process,
AI-assistance, audit-status and licensing information on linked pages. Those
existing disclosures remain on About, Trust and Support; the regression guard
checks their availability there. The homepage does not name the individual
maintainer. The three columns stack on mobile. Desktop and 390px previews,
the 13 trust/claim checks, site build and SEO checks pass.


## Mouse gesture demo redesign (October 4)

Replaced the small beige arrow illustration with a full-width dark stage,
large action typography, layered native browser captures and an animated
bronze cursor trail. Back, Forward and New tab each draw the corresponding
default gesture and show the destination after release. The stage is labelled
as a demo; its perspective, trail and page transitions are website illustration,
not a recording of the native app overlay. Existing NASA and Start Page assets
retain their original provenance and credits.

One introductory sequence plays on entry, then stops. Buttons replay each
action, reduced motion shows the result immediately, and leaving the viewport
or hiding the document cancels active work. The description names the feature
and its outcome directly; a short setup line preserves the off-by-default
setting and mouse/trackpad triggers.

Verified desktop, 390px and 320px layouts, keyboard activation, all three
outcomes and loaded image assets, with no horizontal overflow or browser errors.
All controls provide at least 44px height. The four controller tests cover
release timing, rapid selection changes, replay, reduced motion and visibility.
Together with the claim and trust checks, 17 focused tests pass. Site build
and SEO checks pass (29 pages, 27 sitemap URLs).

## Glance examples and controls (October 4)

Replaced the self-referential Blanc FAQ/About content with a travel-planning
pair: Visit Copenhagen’s Nyhavn page and Louisiana Museum’s Kusama installation.
The responsive excerpts use the official pages’ photography and favicons;
they are labelled as an interactive demo rather than native app footage.
The Island chrome comes from the real renderer markup/styles with sample
domains; swapping pages updates both the domain and reference title. Each
instance namespaces its extracted IDs. Source URLs, hashes, credits and the
third-party licensing boundary are recorded with the website assets.

Moved the resize instruction above the preview, paired it with a resize icon
and an Interactive demo label, and gave all controls visible button shapes.
The toggle uses the owner’s labels: Open Glance view / Close Glance view.
On mobile, buttons retain their touch targets while the entire desktop demo
scales proportionally; the preview never becomes a phone browser.

Verified desktop, 390px and 320px layouts, loaded assets, no horizontal overflow,
divider dragging, keyboard End, swap metadata, reset, close/reopen and focus
return. No browser console errors. All 20 focused native-Island, gesture,
claim and trust tests pass. Site build and SEO checks pass (29 checked pages,
27 sitemap URLs); the existing large-chunk advisory remains. Proof images:
blanc-production-review/glance-vibrant-desktop.png and glance-vibrant-mobile.png.

## Homepage appearance (October 4)

The wallpaper Light/Dark button now sets one homepage appearance on the document
root. Light remains the default; only an explicit choice is saved under
`blanc-home-appearance`. A small, self-contained head script restores the choice
before paint, with Light as the fallback for invalid values or unavailable
storage. Glance Island illustrations also initialize their palette inline.
Other pages do not receive the homepage appearance attribute or bootstrap.

Dark mode uses a continuous warm-charcoal to near-black canvas, soft-white text,
bronze accents, transparent control trays, a dark header, and a near-black footer.
The newsletter, Privacy choices dialog, and skip link are themed as well. Patron
and gesture panels retain independent on-dark colors. Real captures, video,
photography, hardware, Sunrise artwork, and bronze shield materials are unchanged.
Glance chrome switches its native appearance tokens. Following owner review,
the animated hero Island keeps its native light surface in both themes for
stronger contrast against the dark canvas, with its existing soft shadow.

The appearance controller and wallpaper capture controller are separate small
modules. Manual toggling pauses playback and keeps the chosen phase. Generation
checks prevent stale decodes from winning; a failed capture keeps the last valid
scene and its accurate accessible description. Background layers and interface
colors transition over 250ms; reduced motion removes those transitions.

Verified the eight wallpaper phase/appearance combinations in the browser,
Enter and Space activation, unchanged scroll position while toggling, saved Dark
after refresh, unchanged Start Page/Glance selections, and light Support followed
by restored homepage appearance. Inspected desktop, 390px, and 320px layouts with
no horizontal overflow, including native chrome, controls, footer, dialog, and
skip-link focus. Browser console reported no errors. The darkest theme's lightest
canvas gives body text 13.95:1 contrast, secondary labels 8.27:1, and bronze accents
7.20:1; selected button text is 15.51:1. Built output's prepaint bootstrap was also
executed independently for absent, Light, Dark, and invalid preferences.

All 38 focused appearance, wallpaper, native Island, gesture, Mahjong, shield,
claim-evidence, and trust tests pass (including storage failure, stale decodes,
failed captures, and reduced-motion controller behavior). Site build and SEO
verification pass for 29 pages and 27 sitemap URLs. No deployment. Proof images:
`blanc-production-review/dark-home-hero.png`, `dark-home-mobile.png`,
`dark-home-glance.png`, and `dark-home-footer.png`.

## Review fixes and hero mark (October 4)

Start Page layout changes now commit the selected control, description, and
visibility only after the replacement capture decodes successfully. Failed
loads retain the previous selection and capture; newer requests or opening
Mahjong invalidate pending loads. Returning from Mahjong reuses the valid capture.

The animated hero Island now has a 44px pause/resume button for keyboard and
touch users. Manual pause survives visibility changes, hover pause remains,
and reduced motion removes the animation and hides the unnecessary control.
The original Sunrise artwork now matches the live hero's 66px desktop and
54px mobile sizing.

Verified keyboard Space/Enter, mobile pause, all four layout selections,
Mahjong return, both theme colors, and desktop/390px/320px layouts without
horizontal overflow or console errors. All 43 focused website tests pass,
including failed and racing image loads and persistent animation pause.
Site build and SEO verification pass (29 checked pages, 27 sitemap URLs).
No deployment. Proof: `blanc-production-review/hero-larger-sun-and-pause.png`.

## Merge preparation and public release reconciliation (October 4)

The owner requested squash merge of PR #491. Main now includes independently
verified public v1.27.0 at `602a1a85a9b80453b2561b3e10c5e5795c3ff659`, with completed
release evidence pinned at `7ca557b04dc723ca6158cce3ef4ea8aeb29f03da`.
The new `website-revamp-claims-v1.27.json` ledger includes the formerly gated
blocking-provider claims and the actual four-platform support boundary; Intel
under Rosetta remains excluded. Trust links to the current release and its
completed public verification. Historical recordings keep their original versions.

Resolved main conflicts while retaining the redesign, both dependency reachability
reviews, the uBO payload guards, current release metadata, and Windows-safe
navigation module imports. Website deployment remains a separate action.

The newer Privacy & Security page at `/trust` remains intact and now has a
direct Privacy & Security link in the desktop header and footer. The older
`/features/security` page is separately labelled Security guide in the footer;
its search metadata and URL remain unchanged. Current-release verification links
are reconciled on both pages. Mobile visitors retain direct footer access.

Final local merge validation: all 2,275 unit checks pass. Lint, dependency
compliance, advisory policy, changelog freshness, and site/SEO build pass.
Responsive Security and footer checks at desktop, 390px, and 320px show no
horizontal overflow. Owner clarification confirms `/trust` is the newer page
to surface; its content was preserved throughout the redesign.

CI follow-up: the shield export guard now checks decoded pixels and the alpha
silhouette rather than comparing freshly encoded WebP buffers byte for byte.
Platform encoder differences made the old assertion exhaust memory on Windows.
The committed master, display export, outline, and native icon still require
their exact ledger hashes. The pixel check verifies the 960px export geometry
and bounds visible color differences within the existing lossy export quality.
The six focused shield checks and lint pass locally after this correction.

## Homepage audit fixes (October 4)

The hero small print now leads with "Free and open source. Ad and tracker
blocking is on by default." The Patron offer stays in the tab-groups note and
the Patron card. The privacy section leads with the default: "Ad and tracker
blocking, on by default." Its lead names Blanc Blocker as on from first launch
and uBlock Origin as the regular-tab option on supported builds. Both match
public v1.27.0 (`adblockEnabled: true`, `adblockProvider: 'blanc'`).

The wallpaper preview gains a kicker, heading and lead. They explain that
Time-of-day wallpaper is turned on in Settings → General; it is off by default
in v1.27.0. The heading wraps with `text-wrap: balance` rather than a forced
break, which left "Page" orphaned at desktop widths. The caption is a single
row: play button and time slider.

Homepage appearance supersedes the earlier note above. Light was the documented
default; the page now follows `prefers-color-scheme`, including live system
changes, until the visitor uses the new header Dark mode toggle. A manual choice
is saved under `blanc-home-appearance` and wins from then on. The toggle replaces
the wallpaper Light/Dark button, appears only on the homepage, keeps a stable
"Dark mode" name, and reports state through `aria-pressed`. If the system theme
cannot be queried, the page starts light and the toggle still works. Below 380px
the header tightens its gap and gutter while the toggle is shown, so it fits
beside the Download pill at 320px.

"Ready to try Blanc?" now precedes the Patron card as an h2. It is the larger
of the two at every width: 96px against a 68px Patron title and 80px price at
1440px; 48px against 36px and 48px at 320px. The closing links' inline margin
moved into CSS. The detailed Patron lapse paragraph remains on the homepage
because the trust and public-truth tests require it there.

The claim ledger retires `reddit-393`, `blocking-127-1` and `blocking-127-2`
with reasons. It adds seven entries for the new copy and a `blockingDefault`
evidence group citing `src/main/settings.js`. The blocking launch record carries
the two reworded privacy claims and pins `settings.js` to its v1.27.0 hash.

Verified: 119 site, claim, trust and Patron checks pass, including four new
system-preference cases. Each of three deliberate controller mutations failed
at least one of them. Site and SEO build pass (29 pages, 27 sitemap URLs). Layouts
at 1440, 1024, 768, 761, 390, 380, 360, 340 and 320px show no horizontal page
overflow and no header wrap; light and dark were both captured at 1440 and 320px.

Still pending, and needing the owner's machine with public v1.27.0: Start Page
recaptures with a non-zero weekly blocked count, and with Patron active so the
upgrade pill is hidden.

Resolved October 4 (see *Capture review* below): the owner judged the existing
captures still accurate, so no recapture is scheduled.

## Phones and small fixes (October 4)

Round 2, milestone A+B of the homepage audit
(`docs/superpowers/specs/2026-10-04-homepage-audit-round-2-design.md`).

Phones and tablets: Blanc is desktop-only, so on a phone or tablet the hero
button reads "Send to my computer". It opens the device's share sheet with the
`/download` link; if sharing is unavailable or fails it copies the link and
says "Link copied"; if copying also fails it opens `/download`. Cancelling the
share sheet does nothing else. `/download` shows the same button in an "On a
phone or tablet?" notice. Detection matches Android, iPhone, iPad and iPod user
agents, plus a Mac user agent with more than one touch point (iPadOS requests
desktop sites). The share path removes the hero's `download_click` tracking,
because nothing is downloaded; no analytics event was added. Without
JavaScript both buttons stay plain links to `/download`. The logic lives in
`site/src/scripts/handheld-download.js` with its own unit tests.

Small fixes: the header Download is a pill at every width, with a light
hover in dark mode. When the hero downloads the installer directly it says
"Download for Windows" or "Download for Linux"; macOS still leads to
`/download`. The closing macOS, Windows and Linux labels link to their
download cards. The served theme colour is `#ffffff`, matching the solid
header before any script runs. Standalone links on the homepage, the footer
and `/download` now have at least a 24px target; border-underlined links grow
upward so their underline stays under the text. The unused
`hero-wallpaper.js` is deleted, and `site/CLAUDE.md` now says the homepage
header is solid from the start, hides while scrolling down and returns on
scroll up. The warm-to-white background gradient is unchanged and now has a
guard test.

Verified: 2,289 unit checks pass, including seven new phone-module checks,
a platform-label check and two theme checks; deliberately breaking the
cancel handling and the gradient direction each failed the expected test.
Lint, substrate checks and the site and SEO build pass (29 pages, 27 sitemap
URLs). The share and copy paths were exercised on an emulated Android phone
on both pages, and desktop was confirmed unchanged. At 1440, 1024, 768, 761,
390, 380, 360, 340 and 320px in light and dark there is no horizontal
overflow and the header stays on one row with the toggle beside Download.

## Page weight (October 4)

Round 2, milestone C of the homepage audit. Measured against the production
build (`astro preview`), counting response bytes, before the first scroll
(after load plus 2.5 s) and after scrolling the whole page:

| | Before | After |
|---|---|---|
| Phone (390px), before first scroll | 2,339 KB | 596 KB |
| Phone, whole page | 4,532 KB | 1,399 KB |
| Desktop (1440px), before first scroll | 1,317 KB | 503 KB |
| Desktop, whole page | 4,532 KB | 1,508 KB |

On a 1.6 Mbps, 150 ms link the desktop page now finishes loading in about
2.7 s (first contentful paint about 0.95 s); the audit measured 11.6 s.

- Only the visible wallpaper scene loads with the page; the other seven load
  when first selected (`data-src`, handled in `wallpaper-preview.js`).
- `site/scripts/build-display-images.mjs` derives lossy WebP display copies:
  800px phone copies of the Island captures (served under 760px through
  `<picture>`), full-size copies of the Island captures and both device
  frames, and copies of the five v1.21.0 Start Page captures that keep their
  Display P3 profile. Sources are untouched — the lossless frames and Island
  captures stay pinned in `docs/website-revamp-assets.json`, and the PNG
  captures stay pinned and remain the linked full-size originals. Each copy
  records its source SHA-256 in `site/src/data/display-images.json`;
  `test/unit/website-display-images.test.js` fails when a source changes
  without regenerating. Mean pixel difference is under 2/255.
- The shield fallback image now uses `crossorigin="anonymous"`, matching the
  three.js texture request, so it downloads once instead of twice.
- 162 lines of CSS for retired mockup classes were removed after confirming
  none of them appears in any built page or script.
- Not changed: Inter is still fetched twice (about 47 KB). The hero renders
  with the app's own `inter-latin.woff2` so it matches the shipped Island
  exactly; the rest of the site uses Fontsource's build of the same face.

## Readable screenshots on phones (October 4)

Round 2, milestone D. Below 760px the homepage hides both device frames
(lazy and hidden, so phones never download them) and shows each capture in a
plain rounded 4:3 card, zoomed onto the part that matters: the clock,
favorites and Patron pill for the wallpaper scenes and Billboard; the
favorites list for Ledger; the cards for Shelf; and the "Blocked this week"
chart for Tally. The crop is CSS on the same release capture, so the wallpaper
slider, the theme toggle and the layout switcher keep working and the crops
follow any future recapture without regeneration. Offsets are percentages of
the card, so the same detail shows from 320px to 760px. The Island demo is
unchanged: it already crops to the bar on phones and its layered, clickable
animation depends on the full capture geometry. Desktop is unchanged. A unit
check keeps the phone rules in place.

## Homepage content (October 4)

Round 2, milestone E, using the wording approved in the round-2 spec (§8):
the hero lead now says what the Island leaves you (the rest of the window for
the page); a new "Switching to Blanc" section covers bookmark import, Bring
Your Tabs, vertical tabs and default-browser setup; the closing line names
Bananify as an independent software studio; the data paragraph becomes a
"What Blanc sends" list with the same facts plus the search-suggestion detail
from the privacy policy; the Patron boundary is two sentences (the
lifetime-supporter line stays on Support, About, Download and the Workspaces
guide); the 1Password and Quiet Tabs small print is shorter; and the header's
Features link opens the `/features` overview. The claims ledger retires the
seven replaced entries with a reason and adds the new wording; Bring Your Tabs
cites a new `tabImport` evidence group (`chromium-session.js` and the
tab-import modules at v1.27.0). The trust test's pinned disclosure phrases
were updated in the same commit.

## Text sizes and a shorter tools section (October 4)

Important homepage copy no longer sits at 11–12px: the hero's "Free and open
source…" line and the privacy intro are 14px; small print, the Patron price
and boundary, the blocking-provider note, closing links and the gesture setup
note are 13px; tool-card text is 14px. Section kickers stay at 11px.

"Everyday browser tools" shows one demo at a time behind a Glance / Mouse
gestures switch (`site/src/scripts/tool-demos.js`), reusing the Start Page
layout picker's style. At 1440px the section drops from 2,113px to 1,327px.
Without JavaScript both demos stay visible and the switch stays hidden; a
link to `/#gestures` opens that demo. Phones get an 800px copy of the Nyhavn
Glance photo (171 KB to 111 KB); a WebP copy of the Kusama JPEG came out
larger than the original, so it is unchanged.

## Capture review (October 4)

The owner reviewed every product capture on the live site, which come from
public v1.15.0 and v1.21.0 (`docs/website-captures-v1.15.json`,
`docs/website-captures-v1.21.json`, plus the v1.25 trust and wallpaper
manifests), and found none out of date against public v1.27.0. The captures stay
version-labelled and paired with their own release evidence; nothing was
regenerated or relabelled.

This closes the pending Start Page recapture. That item asked for cosmetic
improvements (a non-zero weekly blocked count, and Patron active so the upgrade
pill is hidden), not a correction. Retake a capture only when the interface it
shows changes in a public release, and record the new capture in its own
release-bound manifest.
