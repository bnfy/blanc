# Marketing Site Release 2 — Competitive Research + Prioritized Buildout

Follows `docs/superpowers/plans/2026-07-10-marketing-site-release-1-brief.md`,
which shipped the current site (home, features + 5 feature pages, download,
privacy, terms) and deliberately deferred comparison pages, a blog, and a
changelog. This document is the research-backed prioritization for what comes
next, aimed at one goal: make Blanc read as a real, durable player in the
browser space to the three audiences that decide that — switchers searching
for an alternative, skeptics evaluating trust, and the press/community
channels that amplify indie browsers.

## Research base

Twelve competitor sites audited in depth (2026-07-11): Zen, Arc/The Browser
Company, Horse, SigmaOS, Vivaldi, Brave, Orion (Kagi), Ladybird, Min, Floorp,
Waterfox, Polypane — plus live SERP research on switcher queries, directory
mechanics (AlternativeTo, Product Hunt), and launch post-mortems (Zen's
828-point HN launch thread).

### What every credible browser site has (and Blanc lacks)

| Page type | Prevalence across the 12 | Blanc today |
| --- | --- | --- |
| Changelog / release notes | Universal — the single most consistent page, usually top-nav | ✗ |
| Independence / funding statement | Universal among indies, always near the hero | ✗ |
| About / story / named human | Near-universal (10/12) | ✗ |
| Comparison ("vs") pages | The two biggest players only (Brave, Vivaldi) — but proven SEO | ✗ |
| Docs / help center | Near-universal, but serves retention not acquisition | ✗ (deferred) |
| Blog | Common (8/12), and the worst thing to neglect — SigmaOS's stale blog actively signals abandonment | ✗ (deferred) |
| Press kit | Rare (Brave, Orion only) — optional but cheap | ✗ |

### The seven findings that drive this plan

1. **A changelog is the cheapest proof of momentum.** Every site surfaces one.
   "Is it actively developed?" was the top question in Arc-refugee threads —
   Arc lost momentum when feature development stopped. Zen and Kagi's
   per-release pages (with RSS) are recurring HN/Reddit ammunition. Blanc
   ships constantly and shows none of it.
2. **Switcher search demand is live and winnable.** Arc froze feature work in
   May 2025; "arc browser alternative" is an ongoing migration event, and
   *indie apps' own listicles and comparison pages rank #1* for these queries
   today (sigmabrowser, supasidebar, efficient.app). Brave's first-party
   `/compare/chrome-vs-brave/` ranks #1–3 for its query. "Minimal browser"
   and "browser with built-in ad blocker" queries have weak competition and
   map 1:1 onto Blanc's positioning.
3. **Trust is Blanc's most under-claimed asset.** The #1 adoption blocker in
   Zen's HN launch was the unsigned macOS build. Blanc is signed + notarized
   with auto-update and a minimal launch ping that users can turn off — and
   the site says almost none of it. The expensive work is done; only the
   copy is missing.
4. **"One person made this" converts when framed right.** Polypane ("founder,
   developer, designer and support team", "100% bootstrapped, no investors"),
   Horse (founder faces + public roadmap + open metrics), Orion (origin
   timeline, named team) all weaponize smallness as durability. Arc's sunset
   banner is the live market anxiety to address: Blanc is founder-controlled,
   with no investors setting its product agenda or exit timetable. Do not turn
   that into a promise that a solo-maintained product can never be discontinued.
5. **Orion validates the Supporter model almost exactly.** Orion+ is $5/mo /
   $50/yr / $150 lifetime for cosmetic/insider perks — including custom app
   icons — framed as patronage ("most users will never need Orion+"). Blanc's
   $19-once sits in unoccupied, favorable territory on the observed spectrum
   (donations → $70/yr → $20–30/mo) and should be presented with the same
   honest patronage framing.
6. **Technical depth is the HN entry fee.** The #2 criticism in Zen's launch
   was undocumented differentiation; vague claims got publicly dismantled by
   a Mozilla engineer. A substantive "how Blanc works" page (network-level
   blocking vs. Manifest V3 limits, the Island model) is the prerequisite for
   any Show HN, and no small browser has a good one.
7. **Anti-patterns to avoid:** a blog you can't sustain (SigmaOS), vanity
   metrics before they're respectable (no indie shows counts they can't win
   on — Blanc's 1 GitHub star and teens-per-release downloads stay off the
   site for now), JS-rendered pages (Floorp's SPA is invisible to crawlers —
   Blanc's static site is already ahead; keep it that way).

## Approaches considered

- **A. Trust-first, then search (recommended).** Ship the momentum/trust
  foundation (changelog, about/independence, download trust copy) before the
  SEO surface. Rationale: comparison pages convert switchers into evaluators
  — and evaluators immediately look for "is it alive, who made it, is it
  safe." Landing that traffic on a site without those answers wastes it. The
  foundation is also the cheapest tier (days, not weeks).
- **B. Search-first.** Build the comparison/alternative pages immediately to
  start SEO aging sooner. Real benefit (rankings compound with age), but the
  pages would cite trust properties the site doesn't yet document, and the
  foundation tier is fast enough that sequencing costs only ~a week.
- **C. Launch-first.** Aim everything at a Show HN (technical page + press
  kit, launch now). Highest single-day spike, but Zen's thread shows exactly
  how it fails without the foundation: signing questions, "what's actually
  different" questions, and "will this exist next year" questions all get
  answered in the comments instead of on the site. Launch should be the last
  milestone, not the first.

Chosen: **A**, with B's pages as the immediate second milestone and C's
launch prep as the third.

## Release 2 roadmap

### M1 — Momentum & trust foundation (all static, all cheap)

1. **`/changelog`** — per-release notes on-site, newest first, with an RSS
   feed. Mechanism stays no-build-step: a small generator script (invoked
   manually or from `release.sh`, same pattern as the existing JSON-LD sed)
   renders committed static HTML from the GitHub release notes; the runbook
   in `site/CLAUDE.md` gains one step. Nav gets the `changelog` link Release
   1's shell already reserved for it; download page links "what's new"
   adjacent to the install buttons.
2. **`/about`** — the independence page. Solo, bootstrapped, Bananify
   (Rochester, NY, est. 2024, ex-AJLMEDIA lineage back to 2006); how Blanc is
   funded ("supporters, not ads — founder-controlled, with no investors
   setting the product agenda"); the Supporter purchase presented
   Orion-style (one-time $19, cosmetic, "the browser is complete without
   it"); support is a human. Footer provenance line sitewide ("built in
   Rochester, NY · no investors").
3. **Download-page trust block** — say what's already true: macOS builds
   signed and notarized (Gatekeeper-clean), installed builds auto-update,
   telemetry is one launch ping with an off switch: random install/session
   IDs plus version, platform, and architecture, with no browsing data.
   **Verified 2026-07-11:** the shipped v0.15.5 Windows installer
   is unsigned; Actions run `29140212365` took the explicit unsigned fallback
   because neither an Azure certificate profile nor `CSC_LINK` was configured.
   Do not make a Windows signing claim. Ship an honest "why does Windows
   warn?" FAQ entry that identifies the SmartScreen `unknown publisher`
   warning and links to the public GitHub release while signing is unfinished.
4. **FAQ upgrades** — add "Who makes Blanc?", "Is Blanc actively developed?"
   (→ changelog), and the Windows-warning answer; keep answers
   visible/crawlable per the R1 pattern.

### M2 — Search expansion (the SEO surface)

5. **`/compare/` hub + three comparison pages:** *Blanc vs Arc* (largest live
   migration demand), *Blanc vs Brave* (explicit priority — the built-in
   ad-blocking overlap is Blanc's headline feature, and Brave is the browser
   those searchers already know; differentiation: minimal Island UI, no
   crypto/rewards/BAT, no AI bundling, no business/ads ecosystem), *Blanc vs
   Zen* (the adjacent indie comparison shoppers actually search). Format is
   Brave's, not a bare table: prose sections + honest feature table + FAQ +
   the live-CSS island figures (per the `blanc-site-island-figures` pattern)
   as visual proof no competitor page has. Every row obeys the R1 product-
   truth guardrails — an honest "where X is the better choice" section is
   what makes these credible and linkable.
6. **`/arc-alternative`** — one evergreen switcher landing page written as an
   honest guide (what Arc refugees miss, which alternatives fit which needs,
   where Blanc fits), since indie listicles demonstrably own this SERP.
7. **`/how-it-works`** — the technical-depth page: network-level blocking vs.
   Manifest V3's declarativeNetRequest caps, the one-window/Island
   architecture, what's Chromium/Electron and what isn't, the permission
   policy, what the launch ping contains. Written to survive an HN comment
   section; doubles as the substance behind every marketing claim.

### M3 — Channels & launch prep (mostly off-site, gated on M1+M2)

8. **`/press`** — press kit: logo/mark files, icon colorways, canonical
   screenshot set, one-paragraph boilerplate, founder photo + bio, free-use
   terms, press contact. (Only Brave and Orion have one; it's cheap and it's
   what reviewers actually ask for.)
9. **Canonical screenshot set** — the R1 capture list, finished and exported
   at directory-friendly sizes; feeds the press kit, AlternativeTo, and
   Product Hunt simultaneously.
10. **Directory presence** — claim/create the AlternativeTo listing (domain-
    verified) and get Blanc listed as an alternative on the Arc, Zen, Min,
    and Brave pages; Product Hunt listing (its auto-generated "alternatives"
    pages rank indefinitely); fix the empty GitHub repo description/topics.
11. **Show HN prep checklist** — title framing, first-comment draft linking
    `/how-it-works`, monitoring plan. The launch itself is a user decision,
    not a site artifact.

### Explicitly deferred (with triggers to revisit)

- **Blog / monthly digest** — only once there's a sustainable cadence;
  Ladybird's "This Month in X" monthly format is the right model for a solo
  dev if/when started. A Waterfox-style commentary post (Manifest V3,
  AI-in-browsers backlash) is a good first post *when a news cycle offers a
  peg*, not on a schedule.
- **Docs site** — serves retained users, not acquisition; revisit when
  support email shows repeated questions.
- **Traction counters** (downloads, ads-blocked-to-date via the ping worker)
  — revisit when the numbers clear the "a small number is worse than none"
  bar.
- **Testimonials** — only real ones, when they exist.
- **More comparisons** (vs Safari/Chrome/Vivaldi) — after the first three
  prove the format in Search Console.

## Guardrails (carried from Release 1, plus new ones)

- Every claim anchors to product truth; comparison-table rows cite shipped
  behavior only, and competitor rows must be verifiable and current.
- No invented ratings, testimonials, or counts; no vanity metrics below the
  credibility threshold.
- Static HTML, no build step, extensionless routes, per-page canonical/OG,
  sitemap discipline, consent-gated analytics events (new pages emit the
  existing `feature_cta_click`/`download_click` taxonomy with their own
  `source_page`).
- Comparison pages name competitors respectfully and concede their strengths
  — the honesty is the moat for an unknown brand.

## Definition of done (Release 2)

- Changelog, about, compare hub + 3 comparisons, arc-alternative,
  how-it-works, and press pages live, cross-linked, canonicalized, and in
  the sitemap; download page carries the verified trust block.
- Release runbook updated: `release.sh` site-sync step now also regenerates
  the changelog page.
- AlternativeTo and Product Hunt listings live with the canonical screenshot
  set; GitHub repo description set.
- Search Console shows the new URLs indexed; first month of query data
  reviewed to pick the next comparison targets.
