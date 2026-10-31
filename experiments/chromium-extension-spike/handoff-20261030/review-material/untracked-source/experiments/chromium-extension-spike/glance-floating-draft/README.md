# Floating Glance foundation

The product reference is the published Blanc v1.45.1 source
`85883b1afa11375e1300130914d6f40c5388af21`. The exact released
`glance-card.js` is saved as `shipping-glance-card.js`. Shipping leaves the
main page full size and places a separately controlled Glance page and card
chrome over it. The current prototype's temporary side-by-side split is not
that behavior.

`glance_geometry.cc` stages the released default frame, clamping, fractional
restore, move, edge resize and card/page/chrome geometry as native arithmetic.
`geometry-oracle-result.json` compares 4,200 finite cases against the exact
released JavaScript with no mismatches. The source also passes the current
SDK 27.2 syntax-only command. These checks do not execute a browser or render
a card. Native callers must validate finite, bounded dimensions before
converting the double-valued results to Chromium integer rectangles; the
tests do not establish JavaScript equivalence for NaN, infinities or
overflow-scale input.

`glance_frame_controller.cc` stages a window-owned geometry controller with
250 ms coalescing, monotonic open generations, stale-action rejection, move,
resize, reset and flush. It retains an unsaved frame on callback failure and
refuses close until a later successful flush; this is a deliberate difference
from the released controller, which clears its pending state before calling
its writer and ignores the return value. The timer does not yet surface its
failure to a UI. Invalid or unbounded native areas are rejected and malformed
stored fractions fall back to defaults. The exact released controller is
saved as `shipping-glance-card-controller.js`.

A standalone test linked to the frozen Chromium base task runtime exercises
coalescing, manual flush/failure/retry, stale generations, delayed timers,
reset failure, bounded-area refusal, and owner destruction from relayout.
This uses synthetic callbacks, not a browser window, real preferences, UI or
platform lifecycle. The owner must wire a failure-visible persistence callback,
proper close semantics, native lifetime and generation authority before use.

`card-surface/` stages shipping v1.45.1 card markup, CSS and drag helper with a capability-gated adapter. Without a bridge the card stays hidden; the mocked bridge fixture checks current-generation actions, stale state and close rejection, keyboard movement and header compaction at 600 and 360 pixels. The v1 screenshot exposed a hidden title that its DOM-only check missed; v2 ports shipping header fitting and verifies visibility. See `evidence/glance-card-surface-20261030/result-v2.json` and the two v2 screenshots under the durable preview root. A failed first attempt to copy supporting assets used an incorrect relative path; the subsequent copy succeeded. The headless fixture uses a synthetic bridge and a closed disposable profile, not a native window or WebContents. It does not establish native ownership, trusted sender validation, private authority, persistence, physical input, accessibility or visual parity. No bridge is integrated or enabled.

A further staged correction renders the shipping host label with the page title as tooltip, handles `view-source:` and internal/new-tab identities, applies the shipping private classes, and refits after fonts load. `evidence/glance-card-surface-20261030/result-v3.json` tests these with a mocked native state source. Private theme in shipping follows the active tab, which this draft does not yet receive or apply; the private classes alone do not prove correct private colors. The image adapter currently accepts only bounded PNG data URLs, so shipping favicon coverage is also incomplete.

`glance_overlay_view.{h,cc}` stages a Views hierarchy that accepts a configured chrome WebView and page ContentsContainerView, positions the card chrome and page, rejects missing or identical WebContents and invalid bounds, and hides itself on rejection. The owner must first guarantee exclusive attachment, actual tab lifetime and correct contexts; this view does not create that authority. A syntax-only check passed, but native-view stacking, hit testing, rounded clipping, focus, modal surfaces, and actual lifecycle are untested on every platform. No BrowserView hookup is present.

`glance_tab_attachment.{h,cc}` is a staged attachment coordinator. It rejects foreground/split/wrong-window/wrong-profile targets and contents already in the browser's two main containers, subscribes to tab detach/discard, and exposes a pre-active-tab-change detach hook. Its caller must install that hook before BrowserView attaches an activated reference and must also handle split transitions, lifetime, asynchronous wake and other hosts. The source only passed syntax checking: callback ordering, ownership, contexts and actual browser behavior are not proven. It must not be enabled on that evidence.

Attachment v3 tracks both Views through hierarchy deletion, rechecks the target and browser after `SetWebContents`, and adds a `BeforeSplitView` detach entry point. Neither entry point is hooked to BrowserView; the ViewTracker and split behavior are syntax-checked only, not exercised in a real window. ViewTracker does not by itself prove safe owner/callback destruction or exclusivity.

Overlay v3 uses Chromium `ContentsContainerView` and `ContentsWebView` for the page and exposes an identity-checked `ContainerFor` for future dialog/blocked-state routing. `BrowserView::GetWebContentsModalDialogHostFor` currently only searches its two main containers and falls back to the active page, so no routing is implemented yet. Moreover `TabModalDialogHost` places normal dialog Y at the toolbar rather than the floating card; replacing the container alone does not fix positioning. Anchoring, clipping, dimming and focus require a real design and browser test. SDK27.2 syntax only passes; no modal or UI runtime check.

Overlay v4 owns a staged `GlanceModalDialogHost`, derived from Chromium's tab modal host, which computes a card-relative position bounded by the browser content area and exposes it by attached WebContents identity. BrowserView has not been changed to return it. The candidate was syntax-checked only; widget-coordinate compatibility, native prompt placement, dialog size/clipping, focus, input blocking, owner destruction and shipping behavior remain untested.

The modal host now calls a bounded integer placement helper. Its standalone test covers a centered card, lower/right edges, oversize dialogs, negative widget coordinates and invalid/extreme inputs (`evidence/glance-modal-position-20261030/result-v1.json`). These are arithmetic checks only: the inherited maximum-size policy can still allow a dialog larger than the floating page, and no native widget, security prompt or shipping comparison has been exercised.

`card-surface/card-bridge.js` stages a `chrome.send` transport with bounded requests, action shapes, generation, reply IDs, timeout and page teardown. Isolated headless v4 exercises it against a mocked native receiver (`evidence/glance-card-surface-20261030/result-v4.json`); it does not authenticate anything. Native code must verify exact card document, window, profile, generation and allowed action on each request and reply. The real native receiver and owner are absent; keep these assets unpromoted.

`glance_card_handler.{h,cc}` and `glance_card_request.cc` stage a receiver for the planned `chrome://blanc-prototype/glance/card.html` document. The receiver requires the primary live committed frame and delegates real window/profile/generation authorization to an owner callback, rechecking before a reply. A standalone Chromium-base parser test covers accepted actions and malformed IDs, extra tab IDs, generations, edges and deltas (`evidence/glance-card-request-20261030/result-v3.json`). The owner callback, asset registration, actual actions and real WebUI tests do not exist yet, so this cannot establish a security boundary or be enabled. The first test fixture failed to compile due to an incorrect append chain; the second aborted because Chromium's Value rejects infinity at construction. Both failures are retained.

Card v5 replaces HTML string insertion for navigation glyphs with explicit SVG DOM construction. An isolated Chromium fixture enforces `require-trusted-types-for 'script'` and the prototype's allowed policy names: the earlier card fails to initialize under that policy, while v5 passes card and mocked-transport checks, verifies enforcement with a blocked HTML assignment, and observes no page errors (`evidence/glance-card-surface-20261030/result-v5.json`). The failed negative fixture and profile remain preserved. The test is HTTP plus a mocked receiver, not real WebUI or proof that its full production CSP/resource setup works.

`glance_card_authority.{h,cc}` stages an owner-bound authorization callback: it verifies the live browser and Views, sender/card and reference/page identities, both tabs in the same active window and profile, current generation and non-split state. Its callback returns false after authority destruction. The authority is not yet instantiated or bound to the receiver, and has only been syntax-checked. Exact-profile restriction fails closed but does not establish parity for shipping mixed-private tabs. Real teardown, reentrancy, navigation and other-host tests remain essential.

`glance_card_actions.{h,cc}` stages a receiver dispatch that rechecks the card authority, sends back/reload/stop to the reference WebContents, delegates move/resize/reset to the frame controller, and requires a separate window-owned callback for change/open-as-tab/keep-split/close. No real owner supplies those callbacks or binds the dispatch, and none of these operations has run in a browser. The first syntax check failed on an invalid chained DictValue Set; the corrected version passes and the failed source/log are preserved.

`glance_card_binding.{h,cc}` joins the staged authority and actions to a revocable native capability on the exact card WebContents. The handler refuses an absent capability and holds a weak lease across authorization, dispatch and reply, preventing a revoked/replaced capability from receiving a late reply. The real BrowserView owner does not create or revoke the binding yet, and actual authorization, navigation, teardown, mixed-private behavior and WebUI delivery have only syntax coverage. This is not a verified security boundary.

`glance_window_session.{h,cc}` stages composition of frame, attachment and capability. It revokes/hides/detaches on tab change, split or reference detach/discard; it reports frame flush failure to the owner and guards reentrant save. Explicit close refuses an unsuccessful write. No BrowserView creates it or invokes its handoff hooks, and destruction can still lose pending frame data unless the real owner retains it or vetoes shutdown after failed persistence. It has syntax coverage only; no real callback, lifetime, persistence or window tests.

`glance_card_state.{h,cc}` stages a native state publisher, revalidating the card authority and exact live primary WebUI document before queueing title, URL, private flag, navigation and card geometry. Binding and session expose it. A successful result means only that a WebUI call was queued; actual loading, paint acknowledgement, favicon and active-main private theme are not implemented or tested. The publisher and its callers pass syntax checks only.

The session now derives card/chrome/page rectangles from FrameController and applies bounds before queueing matching WebUI state. The overlay stays hidden until a future owner implements draw readiness; a valid layout alone no longer reveals it. A focused standalone native controller test covers normal and small areas and invalid dimensions (`evidence/glance-controller-20261030/layout-result-v1.json`). No actual Views layout, animation, card/page draw, coordinate-space integration or browser behavior was exercised. Shipping waits for two animation frames after load, with a 300ms fallback; that readiness/fallback is not implemented yet.

The staged session now begins reveal only after the exact primary card document reports load complete and its layout/state is queued. The card reports its current generation after two animation frames; a 300ms native timer is the shipping fallback. Both paths revalidate authorization and document identity before reveal, and handoff/close cancels the timer. A headless card test verifies generation replacement under Trusted Types and the native parser accepts the ready message; the actual native timer, WebUI, hidden-view paint and reveal have not run in a real window. The real owner must still call BeginReveal after document load.

`integration-registration-v1/` holds a hash-manifested copy of 11 card assets, all staged native source/header files, and a patch against the current active source snapshot. The patch adds an exact resource allowlist, registers the card WebUI handler and lists native sources in the existing browser_view target. It dry-applies to its recorded base; the full staged WebUI source passes syntax-only. The missing shipping internal-page icon was restored and loads in the isolated v7 fixture. This registration is unapplied and has no GN check, app build or real WebUI test; BrowserView owner, hooks, transitions, security and integration remain open.

The integration still needs a window-owned floating presentation with the
correct WebContents identity and z-order, the real shipping card chrome and
controls, hit testing, focus and keyboard behavior, generation-guarded
move/resize, device-local frame persistence and failure handling, and correct
close, reopen, replace and Keep as Split transitions. It must preserve the
page's full bounds, secure the original profile/private authority, avoid
covering permission or extension surfaces, and support small windows and
auto-hide. The existing native `MultiContentsView` can display two content
containers but also owns split ordering, active focus and resize controls;
overlapping its rectangles alone would not establish those behaviors. Its
ownership and teardown must be reviewed before any source patch is enabled.

Then add Open Link in Glance to Chromium's native context menu, bound to the
originating tab and frame with both Chromium navigation policy and shipping
external-protocol/forbidden-URL checks. Do not reuse Chromium's Open Link in
Split View, which can navigate an existing pane. Test real regular/private
windows, owner destruction and stale generations, move/resize and screen
reader controls, screenshots against shipping, and Windows/Linux before
claiming parity. No native source, running profile or build output is changed
by this draft.


`glance_window_owner.{h,cc}` stages a concrete window coordinator: it creates the card and reference containers below the existing Lens overlay, obtains a generation-scoped session and loads the card, watches parent bounds and document load, exposes pre-reattachment and modal-routing hooks, and retains a suspended session after parent teardown so a failed frame write can be retried. The overlay now supplies Views metadata needed for child insertion. SDK 27.2 syntax-only checks for the owner and overlay pass in `evidence/bangs-browser-syntax-20261030/glance-window-owner-v4-result.json`; v1 failed on an incomplete Profile type, constness and missing Views metadata and is preserved. Later checks exercise compilation only. The v1 registration snapshot still contains the older overlay and does not include this owner; it must be refreshed, reviewed and checked before integration.

This owner is not constructed by BrowserView or Island, and storage/transition callbacks, tab-switch/split hooks, dialog and blocked-state routing, focused state, navigation updates, quit handling and wake are not wired. Parent/child layering and security surfaces, callback reentrancy, frame-persistence failures, actual native rendering and cross-platform behavior need real tests. Destruction of the owner with an unsaved frame can still lose the write; a real window must retain it or veto shutdown. No full parity credit.


`integration-window-hooks-v2/` now stages a combined source patch against exact current Chromium 158 files: BrowserView asks the owner to detach before a real tab switch or split reattachment, routes the reference tab's container and modal host, and vetoes window close when a retained session reports a failed frame flush. It also refreshes the card handler/asset registration and includes the metadata-corrected overlay and owner. The patch dry-applies to its recorded base; owner, overlay, BrowserView and prototype WebUI pass syntax-only checks (`evidence/bangs-browser-syntax-20261030/glance-window-hooks-v1-result.json`). The owner is never instantiated yet, so these hooks are inert. The included prior-registration-v1.patch is historical; use window-hooks.patch for the staged combined changes.

Actual Island open/replace/close/keep-split actions, confirmed durable asynchronous frame storage and failure reporting, active focus/page updates, wake, UI, accessibility, mixed-private behavior and native cross-platform tests remain to do. The patch has not been applied to active source, GN checked, linked or executed. Do not claim parity or switch the development browser to it.


`glance_frame_store.{h,cc}` stages asynchronous, serialized profile-local frame storage. It accepts changes in memory, atomically writes on a blocking sequenced worker, reports completion/failure separately, refuses to overwrite malformed or unreadable input, and supports retry. `glance_profile_frame_store.{h,cc}` proposes one shared instance per original profile, including off-the-record windows. The owner now keeps a closed session until a supplied durability callback confirms the latest write; that callback has not yet been bound to the store. `evidence/glance-controller-20261030/store-result-v3.json` exercises actual disposable-file save ordering, reopen, reset, corrupt-file refusal and retry after write failure. The first test compile failed because macOS also defines Rect; the corrected run passed. Profile ownership, other platforms, actual BrowserView quit and failure UI are not tested.

`integration-persistence-v3/` refreshes the earlier staged patch and source inventory for these additions. Nothing is applied or built into the browser; owner creation, actual callback wiring, transitions, automatic completion after an asynchronous close, and user-visible read/write failures remain necessary. Sharing geometry across regular/private windows is the proposed mapping to shipping's device-local setting and still requires privacy and runtime review.


`integration-island-v4/` stages the first owner construction and bindings in the Island's native owner: the internal `previewGlancePair` probe selects a live active main/reference pair, creates the floating window using the profile store after it is ready, and stages Close/Open as Tab through durable completion. Tab/split/window-close paths cancel an obsolete deferred Open-as-Tab. The combined patch dry-applies and the modified native Island file passes syntax-only. It is not wired to the shipping renderer's Glance picker and is not live.

The first request while the store loads returns false and must be retried; replacement, Change, Keep as Split, sleep/wake, private pairing, progress/error UI and automatic window-close continuation are missing. Write failures remain pending with no user-facing recovery. The code has not been GN checked, linked or exercised in a browser; syntax checks do not validate lifetime/reentrancy, layout, protected surfaces or behavior. Do not promote or claim parity.


`integration-product-glance-v5/` stages the shipping renderer's Glance picker bridge against the hash-verified v12 host asset, adds bounded storage-read waiting with picker-epoch cancellation, and stages native replacement, Change and 50/50 Keep as Split. Native replacement validates the new pair before ending the old card and rechecks it after a pending save; a tab switch, split or window close supersedes deferred activation. The changed native file passes syntax-only and the exact modified host method passes a Node VM test for readiness, cancellation and failure with mocked bridge dependencies. Patch dry-applies; no complete browser, real IPC, Views layering, accessibility or cross-platform claim follows.

The staged split path conservatively rejects pinned tabs; grouping and rollback under reentrant failures need real scrutiny. Wake/sleep, mixed-private tabs, Change-picker anchoring, favicon/focus updates, delayed-operation failure reporting and frame read/write recovery UI are still incomplete. Picker cancellation after its request enters native IPC and asynchronous window-close continuation remain unproven. This asset is based on v12 and does not replace or qualify any running candidate.


`integration-cancellation-v6/` corrects the staged picker hit-test geometry to use the Glance picker rather than the hidden Island panel. A per-window native epoch now invalidates open requests on picker dismissal, tab changes, split changes and window close; the host supplies that epoch for every Glance open request. A pending user window close is staged to resume after frame-save completion, unless a later tab/split/open action cancels it. The epoch guards requests processed after cancellation; whether a native open already processed before dismissal should be undone is still unresolved.

The changed native source passes syntax-only. Focused Node VM tests exercise the staged picker method's readiness/cancel/failure handling and the corrected geometry with mocked DOM/IPC; these tests do not execute real native cancellation, real window close or browser rendering. Write-failure recovery UI, replacement and split rollback, wake, private pairing, focus/visual behavior and platform runtime remain unqualified. No code is applied or promoted.


`integration-dismissal-v7/` stages a token allocated for each picker selection. Dismissal invalidates that token, and if native already opened the corresponding new card, it requests that card's close; a prior existing card has a different token. For a replacement, cancellation after the old card was detached does not restore that old card. The changed native file passes syntax-only; a Node VM check covers picker readiness and cancellation before and after the open request using mocked IPC, not native scheduling. A failed first stage assembly command was corrected before syntax verification.

A complete unqualified asset bundle is staged at `artifacts/glance-floating-v7-20261030`, based on the fully hash-verified v12 asset inventory plus the v7 host/card assets. `integration-dismissal-v7/affected-browser-check.mjs` prepares isolated regular/private floating-card, main-width, replacement and split checks. It refuses to launch without a reviewed receipt matching source stage, binary, framework and zero-action guard; it has only passed JavaScript syntax, not run. It leaves owned fixture profiles and failure evidence intact. It does not cover real pointer/keyboard/accessibility, cancel timing, failed-save UI, wake, mixed-private behavior or visual parity.


`integration-preserve-reference-v8/` stages keeping the old reference attached while a replacement flushes its frame. Canceling that pending replacement leaves the prior card in place; canceling after replacement attempts to reopen the previous reference only if its tab and active window still validate. Replacement is revalidated around callbacks. The staged native selection path asks Chromium to load a discarded/reload-needed reference, holds the prior card while it loads, and rechecks the request token and tab identity before attaching. Quiet eligibility also excludes the current reference and a tab being woken for Glance. These are unbuilt changes; their lifecycle, visibility/discard behavior, restoration failure and privacy need real browser tests.

The native file, window session and owner pass syntax-only (`glance-preserve-reference-v5-result.json`); an earlier wake syntax check failed on a shadowed variable and is preserved. The staged host picker method passes a mocked IPC test including a waking result and cancellation. Full 89-file assets are staged at `artifacts/glance-floating-v8-20261030`; `affected-browser-check.mjs` is updated for them but remains unrun and currently covers only basic scripted card/replacement/split behavior, not waking or dismissal races. Do not promote or count parity.


`integration-recovery-v9/` stages a native Glance-position recovery dialog for failed reads and writes. Retry repeats the read or serialized write without clearing the existing file; Keep window open cancels the pending close/action while retaining the unsaved state. A user-requested close remains pending through a write failure and can resume after an acknowledged retry. The real native dialog and callback/close sequencing have not run, and the copy is currently English only. A standalone disk test verifies corrupt input is preserved, then explicitly repaired and read on retry, along with write-failure retry; it does not prove the dialog.

The native source changes pass syntax-only, and an unqualified 89-file candidate is staged at `artifacts/glance-floating-v9-20261030`. Browser/UI failure injection, accessibility, localization, profiles, cancellation/wake, private behavior, security, other platforms and full parity remain open. Nothing was applied or promoted.
