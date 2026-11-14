# Chromium158 recovery isolation, October28

The completed resume5 build and zero-action guard remain valid. No compilation was started during this diagnosis;157 fallback and Google baseline were untouched, Electron paused, latency deferred.

The real-keychain recovery run failed to write Sessions_Encrypted and its shutdown reached the watchdog. A one-second stack sample locates the encryption worker in KeychainPassword::GetPassword, inside the macOS Security decrypt call. This establishes a blocked key retrieval, not its underlying cause. No authorization dialog was confirmed. The separate real-keychain Split View run reached a readiness deadline before any assertions.

Separate fresh mock-keychain diagnostics passed all six recovery checks (including encrypted-only restart and crash survivors) and all five Split View checks (ratios, focus/order, restart, batch close, Recently Closed without duplication). These results isolate functionality; they do not satisfy real-keychain or signed-candidate acceptance. The earlier64 passing protocol checks were not repeated. All111 certificate-entry retention checks remain recorded, not upgraded to runtime revocation proof.

Raw profiles/logs remain in durable evidence/chromium158-affected-checks. Both diagnostic runners exited; waiting split runner42188 was released by recording the actual prior failure, then exited without running. No build is pending. Next: diagnose real-keychain authorization/identity, then rerun only the affected real-keychain recovery and split checks. L12 remains NO-GO.

## Real-keychain follow-up: passed

Owner reported this Mac unlocked and no visible Keychain prompt. An unsandboxed metadata-only lookup confirmed the existing Preview Safe Storage item in login.keychain-db; a read-only SecKeychainGetStatus call returned unlocked=true. Earlier sandboxed status errors did not establish the keychain state.

Using the same completed158 app, fresh isolated fixtures passed all6real-keychain recovery checks and all5real-keychain Split View checks. Recovery explicitly enables encrypted-session storage and verifies encrypted-only restart; split uses the native default feature configuration. No app code, signing, stored key, access permissions or build cache changed. The earlier stall's root cause remains unproven; retain all earlier failures and the stack sample. This demonstrates successful affected native runs, not a diagnosed permanent fix for every possible Keychain stall or signed-candidate acceptance.

Together with the existing64protocol passes, all75prepared affected checks now have passing results. The64were not repeated.111certificate-entry retention remains a separate static/native-byte check. No new gate credit, signed158acceptance, or L12GO. Next review/package the158rebase evidence and assess remaining original Decision2 inputs;157signedfallback preserved, Electronpaused, Googleseparate, latencydeferred.
