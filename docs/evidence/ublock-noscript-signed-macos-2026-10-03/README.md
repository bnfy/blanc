# Signed macOS uBO no-scripting evidence — October 3, 2026

This owner-local candidate was built from `43ae6748913442af8d5724a277a97291d8c2205f`
with official Electron 44.5.1 and uBO 1.75.0. It carries the internal validation
marker and retains development version 1.26.0. It is **not** the published 1.26.0
release, a release installer, or permission to enable a platform publicly.
The only uncommitted file at packaging time was the unpackaged probe script.

The normal Developer ID signing and notarization build succeeded. Its signing
hook verified the pinned certificate, embedded provisioning profile, entitlements
and library-validation boundary. Independent strict-deep signature verification,
Gatekeeper assessment and stapled-ticket validation passed; see `signing.json`.
The probe records the executable and ASAR SHA-256 values in each attempt.

## Result

`attempt3.json` passed against that signed, notarized app, using a fresh isolated
profile, real uBO filtering and the actual shield/popup scripting toggle. No main
process inspector, development test hooks or production bypass were used.

- Positive controls executed the original inline script, inserted script,
  external script, image error handler and JavaScript link.
- With scripting disabled, noscript content was reconstructed and visible;
  every tested execution marker stayed false. No script-execution marker or
  external-script request reached the fixture server. Node access was undefined.
- Chromium emitted an **enforced** CSP violation with policy
  `script-src http: https:` after the JavaScript link was clicked.
- Disabling the no-scripting switch again restored original inline execution.

DevTools returned no CSP header in this response. The evidence preserves that
null value and separately records Chromium's actual policy-enforcement event;
it does not manufacture a response header.

## Earlier harness attempts

`attempt1.json` stopped after the switch changed because the harness expected
Escape to close the popup. The final harness uses its actual Close button.
`attempt2.json` stopped at the missing DevTools response-header assertion. The
final harness waits for uBO's reload-required acknowledgement and verifies policy
enforcement through Chromium's violation event plus execution/network controls.
No production source changed between these attempts.

## Limits and reproduction

This is a signed **unpacked owner-local** app launched directly from the build
output. It does not establish installer behavior, owner installed-machine
acceptance, close-last-window/relaunch or updater handoff. Test cleanup terminates
the probe app and is not a user exit test. The meta-refresh payload has no
executing positive control. The probe covers the listed payloads only; it does
not prove arbitrary HTML reconstruction safe. Packaged process sandbox evidence
and Windows/Linux/Intel Mac acceptance remain separate work.

Run `npm run test:ublock-noscript:packaged` with:

- `BLANC_PACKAGED_EXECUTABLE`: the packaged executable (or installed app executable).
- `BLANC_PACKAGED_ASAR`: that executable's adjacent `Resources/app.asar` on macOS,
  or `resources/app.asar` on Windows/extracted Linux packages.
- `BLANC_UBLOCK_EVIDENCE`: a new JSON output path; existing files are never replaced.

The harness validates the executable/ASAR relationship and packaged uBO metadata.
Verify the candidate's signature and provenance separately. On Linux, direct
AppImage and desktop-menu sandbox acceptance are additional tests.

**Alert #77 remains open.** This evidence is available for the owner's review;
it does not apply a dismissal or substitute for the requested installed checks.
