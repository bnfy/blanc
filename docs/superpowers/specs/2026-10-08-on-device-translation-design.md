# On-device page translation (F43) — design

Date: 2026-10-08. Status: design approved in conversation; revised after first written-spec review.

Numbering: F43 follows F42 (Dark websites). F41 is Named Workspaces
(`spec/acceptance/F41-named-workspaces.feature`); its absence from
`spec/features.md` and `spec/parity-matrix.md` is documentation drift, not a
free number, and is out of scope here.

## Phase 0 — feasibility gate (before any UI or cache work)

Build the pinned WASM engine from the pinned `mozilla/translations` commit and
run it in a throwaway Electron harness (hidden sandboxed view + worker, the
section 1 placement) against a representative ~2,000-word French article and a
markup-heavy French page, on Apple Silicon, an Intel Mac, and the Windows VM.
Record per platform:

- engine load time and model load time
- cold (first article after load) and warm (second article) translation time
- peak and settled resident memory of the engine view's processes
- download size and decompressed size of the engine and fr→en model
- translation quality on the markup-heavy page (links, emphasis, lists intact)

Results are written to a dated evidence file under `docs/evidence/`. **Gate:**
if fr→en of the 2,000-word article exceeds ~10 s warm on the Intel Mac, or
quality on markup-heavy pages is unusable, stop and return to the owner before
building the feature. Phase 0 code is throwaway; only the pinned build recipe
and evidence carry forward.

## Goal

When a web page is in a language other than English (e.g. a French news site),
Blanc offers to translate it into English, the way Chrome, Edge, Safari and
Firefox do — but entirely on the device. Page text never leaves the computer.

## Decisions (owner, 2026-10-08)

| Question | Decision |
|---|---|
| Engine | Mozilla Bergamot (the `inference/` engine of `mozilla/translations`, MPL-2.0), the engine Firefox Translations uses. Chrome's built-in Translator API is not available in Electron (electron/electron#48567). |
| Trigger | Chrome-style prompt capsule on every page detected as non-English (subject to always/never rules). |
| Target language | English only in v1. Every Mozilla model is xx↔en, so each source language needs exactly one model and no pivot. |
| Model delivery | Hybrid: Spanish→English and French→English ship inside the app; every other released xx→en pair downloads on first use. |
| Engine placement | One hidden, sandboxed engine `WebContentsView` per app running the WASM engine in a dedicated worker; each tab gets an isolated-world preload that extracts and rewrites text. |

## Research basis (verified 2026-10-08; inference marked)

- Engine: `mozilla/translations` `inference/`, MPL-2.0, vendored by Firefox at a pinned commit (`toolkit/components/translations/bergamot-translator/moz.yaml`). Firefox's Remote Settings `translations-wasm` records are ~4.96 MB. Build needs WASM SIMD128, no pthreads (so no SharedArrayBuffer / COOP/COEP), `ENVIRONMENT=web,worker`. The npm `@browsermt/bergamot-translator` (0.4.9, 2022) is stale — we build from the pinned `mozilla/translations` commit and pin our own artifact.
- Firefox's fast integer GEMM uses Firefox-only `WebAssembly.mozIntGemm`; elsewhere the engine falls back to its embedded GEMM. *(Inference: Blanc runs slower than Firefox; Mozilla measured ~870 words/s en→de with optimized GEMM on a 2017 quad-core i7; expect several hundred words/s.)*
- Models: README states model files are MPL-2.0. Index `storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json` lists per-file `uncompressedHash` (SHA-256). 113 released pairs, all xx→en or en→xx, 59 non-English languages. fr→en: `model.fren.intgemm.alphas.bin` 31.6 MB (23.2 MB gz), `lex.50.50.fren.s2t.bin` 2.6 MB gz, `vocab.fren.spm` 0.4 MB.
- Language identification: Firefox uses CLD2 compiled to WASM (`cld-worker.js`). Upstream CLD2 is Apache-2.0 (github.com/CLD2Owners/cld2). The upstream project license does not by itself cover every mirrored byte: implementation includes a pinned-artifact audit of the exact CLD2 WASM wrapper/glue, the generated engine files, model provenance, and transitive notices.
- No published terms permit third-party apps to fetch from Mozilla's CDNs; Blanc mirrors pinned files to its own hosting.
- Memory *(inference, to be measured)*: ~60–150 MB resident per loaded pair.

## 1. Components and data flow

| Unit | Responsibility |
|---|---|
| `translate/` (repo dir, like `dark-reader/`) | Pinned, hash-verified upstream inputs: engine `.wasm` + JS glue, CLD2 detector, bundled es→en and fr→en model files, license/notice texts. `pinned.json` lists every released xx→en pair (URL, size, SHA-256) for on-demand download. `build.mjs` + `npm run translate:check` (joins `substrate:check`). |
| `src/main/translate-engine-host.js` | Owns the single hidden engine view: created lazily on first need, closed after 5 min idle, restarted once on crash. Feeds it the engine and models as ArrayBuffers. |
| `src/main/translate-models.js` | Resolves a language to model files: bundled → cached (`userData/translate-models/<pair>/`) → downloaded. Verifies every file's SHA-256; fails closed. |
| `src/main/translate-policy.js` | Pure, unit-tested, no `require('electron')`: should-prompt, auto-translate, always/never/site rules, private-tab overlay. |
| `src/main/translate-service.js` | Main-process coordinator: per-tab translation state, IPC handlers, capsule orchestration. |
| `src/main/translate-preload.js` | Session preload; runs its logic in isolated world **1003** with its own CSP. Samples text for detection, extracts blocks, writes translations back, restores originals. |
| `src/renderer/translate.html` / `translate.js` / preload | The translation capsule: a new per-window `blanc-chrome://` chrome surface (see "Capsule surface" below), separate from the permission and 1Password fill-status views. |
| `src/renderer/translate-engine.html` / `.js` | The engine page: spawns the worker, runs detection and translation. |

Flow:

1. Page commits (http/https main frame). The preload sends a ~2 KB text sample + `<html lang>` to main (`translate:detect`). Main forwards to the engine host, which runs CLD2.
2. If the language is confidently non-English and policy allows, main shows the capsule for that tab.
3. On **Translate**, main ensures the model (bundled: immediate; otherwise download + verify). The preload streams batches of blocks (`translate:batch`) → main → engine view → back.
4. A MutationObserver translates later-arriving content while the tab is in translated mode.

Page text travels only page → main → engine view, in memory. It is never written to disk, logged, synced, or included in diagnostics/crash reports.

### Generation and cancellation contract

Every detection request, model download wait, batch, mutation-driven batch,
and engine reply carries a binding key:

`{ tabId, webContentsId, navigationGeneration, translationGeneration }`

- `navigationGeneration` increments on every main-frame commit of the tab's
  live `WebContents` (including same-tab reloads and Quiet Tabs wake).
- `translationGeneration` increments on every Translate, Show original, and
  re-translate in that document.
- Main resolves the key against current state before applying anything, and
  the preload re-checks it before writing to the DOM. A mismatch — after
  navigation, tab close, the tab going quiet, Show original, a second
  translation, or `liveContents(tab)` no longer returning the same
  `WebContents` — discards the result silently.
- Cancellation is active, not just ignore-on-arrival: on any of those events
  main removes the tab's queued jobs and drops their text; an in-flight engine
  call finishes but its reply is discarded.
- Unit gates cover each invalidating event.

### Engine scheduling

One engine, one loaded model, one job at a time.

- Jobs are serialized through a single main-process queue. Priority: the
  active tab of the focused window's in-viewport batches → its near-viewport
  batches → its idle/mutation batches → background tabs (in-viewport only,
  until they become active).
- Batches are small (≤64 blocks / ≤32 KB), so a switch of active tab
  re-prioritizes within one batch.
- A job for a different language waits until the current batch finishes,
  then the model is swapped. The old model's buffers are released in the
  worker and main drops its ArrayBuffer references; no model data is kept
  beyond the loaded one.
- Text is dropped from the queue on cancellation (see contract above).
  Engine idle shutdown (5 min) happens only with an empty queue, and
  destroying the engine view discards the worker heap, including any residual
  text from private pages. Nothing queued survives a private tab's close or
  navigation.

## 2. User-facing behaviour

### Capsule surface

The translation capsule is a new per-window chrome surface: a transparent
`WebContentsView` on the window runtime record (like `permissionView` and
`fillStatusView`), attached bottom-centre only while it has something to show.

- Stacking, bottom to top: `tab < translation capsule < existing chrome
  overlays (island overlay, shield, utility sheet, fill-status) < permission
  prompt`. Any code path that re-adds a lower view re-stacks the higher ones,
  as `setActiveTab` already does for the overlay.
- While a permission prompt is showing, the translation capsule is hidden
  (not merely covered) and returns after the prompt resolves.
- The capsule only ever displays the active tab's translation state in its
  own window. Every capsule action carries the binding key of the tab it was
  shown for; main rejects it if that tab is no longer the active tab of that
  window or the key is stale. Switching tabs or windows hides/replaces the
  capsule and can never answer another tab's prompt.

### Prompt capsule

> 文A **This page is in French.** Translate to English? **[Translate] [Not now] [⋯]**

- ⋯ menu: **Always translate French** · **Never translate French** · **Never on lemonde.fr** (the page's normalized hostname).
- Download in progress (non-bundled languages): "Downloading French… 40%" + **Cancel**.
- After translating, the capsule collapses to "Translated from French · **[Show original]** **[✕]**". ✕ hides it; `/translate` brings it back.
- Failure (offline first download, hash mismatch, engine failure): "Couldn't translate this page." Never silent partial output without notice.

### When the prompt appears

- Only http(s) main frames, confident non-English detection, never `blanc://` pages.
- **Not now** suppresses the prompt for that tab until it navigates to a different site.
- **Always translate <language>** auto-translates silently (collapsed "Translated" capsule only).
- **Never translate <language>** / **Never on <site>** suppress the prompt; `/translate` still works.

### Commands and settings

- `/translate` toggles the current page between translated and original, even when no prompt appeared or a Never rule applies. Outcomes:
  - confident, supported language → translates and names it;
  - page is English → "This page is already in English.";
  - low confidence → "Couldn't tell what language this page is in." (never names a low-confidence guess);
  - confident but no released xx→en model → "Translating <language> isn't supported yet.";
  - not an http(s) page → "This page can't be translated."
- `/translate` is added to `copy/slash-commands.json`, the overlay hint list, and the shortcuts page.
- Settings → General → **Translation**: "Offer to translate pages" (default on); lists of always/never languages and never sites with remove buttons; "Clear downloaded languages" with total size.
- Settings keys (device-local, deliberately outside `SYNCED_KEYS`), added to `settings-schema/schema.json`:
  - `translateOffer`: bool, default `true`.
  - `translateAlwaysLanguages`, `translateNeverLanguages`: arrays of lowercase BCP-47 primary language subtags (`fr`, `es`), restricted to languages present in `translate/pinned.json`; max 64 entries; deduplicated. Adding a language to one list removes it from the other.
  - `translateNeverSites`: array of normalized hostnames (lowercased, IDNA/punycode ASCII form, trailing dot stripped, no port, no scheme; `www.` kept as-is). Exact hostname match only — no registrable-domain grouping, so no public-suffix dependency. Max 500 entries, max 253 chars each; deduplicated.
  - Invalid entries are dropped on read and write (`setSettings`/`getSettings` both normalize).
- Precedence, first match wins: **Never site → Never language → Always language → `translateOffer`**. `/translate` bypasses all four.

### Private tabs

Prompt and translation work. Always/never choices made from a private tab are memory-only (same pattern as `/dark-site` in private tabs) and never written to `settings.json`. Model files are shared across sessions; they contain no user data.

## 3. Security, privacy and model delivery

### Engine view

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`; never attached to a window.
- Loads `blanc-chrome://translate-engine` (new exact-allowlist entry). Per-document CSP allows `'wasm-unsafe-eval'` and `worker-src 'self'` only on that document; `connect-src 'none'` — the engine view has no network.
- Its preload exposes one narrow channel; engine and model bytes arrive from main as ArrayBuffers.

### Tab isolated world (1003)

- Own CSP via `setIsolatedWorldInfo`; must not share world 999 (same rule as Dark websites' 1002).
- Capabilities: `translate:detect`, `translate:batch`, `translate:state`. Main validates every call comes from a live tab's main frame on http(s); private/normal session derived from the sender, never trusted from the payload.
- Caps: ≤64 blocks and ≤32 KB text per batch, per-tab rate limit, bounded in-flight batches.
- Write-back never reconstructs page elements and never assigns engine output to `innerHTML`; see "DOM mutation contract" in section 4.

### Downloads

- Host: Blanc's own Cloudflare R2 bucket mirroring the pinned files (new infrastructure; setup runbook part of implementation).
- Fetch via an in-memory session: no cookies, no redirects, public address only, size and time limits; the request reveals only the language pair.
- Verify SHA-256 against `translate/pinned.json`, then atomic rename into `userData/translate-models/<pair>/`. Mismatch deletes and fails closed.
- Updating models or the engine is a reviewed release input, like the blocker lists and Dark Reader.

### Privacy and data rules

- Privacy policy and FAQ disclose: on-device translation; a first-use download reveals the requested language to Blanc's host; nothing else.
- No telemetry event for translation in v1.
- Page text, detected languages and translation history never reach disk, IPC logs, crash reports, diagnostics export or Sync. Only the always/never settings persist, device-locally.

### Licensing

MPL-2.0 engine and models and Apache-2.0 CLD2 recorded in `THIRD-PARTY-NOTICES.md` and `src/THIRD_PARTY_NOTICES.txt` with pinned upstream commit; license texts packaged; the packaged compliance gate updated.

## 4. Page translation mechanics

### Extraction (modelled on Firefox `translations-document.sys.mjs`)

- Units: block-level elements (`p`, `li`, `h1–h6`, `td`, `th`, `figcaption`, `blockquote`, `dt`, `dd`, `button`, `label`, `summary`, …) plus `document.title` and the `title`, `alt`, `placeholder`, `aria-label` attributes.
- Skip: `script`, `style`, `noscript`, `code`, `pre`, `kbd`, `samp`, `textarea`, `[contenteditable]`, `svg`/`math`, `[translate="no"]`, `.notranslate`, and subtrees with an English `lang`.
- Blocks with inline markup are sent to the engine as a placeholder-tagged string for alignment (each inline element replaced by an opaque numbered marker, no original attributes or URLs sent); plain blocks as text.

### DOM mutation contract

Translation changes text, never structure. The preload:

- Updates **existing text nodes' `nodeValue`** and the allowlisted attributes
  (`title`, `alt`, `placeholder`, `aria-label`) **in place**. Elements are
  never created, removed, re-parented, or re-serialized.
- Maps aligned engine output back to the block's original text nodes via the
  numbered markers. Marker text from the engine is treated as plain data: an
  unknown, duplicated, or missing marker means the alignment is rejected and
  the block falls back to a single translated string written into the
  block's first text node, with the other text nodes in that block emptied
  (still in place).
- Therefore preserves element identity, all other attributes, event
  listeners, form control values and state, focus and selection (selection
  ranges are re-clamped only if a node's length changed), and accessibility
  relationships (`id`, `aria-*` references, `for`, `labelledby`).
- Skips any text node that is focused-editable or inside a form control.

### Show original — guarantee

The preload records, per translated text node and attribute, the original
value and the translated value it wrote. Show original restores each recorded
node/attribute **whose current value still equals the value Blanc wrote** to
its original value, and leaves alone anything the page has since changed or
removed. Guarantee: after Show original, no text node or attribute contains
text written by Blanc's translation; page-made changes after translation are
kept. (Byte-for-byte document equality is not promised, because live pages
mutate themselves.)

### Prioritisation

In-viewport blocks first; within one viewport height next; remainder at idle. MutationObserver for new content. While find-in-page is open, translate the whole page.

### Show original

The originals map lives only in the preload's isolated world, per document; it is discarded on navigation and never sent to main.

### Interactions

- Quiet Tabs: a translated tab may still go quiet; on wake it reloads and re-translates if an Always rule applies, otherwise returns untranslated with the prompt.
- Dark websites: independent; both work together.
- Blockers: works with Blanc Blocker and uBO alike.

### Errors and limits

- Engine crash/hang >30 s: restart once and retry the failing batch. If it fails again: blocks already completed stay translated, the failing batch is never applied (each batch is applied atomically or not at all), remaining queued work for that tab is cancelled, and the capsule shows "Couldn't translate this page" with **Show original** available.
- Low-confidence detection: no prompt; `/translate` reports the outcomes listed in section 2.
- Pages over ~200 K words: translate viewport and near-viewport only.
- One model loaded at a time; switching languages swaps it. Engine view closes after 5 min idle.

## 5. Testing, release gates, claims

### Unit (`test/unit/`)

- `translate-policy.js`: every always/never/site/private/not-now combination, the precedence order, and settings normalization (hostname/language normalization, caps, dedup, cross-list exclusivity).
- Generation/cancellation: late detection, download, batch, mutation, and engine replies are discarded after navigation, tab close, quiet, Show original, and re-translate; queued text is removed on cancellation.
- Scheduler: priority order, language-swap waits for the current batch, model buffers released on swap, idle shutdown only with an empty queue.
- Capsule actions with a stale key or from a non-active tab are rejected.
- `translate-models.js`: bundled/cached/downloaded resolution; hash mismatch deletes and fails; cancel.
- Pinned manifest vs on-disk files.
- IPC sender validation and batch caps.
- Extraction and write-back under vm/jsdom fixtures: element identity, attributes, listeners, form values, selection, and ARIA references preserved; skip rules honoured; bad-marker fallback stays in place.
- Show original guarantee: no Blanc-written text remains; page changes made after translation survive.
- Failure path: a failing batch is never partially applied and later batches are cancelled.
- Private-tab choices never reach `settings.json`.

### Guards

- `translate:check` in `substrate:check`; settings keys in `settings-schema/schema.json`; `/translate` in `copy/slash-commands.json`.
- `browser-api/contract.json` / `bridges.json` updated for new channels; `browser-api:build` vectors regenerated.
- Packaged verification confirms the engine, detector, bundled es/fr models and notices are in `app.asar` with pinned hashes on all four desktop targets.

### Acceptance

New `spec/features.md` entry **F43 — On-device translation** and `spec/acceptance/` scenarios against local French and Spanish fixture pages: prompt appears; Translate changes visible text; Show original restores it; Never suppresses; a private-tab choice isn't persisted; an `en` page never prompts. Test mode replaces only the R2 download with a local fixture server; the real engine runs (positive control that translation actually happened).

### Measurement

The feasibility gate is Phase 0 (top of this document), run before any feature work. Before release, the same measurements are repeated on the packaged candidate and compared with the Phase 0 evidence.

### Claims

Per `docs/marketing-claims.md`, after release only: "on-device translation; page text never leaves your computer; N languages into English". Not "AI translation", and no unqualified "private translation" without the model-download disclosure.

## Out of scope (v1)

Non-English target languages; selection translation; iframes (session preloads reach main frames only); PDF viewer; iOS/Android (mobile divergence to be recorded when ported).
