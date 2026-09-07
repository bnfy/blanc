# v1.15 website expansion — implementation and production evidence

Status: implemented, merged, and deployed to production on September 4, 2026
(ET). No desktop behavior or app release was changed.

## Scope

- Public product truth: v1.15.0 at
  `d0c2304c7cef12a6fa0d66c559aebb1198a86434`.
- Website working-tree baseline:
  `6fc13523198920f6c9ed8d6e88c2d13abdff3f3a`.
- Five new guides, fourteen-guide hub and navigation, homepage Start Page
  showcase and six-card grid, Island/Security/Command Palette/Sync expansion,
  Download/FAQ/Press updates, sitemap and metadata are implemented.
- The interactive homepage demo remains. Owner-requested follow-ups preserve
  lowercase breadcrumbs, remove black screenshot-corner backing, keep the
  mega-menu spotlight compact, remove excess mobile caption height, and use
  the fuller Turtle / Classic Mahjong capture.
- Ten reviewed native captures and five distinct generated 1200×630 social
  cards are included. The historical Blanc 1.0 press announcement is unchanged.
- Existing `feature_cta_click` is reused; no new telemetry event was added.
- Unrelated marketing/social and security-evidence working-tree changes are
  outside this website handoff and must remain excluded from its commit.

## Evidence

- `website-v1.15-claims.json`: 240 exact-wording entries with immutable-tag
  evidence groups and required qualifications. New-guide paragraphs are
  checked for coverage and wording drift by unit tests.
- `website-captures-v1.15.json`: public artifact identity, isolated settings,
  capture states, dimensions, and image hashes.
- `website-capture-provenance-v1.15.md`: capture method and owner-selected
  Mahjong replacement details.
- `site/scripts/render-og-cards.mjs`: eleven-entry generation manifest,
  including the five new native-capture cards. Existing six exports were not
  regenerated. New outputs were individually visually reviewed.

## Verification results — September 4, 2026

| Gate | Result |
| --- | --- |
| `npm run site:changelog:check` | Pass; 82 public releases match committed data |
| Targeted navigation/public-truth/OG/website-evidence unit tests | 25 passed |
| `npm run test:unit` | 1,439 passed; 0 failed |
| `npm run site:build` | Pass; brand assets current; 24 pages and 24 sitemap URLs pass SEO checks |
| Chromium: `BLANC_SITE_URL=http://127.0.0.1:4322 node --test --test-concurrency=1 test/site/*.test.mjs` | 32 passed; 0 failed |
| WebKit: same command with `BLANC_SITE_BROWSER=webkit` | 32 passed; 0 failed |
| `git diff --check` | Pass |

Browser coverage includes 360/768/1440px layouts, images loading without
horizontal overflow, six cards with JavaScript disabled and reduced motion,
all new guides, exact menu/H1 parity, mobile menu access, keyboard traversal
and focus indicators, image downloads, existing demo chapters, and the full
existing footer/newsletter suite with intercepted subscription responses.

The first unit run identified the missing ignored blocker-seed binary.
`node adblock/seed.mjs --prepare` recreated it against the tracked pinned
manifest without modifying desktop sources or approving new blocker inputs.
The final full suite passed. The WebKit runtime was installed through the
repository's Playwright CLI. Browser tests use Option-Tab for default macOS
WebKit link traversal and disable cache for fresh route-response checks;
site behavior was not changed to bypass those tests.

## Review, merge, and production rollout — September 4, 2026 ET

- Website PR: https://github.com/bnfy/blanc/pull/295, merged at
  `2026-09-05T02:54:14Z` (September 4, 10:54 p.m. ET).
- Reviewed PR head: `5d05dcaf1c5772aeb1e32d257f1a19eb6bda788c`.
- Merged and deployed source: `fa429420b52b25bbec8de8c0884ff41845edd1f1`.
- All checks passed before merge: Site build, substrate/unit regression,
  acceptance wiring, OAuth compatibility, JavaScript analysis, and the
  CodeQL pull-request alert gate. Required checks were not bypassed.
- The first CodeQL run flagged incomplete-tag stripping and sequential entity
  decoding in the new test-only claim normalizer. Commit `5d05dca` consumes
  incomplete tags and decodes entities in one pass. Its targeted tests and
  subsequent complete CI checks passed; no alert was dismissed or suppressed.
- CI now fetches public tags for the claim ledger's immutable-release checks.
- `npm run site:deploy` ran from a clean detached worktree at the merged SHA,
  reusing the already-tested local dependency installations. The command
  repeated brand, Astro build, and 24-page/24-URL SEO verification successfully.
- Cloudflare deployment: `539bd95b-285b-401b-a100-688cf7d5e581`.
  `wrangler pages deployment list --project-name=blancbrowser
  --environment=production --json` confirmed **Production**, branch **main**,
  source **fa42942**, matching the full merged SHA above.
- Immutable deployment URL: https://539bd95b.getbowser.pages.dev.
- Canonical site: https://blancbrowser.com.
- Live SEO audit passed for all 24 sitemap pages and 24 internal HTML
  destinations. This includes the homepage, feature hub, all five new guides,
  supporting feature guides, Download, FAQ, and Press.
- At `2026-09-05T02:55:10Z`, all ten canonical native-capture URLs and five
  canonical social-card URLs returned HTTP 200 with PNG content types, the
  expected 1440×900 or 1200×630 dimensions, and SHA-256 hashes identical to the
  reviewed files in the merged checkout. The published Mahjong capture is the
  Turtle / Classic replacement recorded in the capture manifest.
- Canonical Chromium verification passed 12/12 tests with
  `BLANC_SITE_URL=https://blancbrowser.com node --test --test-concurrency=1
  test/site/feature-expansion.test.mjs test/site/masthead.test.mjs`.
  It covered 360/768/1440px layouts, lowercase breadcrumbs, transparent capture
  corners, all five guides, unique metadata, keyboard access, the fourteen-guide
  feature hub/menu, compact spotlight, mobile accordions, six no-JavaScript
  cards, and actual Press PNG downloads. No page errors or overflow were found.

This follow-up record changes documentation only. The production source above
remains the website rollout commit; a later evidence-only merge does not
require another deployment.

The disposable capture app is closed and its read-only DMG has been ejected.
The live dev site on port 4321 and built preview on port 4322 remain available.
