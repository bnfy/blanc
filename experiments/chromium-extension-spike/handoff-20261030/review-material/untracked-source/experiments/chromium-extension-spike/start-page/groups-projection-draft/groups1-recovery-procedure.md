> **Superseded:** the 556-denominator approach stopped again at a provisional 972. Its lock recovery completed as `recovery2`. Do not use the 556 recorder for further work; see `action-start-guard-design.md` for the separately reviewed fresh-plan procedure. The original steps below are retained as historical evidence.

# groups1 interrupted-build recovery — prepared, not executed

The retained `build-groups1/receipt.json` reports a one-action dry run and identical one-action recheck (`0a808d6e07c47d527e7f97fe4f0906011ff8355a82b8ffb35c178fd39a2d279e` normalized command-multiset SHA-256). The process-group monitor observed a maximum advertised total of 556 against the prior limit of 1, sent SIGTERM and reported group exit. The preserved build log ends `Build Failure: 0 done, 0 failed, 395 remaining`, `interrupt by signal`; it shows a C++ action starting, so zero completed actions alone is not proof that no intermediate state changed. No success or zero-action guard is claimed. A read-only process snapshot during this preparation found neither owner PID 57051 nor process group 57086 nor Siso/Ninja/caffeinate; this observation is time-limited and must be repeated. Both retained lock owner records identify PID 57051 and their exact owner-file hashes are embedded in the recovery script.

## 1. Review and recover only those stale locks

`recover-groups1-locks.py` is a prepared, **unexecuted** owner-checked recovery script. It refuses existing recovery labels; verifies the hash-pinned interrupted receipt/log, stage receipt and trusted baseline receipt; verifies all 353 app entries, the complete separately linked output framework, staged source and baseline UI object; checks both owner PID and build process group are absent and there are no Siso/Ninja/autoninja/caffeinate processes; prevalidates both lock directory and owner file inode/hash/content and refuses any extra entry. It then creates and fsyncs a new durable recovery receipt and records intent before each removal. It checks process and lock identities again immediately before each removal, removes only the matching owner file and empty directory, and removes the Sunrise coordination lock first and shared build guard last. It never signals a process or touches caches, profiles, source, output, artifacts or old evidence. If an interruption occurs after unlinking an owner but before rmdir, the new receipt identifies the pending lock; stop and inspect rather than blindly retry. Locks coordinate participating workflows only; no check rules out a non-cooperating writer racing cleanup.

After independent review and only with confirmed owner authorization for this recovery, run with a fresh label:

```sh
python3 experiments/chromium-extension-spike/start-page/groups-projection-draft/recover-groups1-locks.py fresh-label
```

Run from `Chromium Preview/repo`. The script's resulting receipt is new evidence under `Chromium Preview/evidence/start-page-groups-20261029/lock-recovery-fresh-label/`; do not edit or delete the original `build-groups1`, `stage-groups1`, source, cache or lock evidence. A changed PID, owner hash/inode, full app, object, source or active process stops recovery.

## 2. Fresh plan, separate review, then optional build

`record-groups-resume.py` is a separate, **unexecuted** two-phase recorder. It requires the old recorder owner and group to be absent, binds the exact completed owner-checked recovery receipt, revalidates the trusted full baseline app and output framework and UI object under its acquired guards before plan/build, and rechecks the original failed receipt, build log, stage receipt and both original plan logs by hash. It requires a fresh plan to remain exactly one action with the original normalized command-multiset digest, not merely the same count; a changed command or plan fails closed for a new review. It preserves the pinned SDK, compiler and args; uses the same Siso offline/eight-worker flags; holds both cooperative locks during each phase; and never cleans the cache. It does not itself remove the retained old locks.

After successful reviewed lock recovery, obtain a fresh plan without compiling:

```sh
python3 experiments/chromium-extension-spike/start-page/groups-projection-draft/record-groups-resume.py plan fresh-build-label groups1 556 fresh-label
```

Review the full fresh `preflight.log`, receipt, unchanged action digest and the proposed **556 maximum advertised live total**. The value 556 merely accommodates the transient total observed in the interrupted run; it does not mean 556 actual completed actions or imply that a broader build has been approved. The recorder cannot establish owner approval. Only after a separate explicit owner decision for that live cap and fresh plan, invoke:

```sh
python3 experiments/chromium-extension-spike/start-page/groups-projection-draft/record-groups-resume.py build fresh-build-label groups1 556 fresh-label
```

It rechecks the same digest immediately before compilation under the same guard. It monitors live Siso progress and signals only its own process group if the advertised total exceeds 556 (or the 1,000 global ceiling), retaining logs, cached work and locks if exit is uncertain. An observed 556 is allowed; 557 triggers a stop. Siso's advertised total may include unpruned work and later shrink. Monitoring is best effort: polling can detect expansion after actions start, and missing or incomplete progress cannot establish a hard ceiling. A stop or unexpected plan requires inspection, not silent resume. On success the same guarded transaction requires the zero-action guard and binds the full app inventory to the receipt; test-only browser fixtures may then be separately reviewed and run. No action here signs, releases, promotes, restarts the current development browser, or gives parity credit.

`recover-groups1-locks.test.py` exercises only disposable lock directories (matching owner/inodes, changed-owner and foreign-entry refusal, and owned removal); `scope-monitor.test.py` includes a synthetic owned child group and the 556/557 threshold. No real locks or original evidence were changed by preparing these files.

The separate `fresh-label` in both recorder invocations is the completed lock-recovery label; a pending, incomplete, changed or differently owned recovery receipt is refused. Fake recovery/baseline tests pass, but the actual scripts remain unrun.
