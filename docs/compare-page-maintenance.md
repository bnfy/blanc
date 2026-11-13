# Keeping /compare current

`/compare` (`site/src/pages/compare.astro`, data in `site/src/data/compare.json`,
evidence in `docs/website-compare-claims-<release>.json`) compares Blanc with
Crest, Arc, Helium and Brave. Every answer is a dated claim, so it goes stale
on two clocks: Blanc's releases and the other browsers' releases. This is the
schedule for both, and the procedure each re-check follows.

## When to re-check

| Trigger | What to re-check | What enforces it |
|---|---|---|
| **Each Blanc feature release** (X.Y.0), in the post-release follow-up | Blanc's eleven cells against the new tag, then every competitor cell | `test/unit/site-compare-data.test.js` fails once `releases.json` has a newer minor version than `checkedAgainst`. Bug-fix releases don't trigger it. |
| **Monthly**, on the first working day of the month | Every competitor cell, against the same first-party pages | The page's visible "Checked …" date. Nothing fails automatically: a test with a maximum age would break unrelated pull requests. |
| **December 22, 2026** (Arc's end date) | Deploy the site so the Arc column drops, then review the chart without it, and reword (with the owner's approval) every line that still names Arc: the page `title` and `description`, the hero line "Blanc next to Crest, Arc, Helium and Brave…", the table caption, and the `/arc-alternative` link "See Blanc next to Crest, Arc, Helium and Brave" | The data's `endsOn`; a build after that date omits the column and prints `endedNote`. The live page changes only when the site is deployed, and the copy above does not change by itself. |
| **A competitor's major release, or a reader's correction** (Reddit, email, GitHub) | The cells that release or correction touches | Owner judgment. A correction backed by a first-party page is fixed promptly. |

Crest ships several builds a day and Helium is in beta, so their cells move the
fastest. Check them first in each re-check.

## How to re-check

1. **Read the sources again.** Open every URL in `compare.json` → `sources`
   for each browser, in a real browser (`resources.arc.net` and
   `support.brave.app` refuse automated fetches). Use only first-party pages, as
   `docs/marketing-claims.md` → *External comparisons* requires. A new
   first-party page may replace or join an old one.
2. **Compare each cell with what the pages say now.** Narrow a cell when a page
   supports only part of it. A cell whose pages are silent reads `Not stated.`;
   never infer from silence. If a page now answers a `Not stated.` cell, write
   the sourced answer.
3. **Re-check Blanc's cells against the current public tag** (`git show
   vX.Y.Z:<path>`), never `main`. Blanc features that are merged but
   unreleased stay off the page.
4. **Get the owner's approval for changed wording.** Any change to a cell's
   text is public comparison copy and needs the owner's explicit approval
   before it ships, as the original chart did.
5. **Update the record together:**
   - `compare.json`: cell text and sources; `checked` (today);
     `checkedAgainst` (the current public tag); every source's `accessedAt`.
   - The page's "Checked … against Blanc vX.Y.Z" line in `compare.astro`.
   - A new ledger, `docs/website-compare-claims-vX.Y.Z.json`, with
     `publicRelease`, `sourceSha`, `releaseEvidence`, a `supports` line for
     every source and an entry for every cell, pointed to by
     `test/unit/website-feature-evidence.test.js`. Keep the old ledger as the
     record of the earlier check.
6. **Verify and ship:** `node --test test/unit/site-compare-data.test.js
   test/unit/website-feature-evidence.test.js`, `npm run site:build`, a look at
   the page at desktop and phone widths, then a website-only pull request and
   `npm run site:deploy`.

A monthly re-check that finds nothing changed still moves `checked` and every
`accessedAt` to that day, so the date on the page stays true.

## When a column should go

A browser that ends (like Arc on December 22, 2026) or stops being a real
alternative leaves the chart. Arc already has `endsOn`. Any other removal, or
adding a browser such as Dia, is an owner decision, followed by a full
re-check.
