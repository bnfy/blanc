> October23 L11 harness maintenance: affected fixture sources now pass values as CDP protocol arguments, render request-derived text without HTML interpolation, and compare parsed URL origins/hosts. Original runtime observations retain their dates and candidate identities; those suites were not rerun by this source-only maintenance. See [L11 repair record](../l11-repair-20261023/README.md).

# L7 distribution and private-diagnostic repair — October 23, 2026

**Both findings from the [L7 review](../l7-security-review-20261023/README.md) are repaired and the replacement signed candidate passes the targeted security checks.** Technical L7 review has no remaining finding from this scope. The checklist still requires owner security/privacy acceptance; no public release or Decision 2 approval is inferred.

Source: `09985c160803f3432f0d2b40a21caa13e249e53c`. Chromium `157.0.8103.15`, upstream `1aa07b638799e59656559ae6c6649d4b197f555e`. New signed ZIP SHA-256: **`4c86c89e7ec81791ef8bedf525187b302c313f913a5e5b07a26d4d2a45b9ef00`**. Apple accepted submission **`1818186c-4b95-4571-b822-397bf8705161`**; stapling, ticket validation, strict deep signature and Gatekeeper pass. Identity remains Anthony Loria / XYGUCY4498. Tests run on macOS 27.2 with isolated fresh profiles and the preview-specific real keychain namespace.

## Repairs

- **L7-S1:** preparation defaults to a generated `BLANC_RESEARCH_HOOKS=0` header, without GN/toolchain changes. The default native compilation excludes the component admission/loading override, uBO reload/control path, document-start binder and renderer gate, diagnostic renderer-token mutation, and blocker/worker diagnostic writers. The normal HTTP, WebSocket, WebTransport and navigation-response enforcement paths remain enabled. An explicitly selected research configuration is retained for separate source/output workspaces and cannot pass the distribution packager.
- The packaged launcher rejects caller-supplied `--blanc-*` arguments before exec. The packager independently scans the browser executable and framework and refuses the custom research-switch markers. It correctly refuses the previous signed `f177e0b5` candidate. This guard does not rely on the caller respecting the launcher: tests invoke the bundled native executable directly with obsolete probe arguments and verify normal enforcement with no diagnostics.
- **L7-S2:** the research worker-update path refuses private contexts both before wrapping the loader and before generating a token, looking at the URL, serializing or writing a record. A test compiles the actual logger function with instrumented dependencies: private performs zero lookups/token generation/serialization/writes, disabled regular logging does nothing, enabled regular logging still produces a record. The distributed candidate excludes that writer entirely; real private service-worker updates produce no output even when the old flags are passed directly to the native binary.

## Build and candidate proof

One guarded incremental build: initial dry run nine actions, completion **43.44 seconds / 15 steps**, zero compiler failures. Final guard: **zero actions**. Source/output, build arguments, compiler and SDK remain unchanged except the intended source/header edits. Original .6 source HEAD and all five saved source/output fingerprints remain unchanged.

Authoritative inventory: **62 modified upstream files / 162 zero-context hunks**, plus copied/generated Blanc modules excluded by the existing inventory policy. The new build-policy header is a copied/generated module. The counter ceiling is updated to 62/162 under the standing owner instruction to record increases without asking; dependency verification and counting rules are unchanged. An early ad-hoc count missed the two binary files; it is superseded by `inventory-final.json`, not used as the final total.

All 17 Mach-O hashes and selected assets match before/after notarization and runtime tests; all ten bundle IDs are preview-specific. No get-task-allow or disable-library-validation entitlement. Default launch has no mock keychain, injected dylib, disabled sandbox, custom diagnostic flag or browser listening TCP socket. Generic Chromium developer command-line functionality is not represented as compiled-out; the custom Blanc research hooks are the removed surface.

## Targeted signed runtime results

**80 checks pass** across these bounded schedules:

| Schedule | Checks | Result |
| --- | ---: | --- |
| Regular security | 17 | Trusted Types/static icons, untrusted bridge/iframe/file/internal fetch boundaries and no distribution diagnostic records |
| Private security | 16 | Same boundaries and private metadata exclusion |
| Native API scope | 19 | Unsupported schemes/methods, current-owner tab IDs, cross-window close refusal, direct-host/start-page privilege separation, asset allowlist and ungranted camera/microphone/location permissions |
| Launcher and direct-native obsolete flags | 19 | Five launcher refusals; regular/private HTTP and WebSocket allow/block controls survive direct-native probe flags; blocked hosts never arrive; real worker updates produce no worker/blocker logs; clean exits |
| HTTP/3 WebTransport | 9 | Eight regular/private baseline/enforced controls plus no server errors. Six real CONNECT/ALPN-h3/datagram echo successes; two enforced rejections with no server arrivals, including obsolete uBO probe flag |

The HTTP/3 fixture uses the retained pinned aioquic environment, temporary EC certificate and per-connection certificate hash. It binds only loopback, uses explicit fixture-host mappings and does not alter system trust. Its private key is removed. Baseline runs omit the blocker only in disposable test processes to prove both fixture endpoints are functional; the packaged launcher always enables the authenticated blocker.

The private security profile has zero fixture-URL file matches, zero History rows and zero custom Blanc files after exit; the regular positive control has one History row and seven matching file locations. These are bounded marker tests, complemented by the earlier source/data map; they do not claim forensic absence of all private bytes from OS traces. Default-launch and signature audits are separate from the 80 count. **37 source checks** also pass: two research-policy/logger checks, nine packaging/metadata checks, 15 build-guard/Trusted Types checks and 11 inventory checks. Scoped lint and diff checks pass.

## Limits, failures and next step

The first source preparation hit sandbox-only icon-service access refusal, and the first blocker preparation pointed at a signed asset directory without the generated `bundle_hash.h`. Both stopped before compilation. Preparation succeeded with the permitted tool access and the existing authenticated engine/header. No native compiler or runtime security test failed. An initial unittest discovery command selected zero inventory tests; the direct test runner then ran all 11. Failure excerpts and the empty discovery run are retained and are not counted as passing tests.

No research-mode Chromium build was started. Its actual logger body was unit-tested; its larger protocol matrix remains existing research evidence. The new signed runtime proves the distribution exclusion and normal enforcement. No new claim of arbitrary crash/power-loss recovery, full extension/platform parity or complete upstream vulnerability review is made. Earlier owner L2/L9 records remain tied to their stated artifacts and are not silently rewritten as fresh physical acceptance of this one.

All ten disposable profiles, temporary certificate key and remote signing staging/job were removed after verification. The new master app/ZIP and receipts remain at `/private/tmp/blanc-l7-repair`. The prior candidate, original source/output, permanent profiles, dev instance and separate Google baseline were preserved. The retained authorized SSH key remains available per owner preference; no signing identity was exported. Latency remains deferred and the Electron diagnostic build pending/unstarted.

**Next:** owner L7 security/privacy acceptance for the exact replacement candidate and this report. Until then the progress bar stays **3/12 (25%), delta 0**. There is no remaining L7-S1/S2 technical repair request; do not repeat an open-ended stress matrix to substitute for acceptance.
