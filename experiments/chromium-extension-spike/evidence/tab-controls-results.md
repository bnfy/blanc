# Tab controls: Mac acceptance — October 16, 2026

Verified head: `35f43c649d5c707af987afb8d2abf15ba319d86a`. Chromium pin: `156.0.8078.36`.

Prepared with `prepare.mjs SRC --assets-only`, froze assets at `/private/tmp/blanc-pr861-assets-35f43c64`, relaunched the existing permanent profile. No native build was needed for this fix. Previous native code at 3b6b4189 had already built and passed pin/mute/persistence checks.

All previously blocked native acceptance checks now pass:

- Loose-row drag with string source and before IDs reaches the bridge, returns true, and changes order. Captured B-before-New-Tab intent and resulting order.
- Pinned-row drag returns true and moves A before C inside the pinned section.
- A drop clearly inside the opposite unpinned section leaves pinned state/order unchanged and shows no error. A drop at the shared section edge can legitimately snap to the end of the pinned bucket; the refusal check deliberately targets farther inside the opposite bucket.
- Native Option+Shift+Up and Option+Shift+Down on a keyboard-focused row move it one slot in both directions.
- Native pin/unpin and `/pin` still pass.
- Native switching, typed address navigation, Cmd-[ back, Cmd-] forward, Cmd-R reload, Cmd-D with Island input focus, `/save`, row mute/unmute, `/mute`, and row close still pass with the string-ID contract.

Native checks used real macOS CGEvent keyboard/mouse input. CDP supplied observations and fixture setup. Read-only bridge instrumentation recorded the actual calls from native dragging. A first attempt aimed too close to the pinned boundary and generated no move; successful interior-row and pinned-row drops were then recorded. This geometry correction is not an unresolved product failure. Audio output was fully verified in the previous native-code pass; this assets-only regression checked the audible fixture, native mute state and controls.

The earlier successful session-restore pin/order result remains applicable; the change only adapts UI IDs. This pass did not repeat the pin/order persistence protocol.

Cleanup removed only fixture tabs and exact localhost A/B/C history entries. Test Favorites were toggled off. Baseline and final Favorites are empty; original New Tab remains. Temporary UI observation hooks were removed by reloading the host. Fixture server stopped.


## Earlier native-code verification

The initial native-code build at `3b6b4189b073795548716041c8e1d851dc00476e`
passed in 35.55 seconds, seven steps. Pin/unpin, the audible fixture's mute
and unmute controls, and session-restore pin/order persistence passed.
`chrome://media-internals` reported the output stream started → stopped →
started while the HTML media element kept playing; this was a native output
state check, not a human listening test. Numeric bridge calls established the
order for that persistence check; native UI reorder was still failing at that
commit and passed only in the later assets retest above.

## Committed evidence

- [Native build log](tab-controls-native-build.log)
- [Initial chronological run](tab-controls-native-run.json)
- [Fixed-assets chronological retest](tab-controls-retest-run.json)
- [Native controls screenshot](tab-controls-retest-controls.png)
- [Clean final window](tab-controls-retest-final.png)

The chronological records retain intermediate failures and geometry probes.
The initial ID mismatch is resolved by the verified head above. The retest's
first drop attempt is explained in the native-input notes, and subsequent
successful drag/keyboard records carry the acceptance result. Fixture URLs,
process-local tab IDs, and local screenshot paths are historical observations;
use the committed links above to inspect the packaged evidence.

Build-log trailing whitespace was normalized when packaging; diagnostic content
and timing are unchanged.
