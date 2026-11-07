# Billboard history seeding

## seedBillboardHistory: built

Implemented directly (not by Codex) in `Handler::HandleTest` /
`blanc_prototype_ui.cc`, after Codex's own attempt stopped short at research
and flagged two correct but incomplete findings (see "Credit" below). Two
additional, non-obvious correctness issues surfaced while implementing it,
neither caught by the original brief:

1. **Transition type.** `HistoryBackend::CalculateSegmentID`
   (`history_backend.cc`) only credits a visit toward a "most visited"
   segment when its transition is `PAGE_TRANSITION_TYPED` or
   `PAGE_TRANSITION_AUTO_BOOKMARK`. The brief's suggested call —
   `HistoryService::AddPage(url, time, VisitSource)`, the plain 3-arg
   overload used by `chrome.history.addUrl()` — hardcodes
   `PAGE_TRANSITION_LINK` internally (`history_service.cc:629-648`), which is
   never scored into a segment. Seeding with that overload would have left
   `TopSites::GetMostVisitedURLs` returning nothing at all, regardless of
   visit count. The op instead uses the 10-arg
   `AddPage(url, time, context_id, nav_entry_id, referrer, redirects,
   transition, visit_source, response_code_category, did_replace_entry)`
   overload with an explicit `ui::PAGE_TRANSITION_TYPED`.
2. **Chrome Web Store filler.** `TopSitesImpl::SetTopSites` always calls
   `AddPrepopulatedPages`, which pads a real-history list shorter than
   `kTopSitesNumber` (10) with Chromium's built-in prepopulated pages —
   on desktop, the Chrome Web Store (`top_sites_factory.cc`,
   `kRawPrepopulatedPages`). Seeding exactly 6 real sites would have left a
   7th, unwanted Chrome Web Store tile in the real `GetMostVisitedURLs`
   result, breaking the scenario's "exactly 6" assertion. This is also a
   real, independent **production bug**: Blanc's native Billboard
   (`NewTabHandler::TopSitesReady`) had no filter for this, so any real user
   with fewer than 10 browsed sites would see a Chrome Web Store tile on
   their Billboard — on a browser that explicitly ships no extension store.
   Fixed in `TopSitesReady` by excluding every URL in
   `top_sites_->GetPrepopulatedPages()` from the reply, and the new test op
   applies the same filter to its own read-back.

The op seeds 6 hosts (youtube.com, cnet.com, wikipedia.org, github.com,
nytimes.com, weather.com) with decreasing real `AddPage` visit counts
(12/9/7/5/3/1), each a distinct `base::Time` a few minutes apart, then
`HistoryService::FlushForTest` to guarantee the writes land before
`TopSites::SyncWithHistory()` runs. Because `SyncWithHistory()` is
fire-and-forget and `GetMostVisitedURLs()` can still answer from the
pre-seed cache on an early call, the op polls (bounded: 40 attempts, 100 ms
apart, ~4 s ceiling) until the ranked read-back's host set exactly matches
the 6 seeded hosts, then replies with the same `{url, key, title}` shape
`TopSitesReady` already produces.

`chromium/tests/adapters/pages.mjs`'s `seedBillboardHistory` now calls
`w.native('seedBillboardHistory', [])` instead of throwing.

Verified: unit tests (`node --test chromium/tools/*.test.mjs
chromium/tests/*.test.mjs chromium/tests/**/*.test.mjs`) 257/258 pass — the
one failure (`ui-language.test.mjs`, `stripTypeScriptTypes is not a
function`) is a pre-existing Node-version environment issue, not caused by
this change. `python3 chromium/tools/check-patches.py` passes after
`refresh-source-map.py`. Native build and the acceptance scenario itself
are Claude's to run next; not yet verified against a real browser at the
time this note was written.

## seedBillboardOverflowHistory: still blocked, needs an owner decision

Codex's research here was correct and is kept:

- `top_sites_constants.h:12`: `kTopSitesNumber = 10`.
- `top_sites_impl.cc:560-561`: `GetMostVisitedURLs`'s result is
  unconditionally truncated to `kTopSitesNumber`, regardless of how much
  real history exists or how many results were requested upstream of that
  truncation (`top_sites_impl.cc:438-441`, `372-382`).

Real `history::TopSites` cannot be made to return 60 ranked sites by seeding
alone; the cap is structural. The native fork's own `topSites` WebUI
message additionally takes no arguments at all
(`method == "topSites" && args.empty()"`, `blanc_prototype_ui.cc`), while
the already-ported front-end (`chromium/blanc/island/pages/newtab.js`,
`fillBillboardSites`) calls `window.bowserPages.start.topSites({offset,
limit})` expecting page-2+ support that the native handler has never
implemented. Shipping Electron's Billboard has its own JS-backed history
store with no such cap; the native port inherited the call shape without
the capability.

Unlike `seedBillboardHistory` (6 sites, within the real 10-site cap), this
scenario cannot be unblocked by writing a test-only op: it needs a real
product/architecture decision — whether to patch `kTopSitesNumber`, add a
parallel non-`TopSites` query path for "overflow" ranks beyond 10, or scope
the one dependent scenario ("Billboard continues past its initial candidate
page") out for now. Flagged to the owner rather than decided unilaterally,
per this fork's standing rule to raise native Chromium option changes
before building them.

`seedBillboardOverflowHistory` in `pages.mjs` still throws
`UndefinedNativeAdapterError`, with its message updated to cite the real
blocker instead of describing it as a missing test op.

## Credit

Codex (`chromium/f35-billboard-history-codex` branch, prior to this note's
rewrite) independently found the `kTopSitesNumber` cap and the
`topSites`/`newtab.js` pagination mismatch, and correctly stopped rather
than faking a seam or guessing at visit counts. It did not attempt
`seedBillboardHistory`, so it did not encounter the transition-type or
Chrome Web Store issues above.
