# Browser-owned Downloads controller v6 — snapshot-order candidate

Latest published release and direct tag verified 2026-10-29: Blanc v1.45.0, commit `6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`. This is a separate unregistered candidate; v5 remains unchanged except for recording its independent review.

An independent v5 review demonstrated that if a newer complete list `[1,2]` is applied and a late older list `[1]` is applied afterward, handle 2 can be pruned even though it belongs to the newer snapshot. V6 mints a browser-owned generation *before* beginning a complete asynchronous snapshot, combines it with the bound document's unique epoch, and accepts row issuance and reconciliation only for the newest ticket. Each ticket can be consumed once, including a malformed reconciliation, so duplicate completions do not overwrite a result. Starting a newer snapshot invalidates earlier tickets even if the new snapshot later fails. Counter overflow fails closed; document reset invalidates prior-document tickets. Snapshot data, completeness and ticket provenance remain browser-owned obligations and must never be renderer-controlled.

The generic reconciliation helper detaches obsolete map nodes before their destructors run, avoiding an active map iterator when observer teardown re-enters. This is not a proof that Chromium's actual observer/lifecycle callbacks are safe.

`snapshot-order-test.cc` tests the actual v6 gate and reconciliation helpers together with the reported out-of-order `[1,2]` / `[1]` scenario, duplicate completion, later-started snapshot invalidation, malformed snapshot atomicity, document epoch reset, generation exhaustion, and fake destructor reentry which starts a newer generation and inserts an item. It compiled with `xcrun clang++ -std=c++20 -Wall -Wextra -Werror` and exited 0 with assertions. The Chromium 158 cached-clang syntax-only check of v6 controller exited 0 (`syntax-v3-command.json`, `syntax-v3.log`); inherited environment and transitive inputs are not fully pinned. No real controller runtime, native item/observer, IPC or browser test was run. Prior v5 activation changes were not retested by this helper.

This candidate is not registered or a product parity claim. It still requires authoritative owning-window/document binding, actual overlay gesture behavior, current live visibility and warning/enterprise action policy, safe bounds or cleanup when snapshots are abandoned or never finish, real manager/item/OTR lifecycle and callback tests, command outcome handling, and the actual shipping sheet. No build, Chromium profile, or release gate was exercised.

Frozen SHA-256:
- `download-controller.cc`: `8be0067ef9dcca59d81c085a7ff2b25b7b0fdf29ed79e49916db5b648971a2af`
- `download-controller.h`: `ba9506d391f5e9e3cb813f27eb7fd9e655d0e6b71c04e611c562872f6e81898c`
- `snapshot-gate.h`: `636bb36308ec130f85a1f9debbdc47dbdd8db82d425a874f3a776dbb03eb053e`
- `reconcile.h`: `3d5a47534a0c0308a44a3c00714f17cf12446fe3af2b8d3c105ff97919fa8e26`
- `snapshot-order-test.cc`: `989f1eb7b18c400a5105b337909aca82103c0fe2bf531dc91c8a41bcc794899c`
