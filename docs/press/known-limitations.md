# Blanc 1.0 press-build limitations

Last updated: August 12, 2026

These are product boundaries, not buried footnotes. Reviewers should evaluate
the release candidate with them in view.

## Release-candidate availability

- The `v1.0.0-rc.2` press build is for **Apple Silicon Macs only**.
- Intel macOS, Windows, Linux, iPhone, iPad, and Android will not be included
  in this candidate.
- A platform will not be added to the launch claim merely because a package can
  be produced. Its exact package must pass applicable signing and notarization
  requirements plus native clean-install, launch, and same-profile migration
  checks first.

## Browser scope

- Blanc has **no extension support**. The previous extension runtime was
  deliberately removed after it caused native Chromium crashes and could not
  make allowlisted password-manager integrations work in a custom browser
  shell.
- Blanc does not import passwords and cannot read passkeys stored by iCloud or
  third-party password managers. Signed macOS builds can create and use Blanc's
  own device-bound Touch ID passkeys.
- The historical v1.0 press build is single-window and has no named local
  profiles. The current development tree adds independent windows and local
  profiles; those capabilities are not retroactive claims about the press
  candidate documented here.
- There is no mobile app in this release.
- The typed-address classifier is intentionally lightweight and can
  misclassify unusual dotted search text as a domain.

## Address-bar menu and page source (new in rc.2)

- The address field's context menu is **pointer-invoked on macOS**. Copy Clean
  Link and Paste and Go have no keyboard-only path on the shipped platform;
  the menu handles keyboard invocation where the OS sends it, and macOS has no
  Shift-F10 or menu-key convention to send.
- **Copy Clean Link is a curated remover, not a general one.** It strips the
  `utm_` prefix family plus a short, explicit list of click identifiers
  (`fbclid`, `gclid`, `dclid`, `gbraid`, `wbraid`, `msclkid`, `ttclid`,
  `twclid`, `igshid`, `yclid`, `mc_eid`, `_openstat`, `vero_id`, `s_cid`).
  Generic or site-specific tracking parameters are left alone on purpose:
  over-stripping silently breaks links, which is worse than leaving one
  parameter behind, and domain-scoped rules are machinery this release does
  not carry. It offers no protection against tracking that does not live in a
  query parameter.
- Copy Clean Link acts only on http(s) URLs; the item is disabled otherwise.
  Surviving parameters keep their original order and encoding byte-for-byte,
  so signed URLs are not corrupted.
- **View Page Source is http(s) only.** It will not open a source view for
  local files or for Blanc's own `blanc://` internal pages. That restriction
  is a boundary, not an oversight.

## Privacy and network behavior

- Blanc does not claim zero telemetry. Optional usage measurement is presented on
  during fresh-profile setup, cannot send before that choice is saved, and can
  be turned off before continuing or later in Settings. It contains only the
  launch and fixed feature fields in the privacy policy and fact sheet; private
  tabs never send feature-use events.
- Search suggestions are presented on during fresh-profile setup. If left on,
  eligible typed prefixes may be sent to the selected search provider.
- Update metadata, optional sync, supporter activation, favicon capture, and
  enabled suggestions/telemetry can require app-initiated network requests.
- Ad and tracker blocking is best effort. It cannot promise to block every ad,
  tracker, cookie prompt, or fingerprinting technique.
- Blanc compiles a bundled, hash-verified blocking snapshot; it does not fetch
  changing filter resources at first launch. A compilation failure presents
  Retry and an explicit option to continue without blocking.

## Private tabs

- Private tabs share one non-persistent private session with one another during
  the current app run. They are isolated from normal tabs, not from other
  simultaneously open private tabs.
- Downloads still work from private tabs and leave user-requested files on
  disk. Their Blanc download metadata is memory-only and disappears at quit. Existing Favorites may be
  opened there, but Blanc does not add Favorites from private browsing.
- A passkey created from a private tab is usable only for that app run; the
  private session's sealing material is intentionally not persisted.

## Sync

- Profile Sync is optional and server-blind. The retained derived key is wrapped
  by the operating system credential service; on Linux, setup fails if only an
  insecure plaintext fallback is available. This is not protection against
  malware already running with the user's full privileges.
- History, downloads, cookies/site storage, permissions, supporter status,
  app-icon, search-suggestion, usage-ping, tab-layout, encrypted-DNS, and
  WebRTC choices are not synced.
- Open-tab sharing is an off-by-default, read-only per-device snapshot, not a
  live merged session; its optional bounded favicon sidecar is encrypted
  separately.
