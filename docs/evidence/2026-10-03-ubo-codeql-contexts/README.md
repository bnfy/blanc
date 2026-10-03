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
