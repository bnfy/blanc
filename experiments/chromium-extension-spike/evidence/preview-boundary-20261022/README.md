# Signed candidate boundary checks — October 22, 2026

Continues L7 after keychain/signing publication61f390c8 on PR1028. Candidate archive SHA256921422c6f0e37b47256ba43e0de21a3c532cce2b8bb984665e6103fac9fd6874; notarized Developer ID XYGUCY4498. macOS27.2 arm64. No build or artifact modification.

Eight bounded runtime checks pass: trusted Island operational; ordinary HTTP page lacks BlancPrototypeHost/chrome.send/blancNewTabReply; page cannot access privileged host iframe; fetches of internal host script, traversal-shaped internal URL and file URL reject; owner retains its two fixture tabs; clean exit. Iframe result proves lack of access, not an independent assertion about the child document's committed URL. CDP is explicitly enabled for the test only. This does not prove all message types, direct internal navigation, compromised-renderer resistance, cross-profile boundaries or private persistence exclusion.

Native source review confirms exact resource allowlisting before filesystem reads, owner plus exact host-URL validation for Island replies, committed-document checks for NewTab replies, and private-profile refusal for closed history. These are scoped review observations, not full L7 signoff. Next finite L7 work: inventory all privileged request dispatch authorization, review private durable stores and packaged diagnostic defaults against this artifact, then record residual findings for owner signoff.

Disposable test profile removed after clean exit; Google/dev preserved snapshots unchanged. No permanent profile or Google baseline modification. Raw launch log retained locally at /private/tmp/blanc-preview-boundary-20261022.

Owner confirms no macOS26 test Mac is available. Supported-OS acceptance remains blocked; do not silently change approved scope to27.2. Progress1/12, delta0. Latency deferred; Electron diagnostic build pending.
