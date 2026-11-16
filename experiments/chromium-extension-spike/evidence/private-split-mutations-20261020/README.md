# Multiple private Split Views and mutations — October 20, 2026

Evidence-only run on6ac8714e. Eight recorded checkpoints complete without browser crash or tab loss. This is not eight parity passes: two behavior differences were found.

## Passed bounded checks

Two inactive private two-pane splits retain independent last-focused members with a loose active tab. Selecting the second split's other pane changes only that split's focus. All five tabs stay private through group/ungroup and pin/unpin actions. Pinning removes the pane from its two-pane split, dissolves that split and leaves both tabs open. The capture adapter refuses private state; native Spaces save/open/recover refuse; the existing regular Spaces store is byte-for-byte unchanged. Disposing the private context leaves the regular window intact. Normal browser exit is zero.

## Confirmed differences against pinned Electron #993 (98ea48fc)

1. Grouping one pane dissolves that split and groups only the selected tab; the other private split remains intact. Ungrouping does not recreate the dissolved split. Electron src/main/main.js groupTabByName invokes alignSplitGroup, which applies the selected pane's group to every member and preserves the split. Native group-mutation parity therefore fails.
2. Unpinning leaves the tab at the front of the native tab order. Electron toggleTabPinned moves an ungrouped unpinned tab to the end. Native unpin-order parity therefore fails.

No implementation repair is included in this checkpoint. Snapshot split IDs are record-local and can renumber after a split disappears; comparisons use actual member IDs. Private multiple-window combinations, group moves/merges, close/restore, reordered split members, private visual/native input and wider lifecycle remain gaps. Private persistence checks cover the Spaces file, not forensic inspection of every profile byte. No restart was run in this checkpoint; previous private restart exclusion evidence remains separately qualified.

No compile; final incremental guard zero. Prior footprint49/117 within49/120 unchanged. Disposable profile removed; retained preview untouched. Latency deferred, native input pending and Electron diagnostic build unapproved. Raw browser logs retained; fixture pages are authored loopback content.
