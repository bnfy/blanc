# Blanc security assessment

Assessment baseline: public Blanc v1.17.0, source tag
[`c57eeb89`](https://github.com/bnfy/blanc/tree/v1.17.0)

Last reviewed: September 13, 2026

This threat model and attack-surface assessment covers the released Electron
desktop application, the public website, and the Cloudflare Workers maintained
in the same repository. It
updates the August 12 remediation audit for v1.17.0's live Named Workspace
state, reviewed desktop-application sign-in returns, and focused-popup
1Password integration. It identifies likely high-impact failures and the
controls that reduce them; it is a maintainer assessment, not an independent
penetration test or external audit.

## System actors and trust boundaries

- **The person using Blanc** chooses sites, permissions, private tabs, local
  profiles, sync, telemetry, 1Password fill, tab import, downloads, and
  application-link handoffs.
- **Untrusted web content** runs in sandboxed `WebContentsView` renderers. It
  may navigate, request web permissions, download files, open popups, and
  invoke ordinary web-platform APIs. It must not reach Node.js, Blanc's
  privileged IPC, local profile data, or another profile's session.
- **Blanc-owned chrome and internal pages** render the Island, settings,
  history, downloads, Favorites, and other local surfaces. Preload bridges
  expose narrow operations; the main process rechecks the sender, frame,
  session, surface, and `blanc://` host before acting.
- **The Electron main process and Chromium browser process** own windows,
  tabs, permissions, networking, persistence, updates, and the boundary to the
  operating system. A compromise here has the user's Blanc authority.
- **The operating system and local integrations** provide code-signature and
  notarization enforcement, credential wrapping, protocol handling, file
  pickers, capture UI, and the user-invoked 1Password desktop connection.
- **Blanc-operated services** provide encrypted Profile Sync storage, the
  encrypted one-time tab relay, bounded usage measurement, newsletter consent,
  and static site delivery. Their documented HTTP interfaces are linked below.
- **Release services and maintainers** include GitHub Actions and Releases,
  Apple notarization, Windows signing, Sigstore, Cloudflare, and the sole human
  maintainer. Compromise of these systems can affect source, distribution, or
  service operation.

The primary trust transitions are web renderer to preload, preload to main IPC,
main process to the operating system, local client to Blanc Workers, and build
source to signed public artifacts. The security controls concentrate on those
transitions rather than trusting data because it originated inside the app.

## Released external interfaces

- The desktop app accepts operating-system `http:` and `https:` launches and
  the narrowly validated `blanc-import:` one-time tab-handoff protocol. Blanc's
  internal `blanc://` pages are user-facing local origins and do not accept
  arbitrary file paths. The desktop has no supported command-line API.
- The app consumes the GitHub Releases updater feed, selected search-provider
  suggestion endpoints, the Profile Sync API, the tab-import relay, and the
  optional usage endpoints. Every app-initiated recipient, payload, retention
  rule, default, and owning code path is recorded in the machine-checked
  [network data-flow inventory](../security/network-data-inventory.json).
- The [Profile Sync Worker](../cloudflare/sync-worker/README.md) documents its
  versioned encrypted-blob GET, PUT, and DELETE routes and their request and
  response shapes.
- The [tab-import Worker](../cloudflare/tab-import-worker/README.md) documents
  its MCP endpoint plus the encrypted stage-and-claim routes. The Firefox,
  Safari, ChatGPT, and Codex entry points are described in the
  [companion documentation](../extensions/blanc-tab-import/README.md) and
  [plugin documentation](../plugins/blanc-tab-import/README.md).
- The [usage Worker](../cloudflare/ping-worker/README.md) documents `/ping`,
  `/event`, and the authenticated aggregate `/stats` route, including exact
  accepted fields and retention. The
  [newsletter Worker](../cloudflare/newsletter-worker/README.md) documents
  subscribe, confirm, unsubscribe, ambassador, export, and deletion routes.
- Public release assets, checksums, signatures, SBOMs, and provenance are
  documented in [release verification](release-verification.md). Contributor
  build and validation interfaces are documented in
  [CONTRIBUTING.md](../CONTRIBUTING.md).

## Threats, controls, and residual risk

| Threat or failure | Primary controls | Residual risk |
| --- | --- | --- |
| A malicious site escapes its renderer or reaches browser authority | Chromium sandboxing, Node integration disabled, context isolation, narrow preload bridges, sender/frame/session/host validation, hardened Electron fuses | Chromium and Electron vulnerabilities remain part of Blanc's attack surface until an updated Electron release is shipped. |
| A renderer abuses permissions, capture, popups, downloads, or native-app callbacks | Deny-by-default permission policy, per-origin decisions, trusted capture confirmation, popup inheritance, strict scheme/host allowlists, explicit callback confirmation, secret-redacted prompts | A user can still approve a deceptive request; Blanc does not currently provide a full Safe Browsing-style phishing and malware interstitial service. |
| Browsing, private-session, credential, or workspace data crosses a profile or persistence boundary | Separate persistent profile sessions, a separate in-memory private session, private-history and restore exclusions, owner-only atomic local files, OS credential wrapping, bounded quiet/closed-tab snapshots that never cross IPC or disk | Malware running with the user's account can read displayed data or exercise the user's authority. Crash and platform behavior can still expose data outside Blanc's controls. |
| An internal page or IPC call becomes a confused deputy | Per-host bridge allowlists and main-process checks for owned WebContents, session, surface, main frame, and expected payload shape | Main-process implementation defects can still defeat these checks; security-sensitive IPC changes require review and regression tests. |
| Profile Sync or the tab relay leaks or corrupts user data | Client-side AES-GCM, ciphertext-only storage, authenticated envelope metadata, opaque identifiers, one-time claims and expiry for tab handoffs, size limits and rate limits | Profile Sync uses possession of a passphrase-derived account identifier as its storage capability; weak passphrases and endpoint compromise remain risks even though the service cannot decrypt valid blobs. |
| Telemetry, newsletter, or site services collect more data than promised or are abused | First-run choice before telemetry sends, strict payload allowlists, HMAC pseudonyms, retention bounds, consent confirmation, origin checks, rate and size limits, data-flow drift tests | Cloudflare, Resend, and any configured analytics processor remain external processors; service configuration and privileged accounts require operational control. |
| A dependency or generated asset is substituted or becomes vulnerable | Committed npm lockfiles, hash-pinned filter inputs, license/SBOM generation, Dependabot update proposals, production dependency audit, CodeQL, commit-pinned Actions, packaged-payload checks | Automated findings require human triage. No scanner proves the absence of vulnerabilities, and upstream security fixes still require a new Blanc release. |
| A release asset or update is replaced | Protected `main`, immutable version tags/releases, native build gates, macOS signing/notarization, Windows timestamped Authenticode, Sigstore-authenticated complete `SHA256SUMS`, SBOM, provenance, and fresh public verification | Linux lacks a platform-native publisher signature and depends on the authenticated manifest. The release and infrastructure authority is concentrated in one maintainer. |

## Assessment evidence and review triggers

The detailed [August 12 audit](../security_privacy_audit_2026-08-12.md) records
17 findings, their remediation, validation, and remaining limits. The
[v1.17.0 release report](release-incidents/2026-09-13-v1.17.0.md) records the
release-specific auth and workspace review, 1,798 unit tests, 152 desktop
scenarios, CodeQL, dependency audit, native platform checks, signed-manifest
verification, exact-tag smoke, and adjacent macOS and Windows updater handoffs.

GitHub code scanning can retain findings in test, development, or runtime code
until they are fixed or explicitly triaged. A green CodeQL workflow means the
analysis completed; it does not mean the alert list is empty. Open findings are
review inputs and must not be represented as proof that released code is free
of vulnerabilities.

Review and update this threat model for every new or breaking feature and for
every release that changes a trust boundary,
external interface, permission, authentication flow, credential integration,
network recipient, persistent data class, updater, signing path, or privileged
CI job. Review it at least annually even if none of those triggers occurs.
