# Chromium property-rule grouping repair

October 28, 2026. **Native repair and affected signed qualification verified. F12 and L12 remain open.**

## Reference comparison audit

The retained paired pinned outcomes contain zero failed Chromium assertions. The diagnostic comparison contains zero native failures and44 reference differences. `reference-scope.json` derives those counts directly from the existing records without replay. The authenticated Electron reference disables extended selectors and misses some first-inline scriptlets. This repair does not change Electron, suppress the native protections, or reclassify those differences as parity passes.

## New Chromium defect and repair

Source review found that the property predicate implementation inspected only top-level CSS style rules. A new isolated-world probe of the exact production renderer bundle `1eaa47ff71302f3eff0b56f9d9e2d4a702ff6c565dc655e0dc2dd7fe40f829ee` failed all three active grouping cases: media, supports and cascade layer (`baseline.json`). Neutral content and marker cleanup passed. These are new property-delivery cases, not repeated acceptance suites or claimed reference regressions.

The renderer now visits style rules within matching `@media`, supported `@supports`, and cascade-layer groups, including nested combinations. It retains the same-origin stylesheet boundary. It does not flatten container/scope rules or nested selectors into document-wide queries, which would lose their matching context. This is not complete support for every CSS grouping or import form.

The repaired authenticated renderer bundle is `03c7e11627648bc85ac33e949906796ee0916036a302bb3876b0e43be1a75b4f`; the engine remains `6f5947ad20511daf0defd7ee1d01981b01af200f709ccc746b48a7df6855d797`. All six focused evaluator cases pass: four active/nested cases and two inactive-condition controls, each with neutral-content, temporary-marker cleanup and reveal-after-removal checks. Original failed results are retained.

## Affected production verification

The same durable workspace and unchanged compiler/SDK/build arguments were used. Guarded preflight scheduled one action; incremental build used eight workers and completed seven steps in39.95seconds. Final normal guard reports zero actions. Inventory remains79upstream files/189hunks within the approved ceiling. Full logs and combined manifest are retained here; no cold output or cache deletion.

`property-groups-production.mjs` exercises the actual pinned `gamepadla.com` parent/property rule through the native broker and renderer. Regular and private each pass26checks: ready health/request, four active/nested grouping outcomes, two inactive conditions, neutral and foreign-sheet exclusion, and reveal after removing each grouped rule. Both browser processes exit0. This is52affected production assertions; no existing direct/subframe/distribution/timing suite was repeated.

Reproduction fixtures are `../../fixtures/replay/synthetic/property-groups.mjs` and `property-groups-production.mjs`. Raw process logs and owned fixture profiles remain in the durable task evidence directory; no permanent profile or Google baseline was used. No third-party implementation code was imported.

The previously signed source4a77b414/archive270c0848539f remains untouched and does **not** contain this repair. Replacement source `73217ee50b6f2e4eaa8eb8b27f75df8c2cff9bd2` is now signed and notarized; see below. The original reference-parity differences, idle-host timing and measured operating inputs remain unresolved; no waiver or gate credit is requested.

## Signed replacement qualification

Apple accepted submission `76253399-8a8f-4e06-8ef6-0ffea5422977`. The declared `Blanc Preview Launcher` passed all 26 regular and 26 private affected assertions; both browser exits were zero. Stapling, ticket validation, strict deep signature verification and Gatekeeper passed. All 458 frozen tested files remain unchanged; stapling added `Contents/CodeResources`.

Archive: `Blanc-Chromium-Preview-157.0.8103.15-73217ee5-arm64.zip`, SHA-256 `c788b98acc46637fedcfe69c72159561471d569e12f3a8191a7b5c2b5182adfd`. The final report and raw validation log bind this archive to the signed source. Fresh checksum-manifest authentication is still outstanding; the older archive's Sigstore signature does not authenticate this replacement.

Failed diagnostic attempts are retained in `harness-failed-attempts.json` and the durable raw directories it identifies. Initial runs incorrectly launched the internal Chromium executable, bypassing Preview initialization. Another diagnostic attempt observed health before readiness. Neither establishes a product regression. The fixture now checks CFBundleExecutable before launching, retains failure diagnostics, and uses the original readiness-before-health ordering. No assertion or protection was relaxed. The final 52 checks were not repeated after success.

This closes the newly found grouped-property defect only. Literal reference outcome differences, the original idle-host timing requirement and measured rebase/cost inputs remain unresolved. L12 stays NO-GO; Electron remains paused and the Google baseline separate.
