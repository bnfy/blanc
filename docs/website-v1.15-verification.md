# v1.15 website expansion — review handoff

Status: implementation and local verification complete; production rollout
awaits review and merge. No desktop behavior or app release was changed.

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

## Review and rollout still required

1. Review the local website at `http://127.0.0.1:4321/` and the website-only diff.
2. Commit the scoped website/tests/provenance/assets, excluding unrelated work;
   obtain review and merge through the repository workflow.
3. From the reviewed merged source, run `npm run site:deploy`.
4. Confirm Cloudflare lists that exact merged SHA as **Production** on branch
   **main**, not a preview or detached-HEAD deployment.
5. Spot-check the canonical homepage, five new guides, feature menu, Download,
   Press downloads, sitemap, and all five public social-card URLs. Record the
   merged SHA and deployment evidence here before marking rollout complete.

The disposable capture app is closed and its read-only DMG has been ejected.
The live dev site on port 4321 and built preview on port 4322 remain available.
