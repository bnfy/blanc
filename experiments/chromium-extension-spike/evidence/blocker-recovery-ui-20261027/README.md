# Blocker recovery UI native acceptance

The durable Chromium 157.0.8103.15 recovery baseline completed 57,677 steps in 3h5m34.66s; normal post-build guard reported zero actions. The UI incremental initially failed on a missing TaskRunner header (original log retained), then completed 11 cached steps in55.03s with final guard0.

The browser exposes read-only process-wide blocker health through the trusted Island snapshot. Utility failure displays a native warning and persistent recovery button; Quit uses the ordinary beforeunload/session shutdown path. Health observation does not start/reset the engine. No unsafe in-process singleton reset was added.

Regular and private affected protocol schedules each pass six controls: healthy fixture load, ready engine, exact parent/subtype-owned utility identification, unavailable health after its loss, fresh request refusal with zero server arrivals, and visible labelled recovery button. Private and regular native input observations establish recovery controls, keyboard activation, normal quit-veto/cancellation, retained page/status, continued request refusal, and actual normal exit. Same-profile regular/private restart controls each pass healthy fixture load and ready engine. This is recovery health evidence, not a complete filter-corpus replay.

Initial fixture failures are retained: premature title assertion; missing async expression wrapper; status inspected before refresh; restart read stale DevTools endpoint. Corrected fixture waits for exact readiness, asynchronous UI visibility and fresh endpoint content. No product behavior was weakened to pass them. Native observation details and source hashes are adjacent. Raw launch logs/profiles/build output remain in durable Projects/BlancChromium157Recovery/records/20261027. No permanent profile, Google baseline, Electron or latency changes.

**Unsigned native-output acceptance only. Signing/notarization and affected final-artifact checks remain pending. No F12/Decision2 aggregate or launch-gate approval, commit/push, merge or release.**
