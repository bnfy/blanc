# Blanc — project brief

A portable, tool-neutral primer on what Blanc is, for giving an AI assistant
(or a new collaborator) context in a chat that has no access to the codebase.
Distilled from `README.md`, `spec/`, and `CLAUDE.md`. Paste it into a chat, or
add it to a Claude Project's knowledge. It intentionally omits build commands,
git workflow, and release runbooks — for those, see `CLAUDE.md`.

## What it is

Blanc is a minimal **Electron desktop browser** (macOS, Windows, Linux;
currently v0.16). Its defining idea is **Island chrome**: instead of a tab strip
and a toolbar, a single floating pill sits top-center over the page — showing tab
dots, the current site, and a count of ads/trackers blocked. Click it (or press
`Cmd/Ctrl+L`) and it expands into a command bar: address input, slash commands,
and a quick switcher across open tabs, favorites, and history.

Ad/tracker blocking is wired in **at the network layer**, independent of Chrome's
extension store and Manifest V3's `declarativeNetRequest` rule caps. Around that
core sit favorites, history, downloads, settings, private tabs, tab groups,
per-site permission prompts, session restore, profile sync, and signed +
notarized auto-updating builds.

Positioning: a serious, privacy-respecting indie browser — small, sandboxed, and
opinionated, not a Chrome reskin.

## The load-bearing mental model

If you understand one thing about the architecture, make it this:

**One `BrowserWindow`, many `WebContentsView`s.**

- The window's own `webContents` renders the **chrome strip** — the slim (56px)
  band the resting pill floats in.
- **Each tab is a separate `WebContentsView`**, added as a child of the window's
  content view. Only the active tab's view is attached, so switching tabs is
  remove-one/add-another, not destroy-and-rebuild.
- The island's **expanded states** (command bar, `Cmd/Ctrl+L` palette, find
  capsule) live in *one more* transparent `WebContentsView`, attached on top only
  while open — which is how they float *over* the page instead of pushing content
  down.
- The **main process is the single source of truth** for tab state; both chrome
  documents just reflect `tabs:updated` broadcasts.

**Internal pages** (`blanc://newtab`, `bookmarks`, `history`, `downloads`,
`settings`) are served over a privileged custom scheme, so they get a real origin
and ordinary web content can never link into local files.

**Security posture:** the chrome, the overlay, and every tab run with
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Preload
bridges are deliberately asymmetric — rich API for Blanc's own chrome, a minimal
one exposed to `blanc://` pages only (re-checked on every navigation and
re-verified in the main process), and nothing for ordinary web content.

## Decisions & naming that trip up a context-free answer

These are the things an assistant *without* project context reliably gets wrong.
Respect them:

- **Bowser → Blanc rename (July 2026).** Former name was inseparable from
  Nintendo's Mario villain. The code, package identity, and assets are renamed,
  **but `build.appId` deliberately stays `me.bnfy.bowser`** — that preserves macOS
  Gatekeeper/notarization identity and the auto-update chain for existing installs.
  Don't "fix" that mismatch.
- **The "Bowser Design System"** is a *separate* design project the user maintains;
  it was **not** renamed with the app. Leave those references alone.
- **"Favorites" vs. `bookmarks`.** The user-facing feature is **Favorites** (heart
  icon). Every internal identifier stays `bookmarks` — `bookmarks.js`,
  `bookmarks.json`, `blanc://bookmarks/`, `pages:bookmarks:*` IPC. This split is
  intentional; don't reconcile it in either direction.
- **No Chrome extension support.** It was removed deliberately (it was the app's
  main source of hard crashes, forced the chrome to run unsandboxed, and carried a
  GPL licensing constraint). Its main use — password managers — can't integrate
  with any custom browser shell anyway (vendors verify the browser's code
  signature against an allowlist). Ad blocking replaced it at the network layer.
  **Don't propose re-adding an extension runtime.**
- **No mascot on the start page.** An earlier version had a pixel-art dog sprite;
  it was retired with the "Bowser" name in the rebrand. Don't reintroduce one
  unless asked.
- **Passwords/passkeys:** Blanc can create and use device-bound Touch ID passkeys
  in its own Secure Enclave keychain group. It does **not** read existing
  iCloud/third-party credential-manager passkeys (that needs an Apple entitlement
  still pending).

## Cross-platform parity (why `spec/` exists)

Native iOS (Swift) and Android (Kotlin) ports are planned; the scaffolding landed
July 2026 but **the mobile apps don't exist yet** — this Electron app is the
reference implementation. `spec/` is the platform-neutral source of truth:

- `spec/features.md` — every feature `F1`–`F24`, defined behaviourally.
- `spec/divergence-register.md` — every deliberate platform split `D1`–`D14`,
  with rationale.
- `spec/parity-matrix.md` — the feature × platform × status dashboard.

The governing rule: **parity means product/behaviour parity, not implementation
parity.** A divergence is *documented* (add a `D#`), never silently allowed. The
clearest example: ad blocking is programmatic on desktop/Android but declarative
(`WKContentRuleList`, with a rule cap) on iOS.

## Current state (v0.16, mid-2026)

- **Shipped:** desktop on all three platforms — macOS (signed + notarized),
  Windows (NSIS), Linux (AppImage), all auto-updating via GitHub Releases.
- **Monetization:** "Blanc Supporter" — a $19 one-time Polar.sh license unlocking
  three supporter-only Dock colorways. Perks are cosmetic; no DRM, works offline.
- **Privacy infra:** opt-in end-to-end-encrypted Profile Sync (Favorites +
  settings only) via a zero-knowledge Cloudflare Worker; opt-out launch telemetry
  (a single per-launch ping, no browsing data).
- **Planned / not built:** the iOS and Android apps, multi-window, inline address
  autocomplete.

## Where the canonical docs live

- `README.md` — the human-readable product + architecture overview.
- `spec/` — cross-platform source of truth (features, divergences, parity).
- `CLAUDE.md` — the deep desktop architecture narrative + rationale, plus build,
  packaging, signing/notarization, and release mechanics. (`AGENTS.md` is a
  near-identical copy for a different coding agent.)
- `docs/superpowers/specs/` — per-feature design docs.

When these overlap on *behaviour*, `spec/` is the cross-platform contract; where
`CLAUDE.md` describes desktop *mechanics*, it stays authoritative for desktop.
