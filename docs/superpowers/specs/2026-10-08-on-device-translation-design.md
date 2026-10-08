# On-device page translation (F43) — design

Date: 2026-10-08. Status: design approved in conversation, awaiting written-spec review.

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
- Language identification: Firefox uses CLD2 compiled to WASM (`cld-worker.js`). CLD2 is Apache-2.0 *(license to re-verify in implementation)*.
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
| `src/renderer/translate.html` / `translate.js` / preload | The prompt capsule, a `blanc-chrome://` document in the permission-prompt slot. |
| `src/renderer/translate-engine.html` / `.js` | The engine page: spawns the worker, runs detection and translation. |

Flow:

1. Page commits (http/https main frame). The preload sends a ~2 KB text sample + `<html lang>` to main (`translate:detect`). Main forwards to the engine host, which runs CLD2.
2. If the language is confidently non-English and policy allows, main shows the capsule for that tab.
3. On **Translate**, main ensures the model (bundled: immediate; otherwise download + verify). The preload streams batches of blocks (`translate:batch`) → main → engine view → back.
4. A MutationObserver translates later-arriving content while the tab is in translated mode.

Page text travels only page → main → engine view, in memory. It is never written to disk, logged, synced, or included in diagnostics/crash reports.

## 2. User-facing behaviour

### Prompt capsule (bottom-centre, permission-prompt slot)

> 文A **This page is in French.** Translate to English? **[Translate] [Not now] [⋯]**

- ⋯ menu: **Always translate French** · **Never translate French** · **Never on lemonde.fr**.
- A pending permission prompt has priority; the translate prompt queues behind it.
- Download in progress (non-bundled languages): "Downloading French… 40%" + **Cancel**.
- After translating, the capsule collapses to "Translated from French · **[Show original]** **[✕]**". ✕ hides it; `/translate` brings it back.
- Failure (offline first download, hash mismatch, engine failure): "Couldn't translate this page." Never silent partial output without notice.

### When the prompt appears

- Only http(s) main frames, confident non-English detection, never `blanc://` pages.
- **Not now** suppresses the prompt for that tab until it navigates to a different site.
- **Always translate <language>** auto-translates silently (collapsed "Translated" capsule only).
- **Never translate <language>** / **Never on <site>** suppress the prompt; `/translate` still works.

### Commands and settings

- `/translate` toggles the current page between translated and original, even when no prompt appeared (reports the detected language). Added to `copy/slash-commands.json`, the overlay hint list, and the shortcuts page.
- Settings → General → **Translation**: "Offer to translate pages" (default on); lists of always/never languages and never sites with remove buttons; "Clear downloaded languages" with total size.
- Settings keys (device-local, deliberately outside `SYNCED_KEYS`): `translateOffer` (bool, default true), `translateAlwaysLanguages`, `translateNeverLanguages`, `translateNeverSites` (bounded arrays). Added to `settings-schema/schema.json`.

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
- Write-back uses `textContent` for text blocks; HTML-aligned blocks go through a strict allowlist sanitizer that permits only the inline tags/attributes present in the original block (re-attaching original attributes by alignment). Raw engine output is never assigned to `innerHTML`.

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
- Blocks with inline markup are sent as HTML for alignment; plain blocks as text.

### Prioritisation

In-viewport blocks first; within one viewport height next; remainder at idle. MutationObserver for new content. While find-in-page is open, translate the whole page.

### Show original

The preload keeps each translated block's original nodes in memory and swaps them back. Per tab, discarded on navigation, never sent to main.

### Interactions

- Quiet Tabs: a translated tab may still go quiet; on wake it reloads and re-translates if an Always rule applies, otherwise returns untranslated with the prompt.
- Dark websites: independent; both work together.
- Blockers: works with Blanc Blocker and uBO alike.

### Errors and limits

- Engine crash/hang >30 s: restart once, then "Couldn't translate". The page keeps whatever was translated; nothing is half-written.
- Low-confidence detection: no prompt; `/translate` still works and names the detected language.
- Pages over ~200 K words: translate viewport and near-viewport only.
- One model loaded at a time; switching languages swaps it. Engine view closes after 5 min idle.

## 5. Testing, release gates, claims

### Unit (`test/unit/`)

- `translate-policy.js`: every always/never/site/private/not-now combination.
- `translate-models.js`: bundled/cached/downloaded resolution; hash mismatch deletes and fails; cancel.
- Pinned manifest vs on-disk files.
- IPC sender validation and batch caps.
- Extraction and restore under vm/jsdom fixtures: markup preserved, skip rules honoured, Show original restores byte-for-byte.
- Sanitizer allowlist.
- Private-tab choices never reach `settings.json`.

### Guards

- `translate:check` in `substrate:check`; settings keys in `settings-schema/schema.json`; `/translate` in `copy/slash-commands.json`.
- `browser-api/contract.json` / `bridges.json` updated for new channels; `browser-api:build` vectors regenerated.
- Packaged verification confirms the engine, detector, bundled es/fr models and notices are in `app.asar` with pinned hashes on all four desktop targets.

### Acceptance

New `spec/features.md` entry **F43 — On-device translation** and `spec/acceptance/` scenarios against local French and Spanish fixture pages: prompt appears; Translate changes visible text; Show original restores it; Never suppresses; a private-tab choice isn't persisted; an `en` page never prompts. Test mode replaces only the R2 download with a local fixture server; the real engine runs (positive control that translation actually happened).

### Measurement gate

Words/second and resident memory on Apple Silicon, Intel Mac and the Windows VM. If fr→en of a 2,000-word article exceeds ~10 s on Intel, stop and return to the owner before release.

### Claims

Per `docs/marketing-claims.md`, after release only: "on-device translation; page text never leaves your computer; N languages into English". Not "AI translation", and no unqualified "private translation" without the model-download disclosure.

## Out of scope (v1)

Non-English target languages; selection translation; iframes (session preloads reach main frames only); PDF viewer; iOS/Android (mobile divergence to be recorded when ported).
