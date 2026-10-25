# Reader Mode implementation — October 25, 2026

Candidate implementation, **not a public-release capability**. Public v1.43.1
does not include Reader Mode. No version bump, release, website deployment,
social publication, or marketing claim is part of this change.

Reader Mode is free, manual, local article extraction after load. It makes no
speed, bandwidth, memory-saving, or additional tracking-protection claim. The
source page stays alive and can continue executing scripts and loading resources.

## Shared reading experience

Desktop and iOS use Mozilla Readability 0.6.0, DOMPurify 3.4.17, the same HTML
allowlist, and the same bundled reader document. Controls select System, Light,
Dark, or Sepia; Source Serif 4, Instrument Sans, Inter, or JetBrains Mono; 16–28px text in 2px steps;
and 560/720/880px maximum widths. Defaults are System, Serif, 20px, Comfortable.
The font picker previews each choice and the selected value in its own typeface,
with native radio semantics, arrow-key selection, and Escape focus return.
Controls use Instrument Sans at width 98 with +0.01em spacing; numeric output
uses Inter. Unsupported scripts use system font fallbacks.

Reader state, extracted text, and image bytes are transient. Desktop appearance
uses the profile-scoped `reader-appearance.json` store; iOS uses its app
container's local file. Private readers inherit normal settings and write only
to memory, discarded with the last private tab. Appearance is not synced.

The shared extractor clones the loaded main-frame DOM, omits hidden content,
caps input at 50,000 elements and 5 MiB of markup, and sanitizes article HTML.
The presentation sanitizes it again before insertion. Metadata is text, article
IDs are namespaced, and links admit only HTTP(S) or same-document fragments.
Scripts, forms, embeds, remote styles, inline handlers, and unsafe URLs are
removed. No alternate page, pagination, or hidden-content expansion is fetched.
Readability can still misidentify pages or omit content; failure leaves the
source intact and offers the ordinary page.

Blanc adapts the executable copy of pinned Readability 0.6.0 to anchor the whole
JSON-LD article-type expression and retain only resolved HTTP(S)/fragment links.
`reader-readability-adaptation.js` checks each upstream replacement exactly once
and fails on drift. The npm files remain unmodified; desktop and generated iOS
extraction share these fixes. Both the upstream and adaptation inputs are pinned.

## Desktop ownership and networking

`reader-mode.js` owns one sandboxed companion per active reader, separate from
the source tab's WebContents and its browsing session. `blanc-reader://` serves
an exact asset allowlist and record-owned image indexes in a nonpersistent
session, with no permission grants, downloads, or direct remote requests.
The narrow bridge is described by `browser-api/reader.json`; every message
checks companion identity, main frame, session, document, and source generation.
Article data never enters the chrome tab projection. Reader extraction uses
isolated world 1004, distinct from fill, Dark websites, and first-content probes.

Navigation and persistence keep the source URL. Back exits first; Forward and
Reload exit before navigating the source. Find, Print, zoom, focus, context-menu
navigation, Split View, Glance, tab switches, and window moves use the displayed
companion where appropriate. Quiet/discard, close, renderer failure, navigation,
and profile teardown discard reader content. Restores reopen only source URLs.

Desktop image fetching asks the source tab's current blocker with its original
page/frame context and image type. Denial, missing provider, errors, redirects,
or an 8-second deadline omit the image. The broker sends no cookies, referrers,
authorization, or content URLs to an external service. It validates every DNS
answer and pins the TCP connection to a checked public address, rejecting private
addresses and nonstandard ports. It follows no redirects and bounds individual
images to 5 MiB, three concurrent operations, 30 attempts, and 20 MiB per article.
Decoded images are also capped at 32 megapixels in total per desktop article.
Raster dimensions are checked before native decoding (16 megapixels maximum),
and only decoded PNG bytes are served back. PNG, JPEG, GIF, and supported WebP
are accepted; SVG and currently unsupported AVIF are omitted. Unavailable images
retain source alt text and captions without a broken-image icon.

The broker resolves names through the source Electron session, preserving its
resolver configuration, and pins the checked result. A non-DIRECT proxy result
omits the image because the pinned-address transport cannot inherit Chromium's
proxy/PAC routing or authentication. Authenticated images may also be unavailable.
It must not gain credentials or bypass blocker, proxy, or resolver policy as a
compatibility fallback.

## iOS implementation and image divergence

The native app retains its original WKWebView beneath a separate reader
WKWebView with a nonpersistent data store. Its scheme handler serves only
bundled files and in-memory image bytes; a per-reader reply handler exposes the
same four capabilities as desktop. Link requests carry an explicit current,
background-tab, foreground-tab, or new-window disposition; iOS opens a requested
new window as a foreground tab within its existing single-window browser. Extraction runs in a named WKContentWorld.
The palette offers a reader action on suitable articles, and `/reader` always
permits a manual attempt. Source navigation invalidates the reader; page-opened
children are excluded because they may inherit opener sandbox restrictions.

WKContentRuleList exposes no decision query suitable for the desktop broker.
iOS therefore reuses only already-loaded source images that can be rasterized
without violating canvas-origin restrictions. It makes no new image request.
Cross-origin images lacking canvas permission, unloaded images, and oversized
rasters retain their alt text/captions. This is recorded as D31; it does not
weaken content blocking to improve image coverage. Native Find/Print browser
controls remain subject to their existing iOS feature status.

## Maintenance and acceptance

Run `npm run reader:build` after extractor, sanitizer, catalog, dependency, or
font changes. Commit the generated iOS scripts, upstream license texts, copy,
and `reader-pinned.json` together. `reader:check` is in the substrate gate and
detects drift from installed, lock-pinned dependencies. German “System” and
German/Spanish “Sepia” are intentionally identical translations in the glossary.

Verification commands: `npm run lint`, `npm run substrate:check`,
`npm run test:unit`, `npm run test:acceptance:dry`, `npm run test:reader:desktop`,
and Cucumber's `@reader-mode` scenarios. Native tests live in `ReaderModeTests`
alongside the complete `BlancTests` target. The desktop smoke covers local
extraction/sanitization, Find, unchanged source DOM/scroll on return, appearance,
private readers, Split View, Glance, and moving a live reader to another window. It also checks automatic detection
after loading settles, regular/private modifier and middle-click dispositions,
and the Reader context menu’s Glance action.

Release acceptance remains pending for installed Apple Silicon and Intel
candidates, Windows and Linux machines, physical iPhone/iPad, VoiceOver and other
screen readers, and representative live publishers under both blocker providers.
Keep the existing protected merge, affected-machine confirmation, CodeQL,
packaging/compliance, What's New, and release gates. Passing source tests or an
iOS Simulator run does not waive those gates.

## Local verification evidence (October 25, 2026)

- Full desktop unit suite: **4,793 passed, 2 skipped, 0 failed** (4,795 total).
- Related Cucumber run (`@reader-mode or @glance or @split-view`): **104 scenarios,
  773 steps passed**, using the harness's configured one retry (two initial
  attempts retried). The three new reader scenarios also passed alone.
- Native `BlancTests`: **289 tests passed**; **58 reader/navigation/session tests**
  passed after same-document URL invalidation was added; the final reader-only
  replay passed all three tests after the last native/resource edits.
- Desktop smoke passed article safety, source return, Find, appearance/private
  state, Split View, Glance, and cross-window transfer. Light, Sepia, Dark, and
  390px layouts were rendered and inspected locally.
- Lint, substrate, bridge contracts, generated reader/pin checks, compliance,
  acceptance dry-run, and website/SEO build passed. Site validation used the
  bundled Node 24.19.0 runtime to meet the site's Node >=22.19 requirement.
- Production dependency audit: **zero vulnerabilities**. Reader smoke now runs
  in the existing Windows/macOS/Linux browser-shortcuts CI matrix and in the
  release press gate; native CI includes the new reader tests automatically.

These are source and Simulator results, not installed-platform release evidence.

The desktop smoke driver writes an atomic completion report only after all thirteen
checks finish. Its launcher requires that complete report, rejects assertion
errors, missing reports, and unexpected process exits, then gives Electron a
bounded grace period to stop. Linux may require controlled process-group cleanup
after a successful report (the same known test shutdown behavior handled by the
PDF smoke). Other platforms' shutdown hangs still fail. This exception does not
turn an incomplete or failed test into a pass and is covered by subprocess tests.
