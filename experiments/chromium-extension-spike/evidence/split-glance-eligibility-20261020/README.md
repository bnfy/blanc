# Split View / Glance eligibility and Spaces roundtrip

PR #993 was rechecked: merged, head98ea48fc01d79759cfef40009b18cf69715eaed8 unchanged. Its setGlanceTab guard refuses Glance whenever a split is visible. Native previewGlancePair now applies that rule before changing any ownership or tab state, including requests naming two loose tabs. Closing a Glance validates/clears temporary ownership synchronously rather than relying on a later snapshot.

Final runtime: eight checks pass across regular and private disposable windows. Visible split refuses Glance with exact snapshot state unchanged; inactive persistent split permits a loose-tab Glance; closing Glance retains the persistent split; regular immediate save and saved-Space reopen retain split membership. Browser closes with exit0. Seven focused capture tests pass. No UI exposure or full feature acceptance is claimed.

Initial harness attempts are retained: unsupported blank-tab capture, incorrect save return-shape assertion, and changed-current-capture refusal after Glance focus changed. The latter is not proof that stale ownership alone caused the refusal. Final fixture explicitly saves the current state before switching. No clean pre-fix runtime reproduction is claimed; the visible-split omission is source-backed and the final refusal is runtime-tested.

Two guarded incremental builds succeeded (see logs); final guard schedules zero actions. No new upstream hook/file/hunk added; last authoritative footprint50files/118hunks remains within50/120, not newly remeasured. Temporary checkout restored from committed4a109965 after its directory disappeared. Retained profiles and preview untouched. Latency deferred; Electron diagnostic build unapproved.

Remaining: public Split View controls, pane headers/dividers, rail clustering, whole-split Recently Closed, deeper recovery/mutation/provider coverage and physical-input acceptance. This bounded checkpoint does not close those gates.
