# Higher-load WebTransport and repeated deletion cancellation

The final harness uses 16 simultaneous allowed requests per cycle (8 document and 8 service-worker), three cycles per retained disposable profile, regular/private contexts, with and without deletion cancellation. This is twice the preceding batch size, not saturation or latency qualification. Each cycle holds the owned blocker utility, proves all 16 native pending IDs and zero new server events, then resumes and requires exactly 16 distinct allow decisions and real HTTP/3 CONNECT/datagram echoes. Cancellation schedules dismiss a real native beforeunload prompt on each cycle, retain Default in the profile registry, and run a fresh transport control after each batch.

Final result: all four schedules / twelve cycles pass, 192 distinct native allow decisions and 192 batch CONNECT/datagram echoes, six deletion cancellations, plus twelve fresh controls. Validate with `python3 validate.py`.

## Retained limits and fixture failures

- `initial-32-request-report.json`: all four mixed allow/block schedules timed out waiting for every request to reach the native gate. No complete batch qualified.
- `mixed-16-request-report.json`: first cycle passes in each of four schedules (64 decisions: 32 allows/32 refusals), but second-cycle admission times out. Repeated mixed-load cancellation remains unqualified. Chromium's pending-handshake throttling and failed-handshake penalties are a source-supported possible explanation, not proven causal attribution. Do not disable those safeguards or report the final allowed-only run as mixed-load success.
- `initial-repeated-removal-report.json`: the first allowed-only fixture reused the profile-statistics keepalive across removeProfile calls; the second removal asserted in ProfilePickerHandler. The corrected harness reacquires statistics before each attempt, matching the handler's consumed keepalive contract. Non-cancellation cycles from this attempt are not added to final totals.
- `mixed-harness.mjs.txt` preserves the 16-request mixed version; the 32-request attempt used the same harness with count32 and the corresponding event label.

No production edits or compilation. Build guard schedules zero actions. Native executable/framework/engine hashes match the previous repaired run; provenance includes throttle and profile-picker source hashes. Temporary profiles and certificate keys are removed by each harness. Raw decisions/logs remain under /private/tmp/blanc-wt-load-cancel-01 through -04.

F12/Decision2 remain open. Higher mixed loads, longer repetition, other providers/profiles and physical native input are not qualified. Google baseline stays separate; latency deferred; Electron diagnostic build pending approval and unstarted.
