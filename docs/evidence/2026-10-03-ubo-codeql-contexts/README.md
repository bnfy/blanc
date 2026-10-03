# Preserved CodeQL probe evidence — October 3, 2026

These files support the [individual alert review](../../ublock-origin-codeql-dispositions-2026-10-03.md). They do not dismiss alerts or grant distribution clearance.

## Reproducible source-context probes

`context-results.json` was regenerated on October 3 from PR source at `0966d6e4` with:

```sh
node scripts/audit-ublock-codeql-contexts.cjs
```

The script verifies the immutable upstream file digests for all 39 baseline alerts and executes the probes for alerts 91–96 and 102–106. Some results intentionally demonstrate syntax-highlighting defects; `passed: true` means the observed result matches the documented review, not that every reported expression is correct.

## Preserved earlier native observations

`noscript.json`, `noscript-policy-before.json`, and `noscript-policy-after.json` preserve the earlier October 3 local Electron 44.5.1/macOS arm64 probe outputs. They were copied from the temporary logs cited in the alert review after inspecting their contents. They contain only fixture-relative paths, fixed test markers, policy booleans and the runtime version; no personal profile or browsing data is included.

These native probes were **not rerun when this evidence was committed**. Their original standalone fixture script was not retained, so the JSON files alone are historical observations, not a fully reproducible native test. No signature or independent attestation is claimed. The no-scripting results are specific to uBO's required CSP; they do not establish safety of arbitrary HTML reconstruction. Installed candidate testing remains pending.

The three-permission header defect also has a separate, durable [stock Brave reproduction](../2026-10-03-ubo-permissions-stock-brave/README.md), and the maintained desktop suite covers the adapted three-directive policy. Do not treat the historical native JSON as a replacement for those checks.


## Maintained native regression

The later `noscript-repeatable-macos-arm64.json` is a **fresh** run of the now
committed `test/desktop/ublock-noscript.mjs`, on official Electron 44.5.1 with
uBO 1.75.0 in an isolated development profile:

```sh
npm run test:ublock-noscript:desktop
# Headless Linux:
xvfb-run -a npm run test:ublock-noscript:desktop
```

It applies uBO's original no-scripting switch, verifies the hidden CSP equals
its required default, then visits a page whose original noscript content is
reconstructed by uBO. The fallback renders, while the original inline script,
inline error handler, JavaScript link, inserted script and executable meta
refresh do not execute. No payload marker requests reach the fixture server.
An active-HTML control first proves that the script, handler and link payloads
execute without that policy. Turning the switch off permits the original inline
script again. The page's sandbox/context-isolation/Node preferences are checked;
macOS also reports the native background sandboxed and without Node access.
Linux's actual process sandbox is independently checked by the main desktop
suite because Electron does not expose that metric there.

The first attempt passed the protection assertions but stopped in its diagnostic
code because native background pages return null WebPreferences. The corrected
probe checks the ordinary page's preferences and native background process
metrics separately. No production policy was changed. The corrected run passed.
This new regression runs on all four desktop CI targets. Its committed JSON
certifies only the local macOS arm64 development run; CI and installed candidate
results must be identified separately.
