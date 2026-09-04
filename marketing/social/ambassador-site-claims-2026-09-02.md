# Ambassador pilot page claim audit — September 2, 2026

Destination: `/ambassadors`

This audit covers the local page before publication. Product evidence is pinned
to the current public release tag, `v1.12.0`. Program terms describe the pilot
Blanc is offering through the page; they are not product capabilities.

| Page wording | Type | Evidence | Qualification | Verdict |
| --- | --- | --- | --- | --- |
| “Blanc is an independent … desktop browser” | Blanc product/company | `v1.12.0:site/src/pages/about.astro` identifies Bananify as an independent studio with no venture funding or investors; `v1.12.0:site/src/pages/download.astro` describes the shipped desktop browser | “Independent” describes ownership and funding, not a guarantee of neutrality | Verified |
| “open-source” | Blanc licensing | `v1.12.0:LICENSE` grants the MIT license for Bananify-owned software; `v1.12.0:ASSET-LICENSE.md` preserves the trademark and third-party carve-outs | The page does not say the entire repository is blanket MIT or grant trademark rights | Verified |
| “replaces the permanent tab strip and toolbar with one floating Island” | Blanc product | `v1.12.0:site/src/pages/features/island.astro` says Blanc replaces a traditional tab strip and toolbar with one floating island; `v1.12.0:src/renderer/index.html` contains the Island pill and `v1.12.0:src/main/main.js` owns its overlay modes | Does not imply AI organization, task understanding, or automatic grouping | Verified |
| “current public build” | Blanc distribution | `v1.12.0:package.json` identifies Blanc 1.12.0; the matching dated release record is `docs/release-incidents/2026-09-01-v1.12.0.md` | The invitation must always resolve to the then-current public download rather than a working-tree build | Verified |
| “No scripted praise. No posting obligation during the trial.” | Pilot term | Declared operating rule in `marketing/social/follower-growth-operating-plan-2026-09-02.md` and the public page | Applies to the initial trial; any later deliverable needs separate written terms | Verified as program policy |
| “If we agree on a paid pilot…” | Future pilot possibility | The page conditions payment on a later mutual written agreement; current outreach offers no payment | Does not promise selection, payment, or a continuing relationship | Qualified future policy |
| “Audience size is not the first filter” | Selection philosophy | Program policy, not a measurable product or market claim | The page still states that relevance, curiosity, and audience trust are evaluated | Verified as program policy |

## Rejected additions

- No promise of free Patron access, early unreleased builds, affiliate
  commission, exclusivity, guaranteed payment, or guaranteed selection.
- No claim that an ambassador relationship itself improves follower counts or
  downloads.
- No claim that Blanc is private, faster, calmer, or better for productivity
  without a specific release-backed mechanism and qualification.

## Publication gate

Build and SEO verification must pass. Deployment remains separately approved.
Every creator invitation and any later compensation, benefit, deliverable,
reuse permission, disclosure plan, or public ambassador label remains
action-time approval-gated.
