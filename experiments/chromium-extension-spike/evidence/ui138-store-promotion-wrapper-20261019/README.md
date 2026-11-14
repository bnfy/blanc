# Store promotion wrapper repair — 2026-10-19

The exact Chrome-download campaign callout now hides its immediate role=dialog wrapper only when every sibling is empty noninteractive decoration. Mixed-purpose wrappers retain their other controls. Four unit tests pass. No UA, permissions, authentication, or install APIs changed.

Live rebuilt disposable browser: wrapper display:none; Sign in left/center/right hit tests pass at 1600px, and its link navigates to accounts.google.com with title Sign in - Google Accounts. No credentials entered; authenticated sign-in not tested. Initial 1200px right-edge probe was outside viewport (button right1221); retained as a diagnostic, not a pass. Official Extensity listing has enabled Add to Chrome. Invoking it is not counted as installation success or observed permission-dialog acceptance.

Native verification remains pending: CUA binds the older retained preview process rather than the disposable instance. Automatic approval review rejected closing the retained preview because of potential tab-state loss. Original preview remains untouched on its older loaded binary; updated binary will apply on a later authorized restart. Previous checkpoint's native install/permission pass is historical, not retested here.

One guarded incremental build: 35.51s Siso, six steps (39.99s wrapper). Final guard zero actions,5.86s. No new upstream file: generated Blanc header changed; prior41files100hunks footprint not re-enumerated. Latency deferred; Electron diagnostic build pending approval. A disposable launch during final build finishing was stopped before verification and relaunched after successful completion; no acceptance uses that first launch.
