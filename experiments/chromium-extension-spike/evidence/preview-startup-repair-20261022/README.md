# Preview startup crash repair — October22

Native FindEvent previously checked host URL and live frame only. Retained old package with deliberately missing UI assets reproducibly crashes in RenderFrameHostImpl::ExecuteJavaScript/CanExecuteJavaScript. Error documents retain unreachable host URL without WebUI bindings. Repair checks the actual primary frame, rejects error documents, requires exact committed host URL and ChildProcessSecurityPolicy WebUI bindings. No permission granted or Chromium security assertion bypassed.

## Verification

- Old binary missing-assets control reproduces fatal assertion (log retained).
- Repaired package with identical missing-assets scenario commits chrome-error://chromewebdata with unreachable chrome://blanc-prototype/host.html, remains alive and exits cleanly. This is error-path safety, not a working UI claim.
- Four healthy fresh profiles render packaged start page and return host tab state; all final schedules exit cleanly. Healthy Find fixture receives one match/ordinal1/final=true through actual native FindEvent. Test-only callback capture replaces host reporting function, not native behavior.
- Clean restart of profile-one-3 stalls before readiness. Sample is inside SessionRestoreImpl::Restore. This remains an actionable isolation blocker; no successful restart claim for repaired candidate.
- Earlier first-run shutdown deadline failure retained; sampled process was in AppKit event loop, so no deadlock cause asserted. Terminated only the owned disposable process. A retry collided with its closing port; fixture changed to unique ports and bounded HTTP waits. Not counted as product regression pass.
- Google baseline one New Tab and dev two New Tabs/selected second unchanged. No baseline/dev restart. Mock keychain used only for test profiles.
- Guarded incremental native build49.97s, sixsteps; final guardzero. Launcher path test, diff check pass. No GN/toolchain changes or Electron build. Bridge-only change; prior upstream58/137unchanged. Latency deferred.

Local artifact digest in artifact.json; ad-hoc signed only. Test installed copy removed after ZIP retention; profiles/logs retained for restart diagnosis. Full L2 remains open for restart stall, real keychain/service isolation and signed/quarantined acceptance. Diagnostic host reports macOS27.2; this is not macOS26 candidate qualification.1/12(8.3%) gates, delta0.

Next: diagnose the retained SessionRestore wait using the saved profile and stack before additional candidate signoff. Do not erase or weaken the restart gate.

Published Find fixture uses a static evaluation expression to read the active ID within the target, avoiding host-side interpolation. Runtime evidence above used the same active ID from the immediately preceding host snapshot; no separate runtime rerun for this fixture-only hardening.
