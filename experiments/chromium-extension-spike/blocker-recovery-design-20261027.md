> Current outcome October28: baseline and UI native acceptance complete; finalguard0. See [affected evidence](evidence/blocker-recovery-ui-20261027/README.md). Earlier pending/draft entries below are historical. Signed qualification remains pending; no gate credit.

> Draft lifecycle review: Quit is posted to the next UI task so owner teardown cannot destroy the delegate inline. Automatic dialog request is one-shot; failure leaves a manual button rather than retrying every snapshot. Syntax/diff checks pass; native/runtime validation still pending.

> Implementation draft now exists in the repository: read-only health API, trusted snapshot/action, native Quit/Keep-open dialog, and Island status button. JavaScript syntax and diff checks pass. It has NOT been copied into the active native build, compiled, runtime-tested or signed.

# Production blocker recovery design — October 27

Implementation prerequisite: restore the 157.0.8103.15 native source/output or explicitly authorize replacement build work. Published source is recovered at e3724d72; no native change is applied or qualified by this design. The previous temporary production-recovery report is missing; it remains a historical chat observation, not a recovered test pass.

## Initial recovery behavior

Expose browser-owned engine health: not-started, initializing, ready, unavailable. Health reads must not start the engine or reset failure. Publish only the enum through the trusted Island snapshot, without request URLs, profile data, diagnostic paths or raw service errors. The current engine singleton is process-wide, so every affected window must report the same state.

On unavailable, show a native, keyboard-accessible recovery dialog: “Blocking is unavailable. Requests are blocked to protect your browsing. Quit and reopen Blanc to restore blocking.” Offer “Quit Blanc” and “Keep open”; neither choice enables network requests. Use the existing normal quit path so beforeunload cancellation, session saves and existing restore behavior remain intact. After a veto, keep the unavailable status visible and allow another explicit quit attempt. Do not promise all tabs are saved merely because quit was requested. Do not terminate the process directly or relaunch before confirmed shutdown.

Why restart first: Engine::Fail is terminal and existing initialization/decision callbacks bind the singleton through Unretained. Clearing failed_ while old callbacks exist can let stale startup/disconnect completions poison a new generation. A live “Retry” button therefore requires a separately reviewed generation-owned Engine session, draining old callbacks and refusing stale replies; it must not be implemented by resetting two booleans. The process-restart recovery action preserves the current fail-closed contract without introducing that race.

## Integration points

- native/blocker/blocker_proxy.h and .cc: read-only health API, no restart/reset shortcut.
- native/blanc_prototype_ui.cc: trusted Island-only snapshot health and normal quit dispatch; coalesce dialog display per window/failure state, invalidate callbacks when owner/window dies. Use the existing native dialog and quit infrastructure.
- prototype/host.js, host.html and host.css: persistent unavailable status with readable opaque styling and keyboard action. Do not rely on a generic console warning or a banner outside the Island's actual input/visibility bounds.

## Affected verification only

One regular and one private signed fixture: healthy control; kill only the identified fixture blocker utility; verify requests refuse without server arrival; visible recovery state and accessible dialog/action; cancel keeps protection; beforeunload quit veto retains warning; normal quit/reopen with the fault absent returns healthy blocking. Bind the exact artifact. Retain the first failed attempt and clean only exited owned fixtures. No replay-corpus, sockets, distribution walkthrough, Electron or latency repeat.

Before implementation, verify whether the existing native failure dialog can be reused and whether the status surface participates in the native Island hit-test geometry. A DOM element alone is insufficient evidence of usability. No gate closure, engine selection or public-release approval is implied.

October28 03:30 UTC: first UI incremental failed after46.24s at blanc_prototype_ui.cc: incomplete SingleThreadTaskRunner type. Original log retained. Added explicit base/task/single_thread_task_runner.h include in repo and native copy; cached resume normal dryplan7actions, exec17941, records/20261027/blocker-ui-incremental-resume1.log. No toolchain/cache reset. Affected runtime checks still pending.

October28 03:35 UTC: recovery UI cached resume succeeded11steps/55.03s; normal postbuild check0actions. First failure preserved and fixed by explicit TaskRunner include. All source/cache/rawlogs durable. Next author affected regular/private utility-loss UI/quit-veto fixture against this native output; runtime and signed acceptance pending, no gate credit.
