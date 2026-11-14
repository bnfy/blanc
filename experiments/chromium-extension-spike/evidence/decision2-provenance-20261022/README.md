# Decision 2 current-source provenance reconciliation

October 22, 2026; source head `c00d0e3ec1df245b8370a3972158f1bae3b10d76` before this documentation/counter update. Read-only inventory against Chromium `41520584daa68d0040db7746ae562a0ff82187f6` reports **58 upstream files/137 zero-context hunks**. Resolved Git dependency cleanliness and pins were checked by the authoritative counter. Initial result exceeds the stale 58/135 counter; the counter is advanced to 58/137 under the owner's standing authorization, without suppressing the original result.

Compared with the last full F12 prefetch-response-repair inventory, all **56 pre-existing modified upstream paths have identical patch hashes**. Exactly two new paths disable Omnibox Everywhere; none removed. Latest private-only prefetch restored provenance also matches the current native bridge source, launcher executable and engine.js hashes. The framework binary differs after the launcher removal rebuild, as expected. This is source-continuity evidence, not binary equivalence or a new runtime pass.

Reuse bounded historical request-path tests as supporting evidence; do not repeat all lifecycle matrices for the two isolated launcher edits. The launcher removal has a successful incremental build and settings eligibility false on the reopened dev profile. Physical shortcut invocation remains unverified. Candidate freeze must still capture all new Blanc-owned files, resolved resources/configuration, distribution identity, and run the written candidate smoke. Full historical F12 A/B acceptance and deferred latency are not closed here.

No native compile or profile change for this reconciliation. Separate Google baseline recovery evidence remains outside this archive. No Electron build.
