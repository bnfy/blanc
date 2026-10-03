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

The indexed route count falls from 27 to 10:

- `/` — visual product story and in-page Features tour.
- `/support` — practical guides and the existing straight answers, searchable.
- `/trust` — engine, connections, choices, release evidence and known limitations.
- `/download`, `/about`, `/changelog`, `/press`, `/ambassadors`, `/privacy`, `/terms`.

`/import-tabs` remains an unlisted handoff utility and `/404` remains a real
noindex 404. Sixteen dedicated feature pages, FAQ and How It Works consolidate
into Support and Trust. The former Features directory redirects to the homepage
tour. Twenty legacy paths have direct redirects and local static fallbacks;
trailing-slash variants are included. Old section names are retained, and a
query-based topic fallback lets an existing URL fragment survive HTTP redirects.
Release-note data remains immutable; old internal links resolve while rendering.

## Trust and transparency retained

| Existing element | New placement / guard |
| --- | --- |
| Chromium + Electron icons and explanation | Homepage foundations, directly below the feature shortcuts; `/trust#engine` |
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

`website-revamp-claims-v1.26.json` records 558 current exact-wording claims and
157 retired source strings. Retired strings are predominantly repeated feature
summaries, replaced marketing headings, old image descriptions and the previous
homepage demo. This is not a record of removed capabilities: practical content
and qualifications remain in the corresponding guides. The prior claims ledgers
remain unchanged. New homepage wording is tied to immutable release paths;
public authentication links use the completed post-release evidence revision.

## Visuals and interactions

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
- `npm run site:build`: passed. SEO verification covers 12 real pages and 10
  sitemap URLs; 20 noindex legacy fallbacks are separately verified. The build
  now also checks duplicate IDs, internal fragment targets and local images.
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

No desktop product release is required. After approval of this concrete preview,
follow the root AGENTS.md website protocol: commit and push, create the PR,
wait for protected checks, merge normally, deploy the exact new main commit,
and verify the canonical site and Cloudflare Production SHA. Local success is
not a claim that Cloudflare redirects or the canonical deployment have shipped.
