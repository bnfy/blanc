# SUPERSEDED — do not implement

This bookmark-folder design was rejected on 2026-08-23 because it contradicted the product
requirement: users must be able to import their already-open tabs without first organizing or
bookmarking them in the source browser. The corrected source of truth is
[`2026-08-23-direct-open-tab-migration-design.md`](2026-08-23-direct-open-tab-migration-design.md).
The remainder of this file is retained only as a non-normative audit record of the invalid design.
It must not be used for implementation or product-review decisions.

# AI-assisted tab migration — bring the keepers, not the mess

**Date:** 2026-08-23  
**Historical status at rejection:** The folder-backed prototype had been implemented on desktop,
but it never shipped as F39 and has been replaced. No decisions below remain binding.
**Extends:** [Import Favorites + Favorites Folders](2026-07-11-import-favorites-folders-design.md) and [Blanc Patron](2026-08-18-blanc-patron-design.md)

## Context

Blanc can already import Favorites from installed Chromium-family browsers and from an
exported Netscape bookmarks HTML file. It cannot import another browser's live open-tab
session. The social **#TabBarReset** campaign exposes a useful migration ritual:

1. Count the open tabs in the old browser.
2. Close anything finished.
3. Bookmark the keepers into a temporary **“tab reset”** folder.
4. Install Blanc and bring the keepers over.

The current product stops after step 4's Favorites import. Favorites and open tabs are
separate concepts, so the user must manually reopen, sort, and name every surviving page.
That is exactly where the old tab mess can rebuild itself.

This project makes the bridge first-class. Blanc imports a selected bookmarks folder,
uses on-device semantic organization to propose meaningful tab groups, lets the user
review every decision, and materializes the approved result as quiet tabs. Patrons may
optionally save that result as a Named Workspace.

The product sentence is:

> **Blanc doesn't just import your tab mess. It helps you make sense of it.**

## Decision summary

The following decisions are part of this design:

- The feature is called **Bring Your Tabs** in user-visible copy.
- v1 imports a user-selected bookmarks folder. It does **not** parse another browser's
  live session files.
- The expected source ritual is “bookmark the tabs you want to keep,” but the tool works
  with any bookmarks folder; its name does not have to be “tab reset.”
- Organization runs **on device**. No title, domain, URL, folder name, embedding, or group
  suggestion is sent to Blanc or a model provider.
- AI proposes only. The user previews, edits, and explicitly applies the result.
- The organizer receives sanitized titles, hostnames, and source-folder names. It never
  reads page contents, query strings, fragments, cookies, history, passwords, or form data.
- Imported pages are also added to Favorites, preserving the user's archive. The same
  pages are then opened as ordinary non-private tabs.
- Imported tabs are born quiet (`asleep: true`); only the selected imported tab wakes.
- Suggested tab groups are free. Migration is an acquisition feature and is never gated
  by Patron.
- A Patron may additionally save the approved tab/group set as a Named Workspace.
  Non-Patrons complete migration without an upsell blocking the flow.
- Existing browser import behavior and existing Favorite-folder persistence remain
  backwards compatible.
- **Source tree API (locked):** `browser-data-import.js` and the Netscape HTML parser gain a
  bounded **folder-tree projection** for picker UI plus **subtree candidate extraction** for a
  selected migration root. F30's flat `readSource()` → `importBookmarks()` output stays
  byte-compatible; tab migration never changes what a full-profile Favorites import returns.
- **Favorites folder on apply (locked):** each imported Favorite keeps its **immediate
  source subfolder** name — the same rule F30 locks for profile/HTML import. The migration
  root folder name is **not** stamped onto every entry. Organizer input still carries the
  full `folderPath[]` beneath that root.
- **Apply atomicity (locked):** tabs and groups are created first inside one batch seam;
  Favorites are written only after every quiet tab record succeeds. A tab-batch failure leaves
  Favorites untouched. A Favorites failure after a successful tab batch is surfaced as partial
  success with idempotent retry — tabs/groups already exist; `importBookmarks()` skips
  duplicates on retry.
- **Embedding runtime (locked):** inference runs in a **sandboxed Web Worker inside the
  `blanc://tab-import/` utility renderer**. The worker returns only a generation token plus
  the embedding matrix to main over IPC; raw vectors are never stored in renderer JS heap
  beyond the worker boundary, never cross ordinary tab IPC, and are released when the session
  ends. Clustering, naming, and validation stay in main's pure `tab-import-organizer.js`.
- **Imported tab order (locked):** preview list order is authoritative through review and
  apply. Within each group column, order follows preview order. `tabOrder` splices the full
  imported batch at the active tab's index (or window end if none). The **first selected
  candidate in preview order** is the sole tab that wakes and receives focus.
- **First-run handoff (locked):** F36 onboarding adds a post-import **Bring a folder in as
  tabs…** row on the import step after any successful Favorites import (full profile or HTML
  file). Skipping import does not block Bring Your Tabs — the walkthrough's import step also
  offers **Bring tabs without importing everything…**, which opens the same utility sheet
  without requiring a prior `importBookmarks()` call. The Favorites sheet and `/bring-tabs`
  remain available afterward.

## Goals

1. Turn a selected source-browser bookmarks folder into a reviewed set of Blanc tabs.
2. Reduce the manual labor between importing Favorites and having a usable tab setup.
3. Suggest contextually meaningful, editable group names instead of generic placeholders.
4. Preserve Blanc's local-first privacy posture.
5. Avoid a memory spike when a user imports dozens or hundreds of tabs.
6. Give every candidate a visible disposition: grouped, ungrouped, or excluded.
7. Make the #TabBarReset campaign truthfully end in a product capability.

## Non-goals

- Reading Chrome/Edge/Brave/Vivaldi/Firefox/Safari live session databases.
- Closing or modifying tabs in the source browser.
- Importing incognito/private tabs.
- Importing passwords, cookies, history, permissions, extensions, or form state.
- Reading or summarizing page contents.
- Cloud inference or sending tab metadata to a third party.
- Automatically creating or purchasing a Patron subscription.
- Automatically creating a Named Workspace without an active Patron entitlement and a
  separate user gesture.
- Reorganizing a user's existing Blanc window in the background.
- An ongoing “AI tab manager” or `/organize` command. That is a possible follow-on project.
- A source-browser extension or native messaging host. Those may be evaluated later as a
  direct live-tab handoff.

## User experience

### Entry points

Bring Your Tabs has three entry points:

1. **First-run onboarding (F36):** on the import step, after any successful Favorites import,
   show **Bring a folder in as tabs…** as a secondary action beneath the imported count. If
   the user skipped import or imported zero entries, the same step offers **Bring tabs without
   importing everything…** — both open the utility sheet without requiring a prior full-profile
   import. This is a post-action CTA on the import step, not a separate wizard step.
2. **Favorites utility sheet:** add **Bring tabs…** beside the existing import action.
3. **Slash command:** `/bring-tabs` opens the same utility sheet. This is a convenience,
   not a separate implementation.

All entry points open a dedicated `blanc://tab-import/` utility sheet owned by the invoking
window and current local profile.

**Utility-sheet behavior while a session is open:** unlike Settings (toggle-dismiss on
repeat open), `blanc://tab-import/` is **non-toggle** while an import session exists — Escape,
scrim click, or the close control cancels the flow and destroys its ephemeral import session.
Summoning ⌘L still dismisses the sheet per existing utility-sheet rules; cancel-on-dismiss
destroys the session. A completed or failed apply closes the sheet normally.

### Step 1 — choose the source

The first screen explains the bridge plainly:

> **Bring your tabs**  
> Bookmark the pages you want to keep in your old browser. Blanc can import that folder,
> suggest groups, and open the result without loading every page at once.

The source picker reuses the current browser discovery service:

- Google Chrome
- Microsoft Edge
- Brave
- Chromium
- Vivaldi
- **From a bookmarks file (HTML)…** for Safari, Firefox, and other browsers

Selecting a source never imports immediately. It reads a bounded snapshot and advances to
folder selection.

### Step 2 — choose a folder

Display the source folder tree with a count beside every folder. The user selects one folder
as the migration root. Descendants are included by default and remain separately identifiable
for grouping.

The UI may highlight folders named `tab reset`, `open tabs`, `session`, or `to migrate`, but
must never silently select one merely because its name matches.

After exact-URL deduplication within the selected subtree, if more than 500 valid HTTP(S)
candidates remain, show:

> This folder has more than 500 pages. Choose a smaller folder before continuing.

The 500 cap applies to **deduplicated HTTP(S) candidates**, not raw bookmark nodes. The
feature does not truncate silently.

### Source tree API (locked)

`browser-data-import.js` and `bookmark-import.js` share one bounded tree shape. Tab migration
adds new read paths; F30 full-profile import keeps today's flat `entries[]` output.

```js
// Folder picker — bounded tree under a source snapshot
{
  folders: [
    {
      folderId: 'opaque-stable-per-snapshot',
      name: 'tab reset',
      pathLabels: ['Bookmarks bar', 'tab reset'], // display only; not persisted to Favorites
      childFolderIds: ['folder-child-a'],
      httpCount: 42,          // direct HTTP(S) URLs in this folder only
      subtreeHttpCount: 87,   // this folder + descendants, before dedup
    },
  ],
  rootFolderIds: ['folder-root-bar'],
}

// Candidate extraction — selected migration root
readSubtreeCandidates(rootFolderId) → {
  candidates: [
    {
      candidateId: 'session-assigned later',
      url, title, addedAt,
      folderPath: ['github.com'],     // segments beneath migration root
      favoriteFolder: 'github.com',   // immediate subfolder → Favorites (F30 rule)
      sourceFolderId: 'folder-child-a',
    },
  ],
}
```

Limits reuse existing import bounds (20 MiB file, 100k nodes, depth 64) plus the 500
deduplicated-candidate cap. Chromium JSON and Netscape HTML must both implement the same seam.
`readSource(id)` for F30 continues to return flat `{ entries }` with immediate-parent
`folder` only — no behavior change for onboarding's import-browser path.

### Step 3 — preview the candidates

The preview shows each candidate's:

- title;
- hostname;
- source folder path;
- selected/excluded state.

The renderer does not receive the full URL. Every row uses an opaque, per-session
`candidateId`; main retains the exact URL. The user may select all, select none, or toggle
individual rows.

Exact duplicate URLs within the selected source folder collapse into one candidate with a
visible **duplicate removed** count. Do not strip query parameters, fragments, or otherwise
guess that two distinct URLs are equivalent. Exact string equality after ordinary `URL`
parsing and serialization is the only deduplication rule.

### Step 4 — organize on device

The primary action reads **Suggest groups on this device**. Supporting copy is explicit:

> Blanc uses tab titles, domains, and bookmark-folder names on this device. It never reads
> the pages or sends this information anywhere.

The deterministic fallback action, **Use bookmark folders**, is always available and never
requires the model.

**Desktop v1 (2026-08-23):** only **Use bookmark folders** ships. The semantic primary
action is not shown until a reviewed model passes packaging gates on all three desktop
platforms. Main retains `pages:tab-import:suggest-embed` and
`pages:tab-import:submit-embeddings` for a future worker; no renderer invokes them in v1.

During organization, show progress without fabricated precision:

> Finding related pages…

Cancellation leaves the candidate selection intact and returns to the preview.

### Step 5 — review the proposal

The review screen shows group columns or sections with draggable candidate rows. It supports:

- rename group;
- create group;
- delete an empty group;
- move a candidate between groups;
- leave a candidate ungrouped;
- exclude a candidate from migration;
- restore the original suggestion;
- switch to the folder-based fallback.

Each suggestion has an optional, non-technical confidence treatment:

- solid placement: high-confidence relationship;
- **needs a look**: low confidence;
- **ungrouped**: no defensible suggestion.

Never display numeric model confidence. It implies a level of calibration the product has
not established.

Group names use Blanc's existing rules: trimmed, lowercase, maximum 40 characters. Suggested
names are one to three short terms when possible (`project atlas`, `design refs`, `travel`).
Generic names such as `misc`, `stuff`, `other 2`, or `imported tabs` are not invented merely
to avoid leaving candidates ungrouped.

The final action states the exact consequence:

> **Open 38 tabs in 5 groups**

If there are ungrouped candidates, the count remains explicit:

> Open 38 tabs in 5 groups · 3 ungrouped

### Step 6 — apply

Applying performs one main-process-owned operation against the window and profile that
created the import session:

1. Revalidate the session, source snapshot, candidate IDs, selected set, URLs, and group
   proposal.
2. Create the approved group records before creating any grouped tab.
3. Create every selected tab with `asleep: true`, its source title, and its approved group ID,
   in **preview list order**, via the batch quiet-tab seam (one broadcast).
4. `pruneEmptyGroups()`.
5. Wake and focus only the **first selected candidate in preview order** (sole network load).
6. Add the selected entries to Favorites through the existing idempotent import path.
7. Persist ordinary session state through the existing session pipeline.
8. Destroy the import session and its embeddings.

The utility sheet then closes. The result is ordinary Blanc state: Favorites in the current
profile, tabs in the invoking window, groups in that window, and no new migration-specific
persistence.

If no candidate survives final validation, do not mutate Favorites, tabs, groups, or
workspaces. Return to the preview with a recoverable explanation.

### Step 7 — optional Named Workspace

After a successful import:

- Everyone sees the imported tabs and groups immediately.
- Active Patrons see **Save this setup as a workspace…**.
- Non-Patrons may see one quiet explanatory line—**Named Workspaces can save this whole
  setup for later**—with the existing Patron learn-more route. Dismissing it ends the flow.

Workspace creation remains a separate, explicit gesture using the existing
`chrome:workspaces-save-as` path. Migration never calls the Patron checkout and never
withholds the imported groups from a free user.

## Organizer design

### Why semantic assistance instead of placeholder groups

Domain-only grouping is reliable but often unhelpful: a project can span GitHub, Linear,
Figma, Google Docs, and documentation sites. Folder-only grouping is useful when the source
is already organized, but #TabBarReset specifically targets people whose browser state is
not organized.

The organizer therefore combines deterministic structure with semantic similarity:

1. Preserve strong source-folder boundaries when they contain at least two selected pages.
2. Treat repeated hostnames as a useful signal, not a mandatory group.
3. Embed sanitized title/folder/hostname text locally.
4. Cluster semantically related candidates within bounded group-count and group-size rules.
5. Derive a short group name from salient shared title/folder/hostname terms.
6. Leave low-confidence candidates ungrouped.

The model never emits URLs or tab IDs. It produces embeddings only. Pure application code
owns clustering, naming, validation, and every state mutation.

### Model input

For each selected candidate, construct:

```js
{
  candidateId,                // opaque random session identifier
  title: sanitizedTitle,      // bounded to 240 Unicode code points
  hostname: normalizedHost,   // hostname only; no username, path, query, or fragment
  folderPath: sanitizedParts, // bounded array of source folder names
}
```

Title sanitization removes control characters and collapses whitespace. It does not attempt
to infer or redact sensitive concepts because unreliable redaction would create a false
privacy promise. Privacy comes from on-device execution.

No full URL, favicon URL, page content, history, cookie, profile name, local filesystem path,
or Blanc account/license identifier enters the model input.

### Runtime

Use a reviewed, quantized text-embedding model through a JavaScript/WASM runtime. The model
must run outside the main-process event loop.

**Locked placement:** a sandboxed **Web Worker in the `blanc://tab-import/` utility renderer**
runs inference. Main never loads the model at startup. The worker posts embedding vectors back
to main through the import-session IPC boundary; main stores them only inside
`TabImportSessionStore` for the active session, runs pure clustering in
`tab-import-organizer.js`, then releases them on cancel/apply/expiry. The renderer never
retains vectors outside the worker, never logs them, and never exposes them to other
`blanc://` pages. A new native module or main-process inference thread is out of scope —
Blanc's macOS library-validation exception is deliberately restricted to the 1Password Plugin
helper.

ONNX Runtime supports on-device JavaScript inference, including WASM in an Electron frontend,
and Transformers.js supports local feature extraction/embeddings. These are implementation
candidates, not an instruction to accept a model or dependency without the normal license,
size, provenance, and packaging review:

- <https://onnxruntime.ai/docs/tutorials/web/>
- <https://huggingface.co/docs/transformers.js/en/index>

The selected model and runtime must be:

- redistributable under a reviewed permissive license;
- pinned to exact version and SHA-256;
- included in third-party notices and the release SBOM;
- cross-platform with no downloaded executable code;
- usable fully offline after installation;
- bounded in memory and runtime;
- loaded only on the Bring Your Tabs surface, never at browser startup.

The implementation plan must benchmark a bundled model against an on-demand, hash-verified
asset. The default decision is **bundle it** if the compressed installer increase is at most
30 MiB and the source gate can verify the exact payload on macOS, Windows, and Linux. If it
exceeds that limit, this design returns for review rather than silently adding a network
model download.

**Task 15 benchmark (2026-08-23):** the smallest reviewed curated payload
(`Xenova/paraphrase-MiniLM-L3-v2` `model_uint8.onnx` + ORT Web WASM + Transformers.js
web runtime) is **30.04 MiB uncompressed**, failing the 30 MiB gate. Performance
budgets pass on the dev benchmark host (100 candidates in 80 ms, 500 in 299 ms). **F39 v1
ships folder-only**; on-device embeddings and Tasks 16–17 are deferred. See
`docs/superpowers/specs/2026-08-23-tab-import-embedding-benchmark.md` and
`tab-import/embedding-ship-decision.json`.

### Clustering and naming

Clustering lives in a pure Electron-free module and is deterministic for a fixed input and
embedding matrix.

Locked bounds:

- maximum candidates: 500;
- minimum suggested group size: 2;
- maximum suggested groups: 12;
- maximum group name: 40 characters;
- every selected candidate appears exactly once across grouped and ungrouped output;
- no group contains an excluded or unknown candidate ID.

Folder anchors win when the user deliberately created nested folders beneath the selected
migration root. Remaining candidates use cosine similarity with bounded agglomerative
clustering. The implementation plan will lock and fixture-test the similarity threshold;
it must not adapt by calling a service or learning from user data.

Suggested names come from weighted, human-readable tokens shared by cluster members:

1. source subfolder terms;
2. repeated meaningful title terms;
3. repeated hostname labels.

Stop words, tracking-like tokens, UUIDs, hashes, long numbers, and file extensions are
discarded. Name derivation is deterministic and does not require a generative model.
Collisions receive the next distinct salient term; if no honest distinct name exists, leave
the cluster unnamed for user review rather than generating `group 2`.

### Output schema and validator

```js
{
  version: 1,
  groups: [
    {
      suggestionId: 'opaque-id',
      name: 'project atlas',
      candidateIds: ['candidate-a', 'candidate-b'],
      confidence: 'high' | 'review',
    },
  ],
  ungroupedCandidateIds: ['candidate-c'],
}
```

The validator rejects the entire proposal if it contains a duplicate, missing, excluded, or
unknown candidate ID; too many groups; an invalid name; or a group below the minimum size.
It then falls back to the deterministic folder proposal. It never partially applies a
malformed AI result.

## Import-session privacy boundary

Open-tab candidates are as sensitive as Quiet Tab snapshots and Recently Closed snapshots.
They may reveal health, finance, legal, relationship, or confidential work activity.

Create a main-process-only `TabImportSessionStore` with these rules:

- one session belongs to one window runtime, one local profile, and one trusted
  `blanc://tab-import/` main frame;
- session IDs and candidate IDs are cryptographically random;
- sessions expire after 15 minutes of inactivity;
- cancel, utility-sheet close, window close, profile deletion, app quit, or successful apply
  destroys the session immediately;
- exact URLs, source filesystem paths, and embeddings never cross ordinary tab IPC;
- sessions never enter `session.json`, Favorites sync, Profile Sync, workspaces, telemetry,
  crash reports, logs, screenshots, or support bundles;
- renderer projections contain only candidate ID, title, hostname, folder path, and selected
  state;
- model input and embeddings exist only for the active session and are released on exit.

No new telemetry ships with v1. A future aggregate event would require a separate privacy
review and may contain counts only—never names, titles, domains, folder names, or URLs.

## IPC and trust

Add host-specific `pages:tab-import:*` channels exposed only by the `blanc://tab-import/`
branch of `tab-preload.js`:

```text
pages:tab-import:sources
pages:tab-import:read-source
pages:tab-import:read-file
pages:tab-import:folders
pages:tab-import:select-folder
pages:tab-import:suggest
pages:tab-import:apply
pages:tab-import:cancel
```

Names may be consolidated during implementation, but the trust model is fixed:

- main derives the owning window/profile from the sender;
- no focused-window fallback;
- every call requires the exact expected host, owned WebContents, main frame, and utility
  surface;
- the apply call sends candidate IDs and edited group membership, never URLs;
- main resolves all IDs from its import session and revalidates everything;
- model completion carries a generation token so a cancelled/replaced session cannot commit
  stale suggestions;
- apply is idempotent per import session and rejects a second invocation;
- `ownsSender` for `tab-import` follows the existing utility-sheet hook — only the live
  sheet `WebContents` for the owning window runtime may invoke these channels.

On the review screen, renaming a suggested group to match an **existing window group name**
follows the same lowercase identity rules as `groupTabByName`: same name → candidates merge
into that existing group on apply; a new distinct name creates a fresh group record.

The page renderer never calls `createTab`, mutates `groups`, writes Favorites, or creates a
workspace directly. `pages.js` delegates the final operation to a main-process hook bound to
the sender's window runtime.

## Applying tabs and groups

The main-process apply seam consumes validated records shaped like:

```js
{
  entries: [{ candidateId, url, title, favicon, addedAt, favoriteFolder }],
  groups: [{ name, candidateIds }],
  ungroupedCandidateIds: [],
}
```

`favicon` is optional and usually `null` from Chromium JSON and Netscape HTML sources. Do
not fetch remote icons during migration; live favicons may resolve when a tab wakes.

Application order is load-bearing:

1. Filter non-HTTP(S), forbidden, utility, malformed, and no-longer-selected URLs.
2. Build fresh group records on the destination runtime (respecting name collisions per
   `groupTabByName` rules when the user reused an existing group name on review).
3. Batch-create quiet tabs in **preview list order** via the narrow seam — each
   `createTab(url, { asleep: true, title, favicon, groupId })` equivalent without per-tab
   `broadcastTabs()` or utility-sheet dismissal.
4. `pruneEmptyGroups()`.
5. Wake and focus the first selected candidate in preview order — **only this tab** may load
   a page or make a network request; all other imported tabs stay quiet with no `WebContents`.
6. Import valid entries through `bookmarks.importBookmarks()`; existing duplicates remain
   the normal `skipped` result. `favoriteFolder` is each entry's **immediate source
   subfolder** name (F30 rule), not the migration root.
7. Broadcast once after the batch.
8. Schedule ordinary menu/session/workspace persistence through existing paths.

If step 3–5 fail, Favorites are not written. If step 6 fails after a successful tab batch,
tabs and groups remain; surface a recoverable Favorites error and allow retry (idempotent).

`createTab` currently broadcasts and hides the utility sheet per call, so the implementation
plan must introduce a narrow batch seam rather than loop the public function 500 times with
500 renderer broadcasts. That seam must preserve the same validation and ownership
invariants; it is not permission to duplicate tab construction.

If the destination window is bound to a Named Workspace, applying modifies that workspace
and the existing autosave path records the result. The confirmation screen names that
destination. v1 does not silently create a separate workspace or window.

## Favorites semantics

User-visible copy says **Favorites**. Internal identifiers remain `bookmarks`.

Selected source entries are imported as Favorites even when the user also opens them as
tabs. This preserves the migration archive and makes closing an imported tab non-destructive.
Re-running the same migration remains safe because `bookmarks.importBookmarks()` skips
existing URLs.

**Folder assignment (locked):** each imported Favorite receives the **immediate source
subfolder** name beneath the selected migration root — identical to F30 profile/HTML import.
Example: migration root `tab reset` containing `work/github.com` and `travel/hotels` yields
Favorite folders `github.com` and `hotels`, not a single `tab reset` folder. The migration
root name is shown in UI copy only.

Descendant path segments feed organizer `folderPath[]` and preview folder labels. Persistence
continues to follow Blanc's current single-level Favorite-folder model. This project does not
silently introduce nested Favorites folders.

## Failure behavior

| Failure | User-visible behavior | State change |
|---|---|---|
| Source browser/profile disappears | “That browser profile is no longer available.” | None |
| Source file unreadable/too large | Existing bounded import error copy | None |
| No HTTP(S) candidates | “No pages in this folder can be brought over.” | None |
| More than 500 candidates | Ask for a smaller folder | None |
| Model unavailable or fails | “Smart groups weren't available. Your tabs are still ready.” Offer folder fallback | None |
| Malformed organizer output | Silent internal rejection; show folder fallback | None |
| Session expires | “This import expired. Choose the folder again.” | None |
| Window/profile ownership changes | Cancel import | None |
| Some candidates fail final validation | Show revised count and require reconfirmation | None before reconfirmation |
| Tab batch fails during apply | Explain and retry; Favorites not written | No new tabs, groups, or Favorites |
| Favorites write fails after successful tab batch | Tabs/groups remain; explain and offer Favorites retry | Partial success; idempotent retry |
| Workspace save fails after import | Tabs/groups remain; report workspace error separately | Migration stays complete |

No failure falls back to cloud inference.

## Accessibility and interaction

- The entire flow is keyboard operable.
- Drag-and-drop always has Move to group / Move to ungrouped menu equivalents.
- Group names are real labeled inputs with inline validation.
- Candidate selection uses checkboxes, not click-only rows.
- Progress is announced through a polite live region.
- Error summaries move focus to the first actionable recovery control.
- Color is never the sole confidence indicator.
- Reduced-motion users receive no animated reflow during clustering.

## Performance budgets

These are release gates, measured with a representative 100-candidate fixture and a
500-candidate stress fixture:

- no model work at startup or outside the utility sheet;
- source discovery remains under the current bounded file reads;
- 100-candidate suggestions complete within 3 seconds on the oldest supported macOS test
  machine and the Windows release runner class;
- 500-candidate suggestions complete within 10 seconds or cancel cleanly;
- transient organizer memory stays below 250 MiB above baseline;
- applying 500 candidates creates no more than one live imported WebContents;
- no imported background tab makes a network request before activation;
- cancellation releases the worker/model session without leaving a running task.

If the selected model cannot meet these budgets across macOS, Windows, and Linux, the
feature ships with deterministic folder/domain suggestions until a suitable model passes.

## File and module shape

Expected implementation surface:

| File | Responsibility |
|---|---|
| `src/main/browser-data-import.js` | Add bounded `readFolderTree()` / `readSubtreeCandidates(rootId)` (Chromium JSON + shared HTML parser); keep `readSource()` flat output compatible with F30 |
| `src/main/bookmark-import.js` | Netscape HTML parser exposes the same tree/subtree seam as Chromium JSON |
| `src/main/tab-import-session.js` | Ephemeral ticket/candidate store, ownership, expiry, generation, cancellation |
| `src/main/tab-import-organizer.js` | Pure sanitization, clustering, naming, fallback, and output validation; no Electron |
| `src/renderer/pages/tab-import-worker.js` | Deferred | Sandboxed Web Worker: WASM embedding inference (not shipped v1) |
| `src/main/pages.js` | Exact-host guarded tab-import channels and file picker |
| `src/main/tab-preload.js` | `blanc://tab-import/`-only bridge |
| `src/main/utility-pages.js` | Classify `blanc://tab-import/` as a utility sheet |
| `src/main/main.js` | Sender-runtime apply hook, batch quiet-tab creation, optional post-import workspace action |
| `src/renderer/pages/tab-import.html` | Dedicated utility-sheet document and CSP |
| `src/renderer/pages/tab-import.js` | Source/folder/preview/review UI state; opaque IDs only |
| `src/renderer/pages/pages.css` | Shared utility-sheet visual treatment |
| `src/renderer/overlay.js` | `/bring-tabs` command routing only if command dispatch belongs here |
| `test/unit/tab-import-*.test.js` | Pure parser, session, sanitizer, clustering, naming, and validator coverage |
| `test/desktop/tab-import*.mjs` | Trusted IPC, UI, apply, quiet-tab, profile, workspace, and failure acceptance |

The exact model asset location is chosen in implementation planning after the packaging
benchmark. It must not be fetched from a mutable third-party URL at runtime.

## Spec parity and governance

This feature extends F30's source discovery but is a distinct user-facing capability. Track
it as **F39 — Bring Your Tabs (AI-assisted tab migration)** in platform contracts.

| Artifact | Required change |
|---|---|
| `spec/features.md` | Add **F39**; reconcile F36 import-step copy with the post-import and skip-path CTAs above |
| `spec/parity-matrix.md` | Row for F39 (desktop SHIPPED target; mobile PLANNED with D22 export-only sources) |
| `spec/acceptance/tab-migration.feature` | New Gherkin scenarios from the desktop test matrix below |
| `spec/acceptance/index.md` | Index row + scenario checklist for F39 |
| `spec/acceptance/README.md` | Feature coverage note (`F39`) |
| `copy/slash-commands.json` | `/bring-tabs` entry; run `npm run copy:build` |
| `src/renderer/overlay.js` + `src/renderer/pages/shortcuts.js` | Command dispatch hint (substrate-checked) |
| `security/network-data-inventory.json` | `pages:tab-import:*` IPC channels — local only, no network |
| `docs/superpowers/specs/2026-08-16-newtab-layouts-onboarding-design.md` | Amend import-step handoff per **First-run handoff** above |

**Divergence register:** no new `D#` required if v1 stays within D22 (explicit user action,
bounded profile/HTML reads, no live session parsing). On-device embedding was a **desktop
implementation target** for F39 but **did not ship in v1** after the packaging gate failed;
desktop v1 uses deterministic folder suggestions only. Mobile v1 uses the same folder path
until a separate mobile ML review lands.

**Substrate checks:** `npm run substrate:check` must pass after slash-command and settings
touchpoints change.

## Test matrix

### Pure/unit

- `readSource()` flat output is unchanged for F30; tree/subtree APIs return bounded folder
  counts and `folderPath[]` without altering full-profile import;
- immediate-subfolder Favorite assignment on apply matches F30, not migration-root stamping;
- apply ordering: tabs before Favorites; tab-batch failure leaves Favorites untouched;
- preview list order survives through `tabOrder` and focus target;
- source limits: bytes, nodes, depth, candidates;
- only HTTP(S) candidates survive;
- title/hostname/folder sanitization and length bounds;
- exact duplicate handling;
- deterministic fixed-fixture embeddings produce stable clusters;
- folder anchors, domain signals, low-confidence ungrouped behavior;
- stop-word and unsafe-token removal from group names;
- lowercase/length/collision rules;
- every selected candidate appears exactly once;
- unknown, duplicate, excluded, and missing candidate IDs reject the proposal;
- ticket ownership, TTL, cancellation, replacement generation, double-apply rejection;
- model failure selects deterministic fallback without mutation.

### Desktop acceptance

- F36 import-step CTAs (post-import and skip-path) and Favorites entry open the same utility
  sheet;
- onboarding skip-path reaches Bring Your Tabs without a prior full-profile import;
- wrong host, wrong frame, ordinary tab, stale sender, and other window are rejected;
- Chrome/Edge/Brave/Chromium/Vivaldi profile selection;
- HTML file import path;
- folder selection and candidate preview expose no full URL to ordinary pages;
- keyboard-only selection and group editing;
- cancel during embedding leaves no session/task;
- apply creates correct Favorites (immediate subfolder names), groups, group IDs, titles,
  and preview-order tab placement;
- tab-batch failure leaves Favorites unchanged; Favorites-only failure allows idempotent retry;
- renaming a review group to an existing window group name merges on apply;
- imported tabs are quiet and make no request until activated;
- only the focused imported tab wakes;
- exact re-import skips Favorite duplicates without dropping requested tabs;
- profile A cannot apply into profile B;
- private tabs are never created;
- a bound Named Workspace autosaves imported state;
- non-Patron completes migration; Patron-only workspace creation remains separately gated;
- restart restores imported tabs/groups through ordinary `session.json` behavior;
- model absent/corrupt produces the folder fallback;
- 500-candidate stress case meets broadcast, memory, and live-renderer budgets.

### Packaged/release

- exact model/runtime bytes are present and SHA-256 verified in macOS, Windows, and Linux
  packages when the semantic path ships; **v1 packages contain no model, ONNX, Transformers,
  or ORT WASM payload**;
- SBOM and third-party notices include the runtime and model license when bundled;
- macOS hardened runtime and library validation remain unchanged outside the existing
  1Password Plugin helper exception;
- no startup model load;
- offline packaged import succeeds;
- Windows and Linux native builds run the same organizer fixtures;
- update from the current public baseline preserves Favorites, tabs, groups, workspaces, and
  profiles without migration.

## Rollout

1. Land the pure candidate/session/organizer modules and fixtures. ✅
2. Land the dedicated trusted utility surface with deterministic folder suggestions. ✅
3. Land batch quiet-tab application and packaged acceptance. ✅ (desktop folder floor:
   eight Task 14 scenarios plus the runnable F39-15 500-candidate release gate)
4. Add the reviewed local embedding runtime behind the same organizer interface. **Deferred**
   — Task 15 packaging gate failed (30.04 MiB minimum payload > 30 MiB).
5. Compare fixed fixtures and real opt-in dogfood sets; adjust only versioned thresholds,
   never train on customer data. *(Pending step 4.)*
6. Enable the AI action once all three packaged platforms pass privacy, performance,
   licensing, and exact-payload gates. *(Deferred.)*
7. Update the #TabBarReset campaign only after the public release containing the feature is
   available on every advertised platform.

The deterministic fallback is part of the feature, not a temporary prototype. It keeps
migration usable if the model is unavailable and gives tests a stable behavioral floor.

## Future extensions requiring separate review

- Read another browser's live session/tab store.
- A Chrome/Edge/Firefox extension with **Send tabs to Blanc**.
- An ongoing **Organize this window** action.
- User-defined organization preferences or reusable group taxonomies.
- Learning from accepted/rejected suggestions.
- Cloud or hybrid inference.
- Syncing Named Workspaces across devices.

Each changes the privacy, persistence, permission, or recurring-cost model and must not be
smuggled into this implementation.

## Success criteria

The project is successful when a new user can:

1. bookmark surviving tabs in the old browser;
2. select that folder in Blanc;
3. receive useful, editable on-device group suggestions;
4. see exactly what will happen;
5. open the approved result without loading dozens of pages;
6. close any imported tab knowing the page remains in Favorites; and
7. optionally save the complete organized setup as a Named Workspace when entitled.

The feature must feel like migration assistance, not an autonomous agent. Blanc organizes
with the user, never behind them.

## Implementation record (desktop v1, reconciled 2026-08-23)

Reference branch: `codex/f39-task1`. Parity matrix marks desktop **SHIPPED**; iOS/Android
**PLANNED**.

### Shipped

- Utility sheet `blanc://tab-import/` — source picker, folder tree, candidate preview,
  folder-based review, explicit apply.
- Entry points — Favorites **Bring tabs…**; `/bring-tabs`; F36 onboarding
  **Bring a folder in as tabs…** / **Bring tabs without importing everything…**.
- Pure modules — `bookmark-tree`, `tab-import-session`, `tab-import-organizer`,
  `tab-import-apply`, `tab-import-batch` helpers; main `createQuietTabsBatch` and
  `applyTabImport`.
- Organize UI — **Use bookmark folders** only (`tabImportUseFolders` in
  `tab-import.html`).
- Post-apply — optional Patron Named Workspace handoff via overlay `postImportWorkspace`
  purpose (separate gesture; migration itself is free).

### Deferred (packaging gate)

- Sandboxed worker (`tab-import-worker.js`) and **Suggest groups on this device** UI.
- Bundled model/runtime bytes; `tab-import/embedding-ship-decision.json` records
  `shipOnDeviceEmbeddings: false`.
- Tasks 16–17 in the implementation plan.

Main still implements `pages:tab-import:suggest-embed` and
`pages:tab-import:submit-embeddings` plus pure `proposeFromEmbeddings` for a future enablement
pass; v1 renderers do not call them.

### Desktop acceptance (`@runnable`)

Automated floor: F39-1, F39-2, F39-4, F39-5, F39-8, F39-9, F39-11, F39-14, F39-15 —
nine scenarios. Task 14 supplied the first eight; F39-15 later added the 500-candidate
release gate. Remaining F39 scenarios stay in the feature file without `@runnable` until
bindings land; index cells are not overstated.

### Governance evidence (Task 18)

- Unit 1,079/1,079; desktop acceptance 125/125 scenarios, 755/755 steps;
  `npm run substrate:check` green.
- Signed unpacked macOS build: packaged first-run smoke passed; startup documents show zero
  model/runtime loads; `app.asar` contains no ONNX/Transformers/model/WASM payload.
- macOS signing posture unchanged (no new library-validation exception).

See also `docs/superpowers/specs/2026-08-23-tab-import-embedding-benchmark.md`.
