# Blanc security assessment

Public desktop baseline: Blanc v1.25.0,
[`ff55d5948f5c71e802ba2ac464659ef96e055ca9`](https://github.com/bnfy/blanc/tree/v1.25.0).

Last source review: October 2, 2026. Implementation candidate and operational
observations are recorded in the [readiness continuation](security-reviews/2026-10-02-audit-readiness.md).
The [surface inventory](../security/audit-surface-inventory.json) pins its exact
implementation commit and hashes, preloads and literal IPC channels. Candidate
changes are unmerged and unreleased; desktop tags do not pin deployed Workers.

This is an internal threat model and readiness assessment, not an independent
security audit or proof of end-to-end exploitability. R1–R6 from the original
October 2 review remain stable identifiers. Source remediation, packaged tests,
production deployment and independent retesting are separate milestones.

## System actors and trust boundaries

- **The person using Blanc** chooses sites, permissions, private tabs, local
  profiles, sync, telemetry, 1Password fill, tab import, downloads, and
  application-link handoffs.
- **Untrusted web content** is intended to run in sandboxed `WebContentsView` renderers. It
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
| A malicious site escapes its renderer or reaches browser authority | Chromium sandboxing, Node integration disabled, context isolation, narrow preload bridges, sender/frame/session/host validation, hardened Electron fuses | Public Linux launchers can disable sandboxing when prerequisites fail (R1); candidate startup enforcement passed headless packaged tests; real desktop confirmation remains pending. Chromium and Electron vulnerabilities remain part of Blanc's attack surface until an updated Electron release is shipped. |
| A renderer abuses permissions, capture, popups, downloads, or native-app callbacks | Deny-by-default permission policy, per-origin decisions, trusted capture confirmation, popup inheritance, strict scheme/host allowlists, explicit callback confirmation, secret-redacted prompts | A user can still approve a deceptive request; Blanc does not currently provide a full Safe Browsing-style phishing and malware interstitial service. |
| Browsing, private-session, credential, or workspace data crosses a profile or persistence boundary | Separate persistent profile sessions, a separate in-memory private session, private-history and restore exclusions, owner-only atomic local files, OS credential wrapping, bounded quiet/closed-tab snapshots that never cross IPC or disk | Malware running with the user's account can read displayed data or exercise the user's authority. Crash and platform behavior can still expose data outside Blanc's controls. |
| An internal page or IPC call becomes a confused deputy | Per-host bridge allowlists and main-process checks for owned WebContents, session, surface, main frame, and expected payload shape | Main-process implementation defects can still defeat these checks; security-sensitive IPC changes require review and regression tests. |
| Profile Sync or the tab relay leaks or corrupts user data | Client-side AES-GCM profile payloads, context-bound tab-handoff envelopes, opaque identifiers, one-time claims and expiry for tab handoffs, size limits and rate limits | Profile Sync uses possession of a passphrase-derived account identifier as its storage capability; possession permits retrieval, replacement and deletion without a separate credential (R3). Weak passphrases, endpoint compromise and non-atomic KV write/deletion races remain open (R5). Candidate v1 byte limits do not close these risks. |
| Telemetry, newsletter, or site services collect more data than promised or are abused | First-run choice before telemetry sends, strict payload allowlists, HMAC pseudonyms, retention bounds, consent confirmation, origin checks, rate and size limits, data-flow drift tests | Cloudflare, Resend, and any configured analytics processor remain external processors; service configuration and privileged accounts require operational control. |
| A dependency or generated asset is substituted or becomes vulnerable | Committed npm lockfiles, hash-pinned filter inputs, license/SBOM generation, Dependabot update proposals, production dependency audit, CodeQL, commit-pinned Actions, packaged-payload checks | Automated findings require human triage. No scanner proves the absence of vulnerabilities, and upstream security fixes still require a new Blanc release. |
| A release asset or update is replaced | Protected `main`, procedural prohibition on replacing released versions, native build gates, macOS signing/notarization, Windows timestamped Authenticode, Sigstore-authenticated complete `SHA256SUMS`, SBOM, provenance, and fresh public verification | Public Windows verification execution/parsing failures and cached installers can bypass the publisher check (R2); the candidate rejects those paths, pending staged native handoff. Linux manual downloads depend on explicit authenticated-manifest verification; the automatic updater does not independently verify that Sigstore manifest. GitHub release API immutability was false when inspected. The release and infrastructure authority is concentrated in one maintainer. |

## Assessment evidence and review triggers

The detailed [August 12 audit](../security_privacy_audit_2026-08-12.md) records
17 findings, their remediation, validation, and remaining limits. The
[v1.25.0 release record](release-incidents/2026-10-01-v1.25.0.md) preserves
release-specific signatures, manifests, platform checks and updater evidence.
Those controls did not detect the R1/R2 source failure paths. The continuation
records new synthetic tests and inspected candidate CI separately from public
release evidence. The [node-forge reachability review](security-reviews/2026-10-02-node-forge.md)
is a scoped development-tool VEX decision, not an upstream advisory fix.

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
