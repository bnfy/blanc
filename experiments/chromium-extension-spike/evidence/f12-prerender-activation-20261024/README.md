# Signed prerender activation — October 24, 2026

**Open native fail-closed gap. L7 reopened; readiness 8/12 (66.7%), delta -1.** Candidate source `7c427328100d1ba76cb7e8b651a1f36d74ec86c6`, archive SHA256 `ffcfefdfbb5421619f3ba359bb4c5d92134b468ac8475c18eda12153a7f5e4ed`. This is newly demonstrated behavior in unchanged signed bytes, not a regression attributed to the dependency updates.

## Results

- Healthy default regular/private schedules load a same-origin HTTP target through actual speculation-rules prerendering. The server observes `Sec-Purpose: prefetch;prerender` and `document.prerendering=true`; after navigation the original document reports a nonzero activationStart, and the native tab URL updates. Eight bounded checks pass. These are functional observations, not latency measurements.
- In the final two loss schedules, the native tab snapshot verifies `private=false` and `private=true` respectively. After the server confirms prerender readiness, the source page arms a local navigation timer. The fixture terminates exactly one `blanc.mojom.Blocker` child of that disposable browser, then permits the already-armed navigation. **Both prerendered documents activate despite utility loss.** A fresh fetch in each active document fails. Each schedule has four passing controls and one failing activation assertion; overall process exit1 is intentional evidence of the unresolved failure.
- A source-page debugger suppresses prerender with `PrerenderingDisabledByDevTools`; the initial attempt is retained as fixture interference, not an application failure. The corrected schedule never attaches to the source page before activation. A later diagnostic looked for the private flag at the snapshot root instead of on the tab; that failed setup is retained separately and superseded by the final explicit mode checks. Earlier duplicate failures are not added to the final counts.

No feature-enabling flags, research hooks, modified assets, or injected libraries were used. Existing signed master bytes remained unchanged across all463file/symlink records. All nine task-created profiles were removed after exit; no permanent or Google profile was changed. No build, signing or latency benchmark ran.

## Cause and repair boundary

`NavigationResponseGate` rechecks HTTP(S) responses through a NavigationThrottle. Chromium's public contract explicitly excludes page activations from that path, including prerender and BFCache; see `chromium-activation-contract.txt`. The current browser-client commit-deferring-condition factory does not add a Blanc activation check. Healthy prerender is therefore reachable while activation can reuse an earlier allow after the engine is unavailable.

Next repair: add a navigation-owned activation commit condition, revalidate with the engine before activation, defer safely for asynchronous replies, and cancel on denial/disconnection/timeout without retaining a destroyed owner. Preserve ordinary healthy activation and privacy rules. Review BFCache applicability separately; this evidence does not prove its runtime behavior. Then use an incremental build and requalify the affected signed candidate. **No repair or replacement acceptance is claimed in this checkpoint.**

## Exact-head CI

`ci-150055d9.json` is a complete-paginated snapshot. Substrate and tab-handoff pass, confirming the undici/npm10 repair. Linux/Windows modified-link checks fail on the unchanged Electron storage assertion (`allowed` versus `SecurityError`); full provider logs are retained. Other jobs were pending at collection, so this is not all-green CI. Electron remains paused and its failures are not attributed to the native fork. L4/Decision2/L11/L12 remain open.
