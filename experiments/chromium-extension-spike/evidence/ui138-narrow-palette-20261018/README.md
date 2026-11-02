# Narrow windows, palette and find comparison

October 18, 2026 EDT (October 19 UTC logs). Scoped diagnostic evidence, not complete visual or native-input acceptance.

## Change and build

The native address-command host entry now opens the copied palette mode rather than the plain panel, preserving the resting pill and applying its 18% dark scrim. Native layout bounds the requested full-height overlay to the actual window; the palette's hit region includes its backdrop. Repeating the command emits the copied toggle behavior, retaining/selecting typed input. New-tab/typing/click entry paths remain panel mode. This fixes mode/geometry, not all keyboard routing or pointer behavior.

One guarded incremental build passed: 37.69s wrapper / 33.88s Siso / six steps. Plan one action; final guard zero, 3.43s. No cold output, GN/toolchain changes or budget increase. Inventory remains 40 upstream files / 94 hunks. Four layout/promotion regression tests pass, host syntax and focused no-undef/no-unused-vars/no-unreachable lint pass. Initial lint import failed because the worktree has no node_modules; the existing separate test checkout supplied ESLint for the successful scoped run.

## Five measured sizes

Actual Chromium windows: 1280x700, 800x700, 640x700, 500x700, 500x400. Each palette has nonzero width, stays inside the viewport, uses a full-height backdrop and retains/selects the 13-character typed fixture after repeat open. Widths are 620,620,616,476,476px. At <=800px Chromium intentionally anchors y48 rather than Electron y12 to clear its native window controls; this remains a documented difference, not pixel parity.

Electron uses the installed unchanged 1.38.0 application. Its renderer viewport was overridden through CDP for these sizes; this is not a native Electron-window resizing test. The real openIsland bridge opens a panel. The reference then sets only body data-mode to palette to inspect palette CSS: this is a diagnostic CSS reference, NOT a native Cmd-L palette test. Reference panel widths match Chromium. Different tab counts produce different heights, so no height/pixel equivalence is claimed.

At 500x400 with 12 additional fixture tabs, Chromium panel bounds are (12,48,476,340), bottom388; footer bottom379. islandList scrolls 480px in 233px. The 248px rail leaves 252px of page width and scrolls 587px in 281px. This establishes overflow geometry, not native scrollbar/input acceptance.

## Find remains a migration gap

Electron's actual openFindBar/findInPage APIs return one Beta match at all five sizes. The capsule is 480px wide, shrinking to476px at500px, 42px high. Reference coordinates are overlay-local; Electron's real find view placement below the header is not reconstructed by viewport emulation.

Chromium has no openFindBar/findInPage bridge and /find is intentionally absent from its slash allowlist. The direct diagnostic API probe rejects; users are not being offered a broken /find row. Chromium still relies on its native Find command, whose keyboard/input and visual behavior were not tested this turn. Porting Blanc's capsule, result events, forward/backward/clear, tab switching/navigation and private behavior remains explicit next work; no native Find pass claimed.

## Locked-screen and failed attempts

CUA confirmed the Mac was locked; one unlock question was sent. No native keyboard/mouse checks were performed. First ordinary-launch captures stalled animation/resize and are excluded from acceptance. Disposable instances were restarted with disable-renderer-backgrounding, disable-backgrounding-occluded-windows and disable-background-timer-throttling. These diagnostic-only flags enabled measurement and were NOT used for the restored preview. Initial restart omitted no-first-run, yielding Chromium onboarding and a missing-target harness error; corrected restart retained original flags. before.json and check-attempt1.mjs preserve the inconclusive first attempt; diagnostic.json records the pre-fix repeat. Screenshots are renderer-only; transparent page backing may appear black and native widgets are absent. This is not a whole-window screenshot comparison.

Native Cmd-L/Escape/outside-click and focus checks are pending unlock. Larger tab counts/widths/DPI/RTL, private palette, full visual states, find capsule, Spaces/Glance and previous F12/Task0 gaps remain open. Item4 stays in progress. Latency deferred; Electron diagnostic build unapproved/unstarted. Installed Electron was not rebuilt or instrumented.

## Evidence and cleanup

final.json asserts five cases; overflow.json asserts the crowded narrow case. All archive members are SHA-256 verified. Scripts retain original local paths and are evidence, not a portable harness. No profiles/cookies/keys are archived. Disposable profiles and server removed. Original preview New Tab and Store restored with empty status on9248; verified through CDP, no new physical-input claim. 156 and permanent profiles untouched.
