# L5 owner acceptance — in progress

Candidate source c506e4aa10e4c843009ac85656b5a951451bf9d0, signed archive SHA256 777180c90c2b4fafb10c4e0442704fff2875763bf9d479714733151a1c150dfe. Signed master verified before launch. Test profile /private/tmp/blanc-l5-owner/profile. No permanent profile or Google baseline copied or changed.

Pending owner observations:
1. Physical Island focus, typing, new tab, tab switching, navigation/find and visual readability.
2. Native context menu; close confirmation Cancel/Leave; permission dialog keyboard dismissal/refusal.
3. Split View physical pane focus, divider drag/reset, pane menu and narrow layout readability.
4. Installed-theme Apply/Remove, native cancellation and meaningful focus; extension popup focus.
5. VoiceOver labels/order for Island, theme action groups, dialogs and split controls; no inaccessible destructive action or stuck focus.
6. Matched-size comparison against shipping Blanc using only an owner-selected comparison window, and explicit owner acceptance of the tested candidate scope.

Owner reported the initial four physical-input steps passed: address typing/navigation, new-tab/numbered switching, beforeunload Cancel and confirmed Leave. Agent then observed a remaining history-persistence warning in native AX and browser.log at 12:41:53. The no-warning criterion is not accepted and requires disposition. Remaining items are still pending. Prior native AX and keyboard automation remains separate. L5 stays open; readiness 7/12, delta0. Latency deferred; Electron diagnostic build pending.

Owner stage2 failure: page-content clicks do not activate a Split View pane; header click required. Other stage2 checks not yet reported. L5 cannot close.
