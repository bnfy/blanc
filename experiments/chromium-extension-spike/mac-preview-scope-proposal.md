# Concrete side-by-side Mac preview proposal

October 22, 2026 — scope approved by the owner; see [decision record](mac-preview-scope-approval-20261022.md). No release authorization implied.

**Recommended first audience:** opt-in technical testers, Apple Silicon only, fresh preview profiles. Publish as **Blanc Chromium Preview**, explicitly separate from shipping Blanc. Propose macOS 26 only for the first preview; verify an actual clean supported Mac and deployment target before acceptance. Intel, older macOS, Windows and Linux follow later and remain outside this preview's claims.

## Product and isolation contract

- Proposed bundle ID: `me.bnfy.blanc.chromium.preview`; proposed profile root: `~/Library/Application Support/Blanc Chromium Preview`. Validate collision-free helper IDs, keychain/service namespaces, URL handlers and update identity before implementation acceptance. Never change shipping `me.bnfy.bowser`.
- Separate download and release channel; never register as default browser automatically. No copying, migration or forwarding of permanent Electron/Chromium profiles. Explicit opt-in default-browser choice only after isolation testing.
- Include core browsing, regular/private windows, Island, find, downloads, favorites/history, Store extensions/themes, Customize readability overlays, Spaces and persistent two-pane Split View **only after candidate smoke and security acceptance**.
- Exclude production profile migration, sync/account migration, native messaging integrations, full floating Glance parity, cross-window whole-split dragging, three/four-pane splits, DRM guarantees and performance superiority claims. Any exposed unsupported control must be removed/disabled before distribution; documentation alone does not qualify broken functionality.
- Blocking remains protected by the selected, accepted F12 implementation. No silent fallback or weakening to meet a date; engine selection awaits Decision 2.
- Recommend manual-only signed preview updates initially: a separate immutable download with version/digest, explicit replacement instructions and tested rollback using a disposable preview profile backup. Never downgrade a newer profile in place. Shipping updater cannot see preview releases. Manual updates require explicit owner approval, a security-notification/withdrawal policy and L9 rehearsal.

## Approval requested

Approve this narrow audience/platform/identity/feature contract and manual-only update policy for candidate preparation; nominate primary maintainer and backup/reviewer. This can resolve L1 after the decision is recorded. It does not waive Decision 2, Google upgrade, security, accessibility, packaging or final artifact acceptance. No public date is promised.

[Gate reconciliation](mac-preview-gate-reconciliation-20261022.md) supplies the remaining finite acceptance work. Latency stays deferred, no performance claims; Electron diagnostic build remains pending approval. Any change to the original Decision 2 latency requirement needs an explicit separate decision.
