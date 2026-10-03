# Feedback validation and remaining work

Delivery units: `codex/reddit-feedback-site` for website/docs/intake and
`codex/reddit-feedback-onboarding` for the existing desktop tour. Pricing,
entitlements, resting Island, six-step flow, consent persistence and telemetry
schema stay unchanged. Website publication and Reddit posting require final
owner review. Desktop source remains a candidate until a normal release.

## Five newcomer sessions — owner arranged, pending

Recruit five people unfamiliar with Blanc. Use the approved website and the
onboarding candidate, recording their exact app/site revision and platform.
Start with a blank consent state; do not coach or pre-explain the dots/Patron.

Ask each participant to find the named “Blanc launch notes” tab in a prepared
ten-tab window, open the complete tab list and explain what is free and what
Patron adds. Observe the website download decision and Meet the island step.
Record the first action, hesitation, wrong turns, task outcome and their own
words. Obtain participant consent for notes; use anonymous participant IDs.

| Participant | Named tab found unaided | Full list opened unaided | Patron boundary understood unaided | Revision / platform / failures |
| --- | --- | --- | --- | --- |
| N1 | pending | pending | pending | owner-arranged session pending |
| N2 | pending | pending | pending | owner-arranged session pending |
| N3 | pending | pending | pending | owner-arranged session pending |
| N4 | pending | pending | pending | owner-arranged session pending |
| N5 | pending | pending | pending | owner-arranged session pending |

Acceptance: at least four of five complete **all three** tasks without moderator
coaching. Record failures, revise explanations and repeat validation before
closing feedback work. Automated checks are not a substitute for these sessions.

## Missed-ad reproduction protocol — cases pending

The Reddit report provides no page URL or reproducible placement. No confirmed
blocker defect or filter change is inferred. Keep the feedback open for details.

1. Record the installed public version, official artifact identity, OS and
   bundled filter snapshot hashes. Use a disposable profile with the reporter’s
   global/per-site settings, login/region/playback conditions where authorized.
2. Reproduce the placement on the exact URL and record expected/observed result,
   steps, shield state/count and sanitized screenshot/request evidence. Compare
   blocking on/off on the same page; do not publish account tokens or user data.
3. Classify **filter coverage** (engine runs but rule absent), **integration
   defect** (expected rule/session/request/cosmetic path fails), or **unsupported
   format** (document exactly what cannot be isolated/blocked). If intermittent
   or unreproduced, state conditions and keep investigation pending.
4. Land a confirmed fix in a separate desktop/filter PR with a failing-before,
   passing-after regression. Filter changes update pinned source hashes and
   generated outputs together and retain `adblock:check`, packaged-payload
   verification and normal platform/release gates.
5. Verify the original case in the released package, including relevant private
   session/exception behavior. Close only with reproduction and verification
   evidence, or a clearly documented limitation acknowledged in the report.

Case record fields: report link, public version/tag, OS, settings, URL and steps,
reproduction evidence, classification, candidate/fix PR, regression, released
verification and disposition. No case closed in this delivery.

## Verification record

Build/browser/desktop results will be appended after execution. Pending owner
review, production deployment, normal desktop release, real newcomer sessions
and supplied ad examples are distinct milestones, not passed checks.

### Completed local verification — October 2

Both branches started at freshly fetched main
`8e48359fae44865857a5bd3a8a955af96af71650`. The unrelated primary checkout was
preserved. Public capability baseline remains immutable v1.26.0 / `4624b229`.

- Brand/site build and SEO: passed, 28 pages / 26 sitemap URLs.
- Existing unit suite: 2,031/2,031 passed after preparing the hash-verified
  ignored blocker seed. Final claim/public-truth checks: 23/23, including the
  additional completed-record provenance check. Historical image manifests
  and v1.25.0 claim ledger remain unchanged.
- Chromium and WebKit: 9/9 each on final build, covering all stable chapters,
  preview → selection → full list, pause/replay, keyboard chapter activation,
  dialog focus/Escape/restoration, reduced motion and no-JavaScript fallback.
- Existing native website review: consent network states and withdrawal,
  eight routes at desktop/mobile and actual 200% zoom, wallpaper and keyboard
  behavior passed. Final larger verification-table text separately passed
  320/390px and actual 200% zoom with no horizontal overflow.
- Final desktop/mobile component captures loaded every requested local asset
  without HTTP error responses. Sunrise and the existing typefaces remain;
  demo figure captions now match the live Newsreader treatment. Demo titles/counts are explicitly samples.
- Desktop/Worker lint passed. Onboarding candidate: 27 focused unit checks,
  four existing acceptance scenarios / 21 steps, and Settings Help native
  smoke passed. Fresh setup and replay retain saved suggestions/usage choices;
  the unchanged six-step tour was checked. After owner feedback, the revised
  single-Island illustration passed native light/dark captures, 320/390px
  widths and actual 200% start-page zoom without horizontal overflow. The
  smoke targets the start-page WebContentsView, independently of window chrome.
  Lint, all 27 focused unit checks and the four acceptance scenarios passed again.

Initial failed checks were diagnosed: generated seed absent after dependency
installation with scripts disabled, two copy assertions requiring the prior
wording, and browser tests targeting a retired hero selector or hidden desktop
select control. Preparation/current-copy assertions and browser setup were
corrected; these failures are not relabelled as passes. Visual review also
aligned +N panel opening with the staged click.

Local logs and review images: `/private/tmp/blanc-reddit-*.log` and
`/private/tmp/blanc-reddit-review/`. The revised onboarding images are in
`/private/tmp/blanc-reddit-onboard-revised/`. These are local candidate evidence,
not an independent audit, released desktop package or production deployment.

Owner approval is pending for finished website copy/preview. No PR, merge,
production deployment, desktop release, audit commission or Reddit posting
has occurred in this implementation stage. Five newcomer sessions and
reproducible missed-ad cases remain pending as recorded above.

### Live styling alignment after owner review

The website candidate was advanced from `8e48359f` to current main
`d881ef778f4af29145ba24db7ee25c4480cfffbc` without changing the primary
checkout. This incorporates the published homepage/1Password refinement.
The feedback candidate keeps its shorter captions, active-tab grouping flow,
Sunrise Start Page illustration, 1Password guide/chapter and updated brand rules.
Removed the candidate Inter headline override; Replay now fits the compact
bar. New tab discovery uses the same short centered Newsreader treatment.
Earlier captures/build counts below are historical local checks; current
alignment validation is recorded separately after rerunning the relevant gates.

Owner correction: the standalone homepage explanation and its replacement
caption were both removed from ordinary browsing. The demo now shows the
three actions under short captions; the text fallback is JavaScript-disabled
only. The macOS 1Password setup qualification remains with its chapter.
The restored control bar matches the published 46px desktop height.

Final alignment checks: site/SEO build passed (29 pages, 27 sitemap URLs),
31 claim/navigation/style checks passed, and all nine browser checks passed
in both Chromium and WebKit. The responsive chapter check now guards the
Newsreader regular caption and exact 46px desktop bar height. Full playback,
the repaired sample-tab mapping, all eight chapters including 1Password,
replay/pause, keyboard, viewer Escape and JavaScript-disabled fallback passed.
The user’s existing preview tab was refreshed and observed playing the new
sequence, with no ordinary-page explanatory block. Updated local captures
loaded without asset error responses.

### Code review findings addressed — October 2

The onboarding copy now promises the visible icon/title preview only on hover
and explains Enter on a focused dot for keyboard selection. The matching Reddit
reply draft is corrected and remains unposted. Native title tooltips do not
appear merely on keyboard focus; the tab button's accessible name supplies its
title to assistive technology.

The website adds a visually hidden description outside the inert replica. Both
the demo section and enlarged dialog reference it with aria-describedby; it
moves with the frame into the dialog and back. The visible homepage copy and
styling stay unchanged, and the no-JavaScript explanation remains available.
The current release-bound claim ledger includes the accessible description.

- New accessibility regression failed against the previous built preview, then
  passed against the fixed build in Chromium and WebKit. It checks the exposed
  accessibility tree, visual clipping, mobile width, dialog move and restoration.
- All 10 demo/browser checks passed in each engine, including playback, keyboard
  navigation, reduced motion, dialog Escape and no-JavaScript fallback.
- Brand/site/SEO build passed: 29 pages, 27 sitemap URLs. All 31 focused
  claim/navigation/style checks passed, and git diff --check passed.
- Desktop lint and native Settings Help smoke passed with the corrected text,
  six steps, light/dark rendering, 320/390px widths, actual 200% zoom and
  fresh/replayed-tour consent persistence. Existing onboarding acceptance:
  four scenarios and 21 steps passed.
- Refreshed the user's existing localhost preview and confirmed that its
  accessibility tree includes the hidden description. No manual screen-reader
  speech session was performed.

Logs: /private/tmp/blanc-review-fixes-*.log. Native screenshots:
/private/tmp/blanc-review-fixes-onboard/. Publication/release and owner-arranged
newcomer sessions remain pending; these are local candidate checks.

### Owner correction: simplify Meet the island

Replaced the detailed tab-discovery tutorial with one introductory sentence, a
plain resting Island and one platform-specific shortcut. Removed the invented
Reading list sample title, expanded favicon, overflow count and annotation,
+N paragraph and separator. Detailed discovery remains in the website demo.
This deliberately supersedes the original plan's dense onboarding explanation.
The accessible caption describes the plain model; six-step sequencing and
consent behavior remain unchanged.

Latest candidate checks passed: lint, 15 focused unit checks, four onboarding
acceptance scenarios / 21 steps, and native Settings Help smoke with light/dark,
320/390px widths, actual 200% zoom and fresh/replayed-tour consent persistence.
Screenshots: /private/tmp/blanc-simple-onboard/. Logs:
/private/tmp/blanc-simple-onboard-*.log. This is local candidate evidence; no
desktop release or website deployment occurred.


### Owner correction: show the actual quiet Island

Replaced the simplified sketch with light/dark captures from the unmodified
chrome renderer. The complete ordinary HTTPS browsing state includes Back,
Forward, three tab dots, favicon/domain, New Tab, blocker shield, the real
separator, Reload, Favorite and Close. The image scales uniformly; it does not
compress individual gaps or omit ordinary controls. Conditional UI appears
only in its applicable states and is absent from this quiet fixture. Short
introductory copy and the platform shortcut remain the only visible explanation.

The desktop candidate includes a reproducible capture script and a manifest
binding source hashes, image hashes, controls and measured geometry. Captures
use local fixtures and a disposable profile. They are development-renderer
captures matching public v1.26.0 chrome sources, not installed-public-package
evidence. Native smoke guards image/source drift, theme selection and aspect
ratio, alongside the existing six-step and consent checks.

Passed: lint, 15 focused unit checks, four onboarding acceptance scenarios /
21 steps and native Settings Help smoke. Light/dark, 320/390px widths and actual
200% zoom were captured and reviewed without horizontal overflow. Screenshots:
/private/tmp/blanc-real-island-onboard/. Logs:
/private/tmp/blanc-real-island-*.log. Website source was unchanged in this
correction; no production deployment or desktop release occurred.


### Owner correction: download-section spacing

The Named Workspaces link now uses the existing site text-link treatment, with
its normal spacing and mobile tap height. The Patron paragraphs have an 18px
separation. Release notes again follow the platform download cards; their
spacing uses normal flow instead of a negative margin that crowded the new fit
section's bottom divider. Product and pricing copy are unchanged.

Passed: site/SEO build (29 pages, 27 sitemap URLs), 31 claim/navigation/style
checks, all 10 existing Chromium demo/browser checks, and git diff --check.
The first browser invocation could not launch Chromium inside the filesystem
sandbox; the authorized outside-sandbox run passed. The rebuilt download page
was reviewed at 1440px and 390px, with no horizontal overflow or console errors.
The user's preview was refreshed and its temporary viewport override reset.
Screenshots: /private/tmp/blanc-download-spacing-desktop.png and
/private/tmp/blanc-download-spacing-mobile.png. Logs:
/private/tmp/blanc-download-spacing-*.log. No deployment occurred.


### Owner correction: missed-ad section spacing

The report section had no space above it after the truth-note card, while its
bottom padding stacked with the memory chart's top padding. A scoped report
modifier now supplies 104px above the report on desktop and 72px on mobile;
the chart retains its own 88px/56px following gap. The report paragraphs have
18px separation. Other added About, FAQ, workspace and security sections were
checked in source for this same missing-gap pattern; they already have section
padding or margins. No product copy changed.

Passed: site/SEO build (29 pages, 27 sitemap URLs), all 31 existing
claim/navigation/style checks and git diff --check. The rebuilt page was
visually checked at 1440px and 390px; measured gaps match the values above,
with no horizontal overflow or console errors. The local preview was refreshed
and its temporary viewport override reset. Screenshots:
/private/tmp/blanc-blocking-spacing-desktop.png and
/private/tmp/blanc-blocking-spacing-mobile.png. Logs:
/private/tmp/blanc-blocking-spacing-*.log. No deployment occurred.


### Commit/push authorization — October 2

After the visual corrections, the owner requested “commit push.” Both isolated
branches were fast-forwarded to freshly fetched `origin/main` at `ca935fbb`.
The website base advanced only through unrelated ping Worker changes; the
desktop base also incorporates the already published homepage refinement.
Neither advance changes the reviewed website candidate UI or the onboarding
renderer/capture inputs. Delivery remains split into website and desktop PRs.
Prior validation entries are historical; production deployment, desktop release,
newcomer sessions, audit commissioning and Reddit posting are not marked complete.
