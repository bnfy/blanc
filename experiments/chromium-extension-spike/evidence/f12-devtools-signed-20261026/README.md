# Signed DevTools replacement repair — October 26, 2026

Source: `1523375af5b93cf910d9cca82f522155ef525adf`, Chromium 157.0.8103.15. Fresh package from the previously tested native output; no native or Electron build this checkpoint. Old accepted signed master remains untouched.

Developer ID signing on the authorized MacBook completed. Local unsandboxed strict verification passes. The sandboxed verification failed with an invalid-signature message; checksum-based transfer found no differing files. The earlier transfer-corruption hypothesis was incorrect. The failed inventory attempt was not counted as acceptance.

42 affected checks pass on this package: regular/private ordinary allow and deny controls, header modification/removal and next-hop restoration, replacement allow and deny, exact native request digest joins, and clean exits. Blocked replacements receive a new native refusal with zero server arrival. Two disposable profiles removed after verified clean exit. No prior complete matrix, owner walkthrough or latency tests repeated.

17 ARM64 Mach-O files and 10 Preview identities audited; expected Developer ID team, no get-task-allow or disable-library-validation. Eight certificate-blocklist keys present. Seven unchanged UI asset hashes map to the earlier accepted candidate. This does not renew all launch gates or imply owner security/release approval.

Apple accepted submission `cf57f6ef-9458-4189-83da-ec053c64cd7f`; ticket stapled and validated, strict signature and Gatekeeper pass. Final audited executable, UI asset and compliance bytes equal the tested signed bundle. Archive SHA-256: `e57f5cdb989d86736e6fd5add8734d0a35d802a096a6158ddb1a960f7000fc2e`. The 42 pre-stapling checks map through unchanged tested code; they were not unnecessarily rerun. Main-frame digest adjunct remains unqualified; F12/Decision 2 and release approval remain open. Google baseline separate, Electron paused, latency deferred.

Preparation failures from absent tracked EasyList and Ghostery inputs are retained. Restored only missing pinned files from the same source commit and reran packaging preparation; no test expectation or product code changed.
