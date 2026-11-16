# Prerender repair: final notarized acceptance — October 24, 2026

**Apple Accepted; all72post-notarization checks pass.** The owner explicitly approved L7 for this exact candidate after technical verification; see `owner-acceptance.json`. This record does not authorize release or merge.

| Identity | Value |
| --- | --- |
| Chromium | 157.0.8103.15, Apple Silicon; tested on macOS27.2 build26B118 |
| Candidate source | `14706b0e8d4753d2a7ef35ea32a875b516366b0d` |
| Apple submission | `122ace9e-196b-4f10-8986-c57854a5ee4f`, Accepted |
| Final archive SHA256 | `18a0c2ca240f2200fee3e8b250fbade27b7b86ec1c1dd77c21a538a6776aa8cc` |
| Final archive bytes | 243869929 |
| Developer ID | Anthony Loria / XYGUCY4498 |

The notarized master and archive remain in `/private/tmp/blanc-prerender-final-20261024/`. No artifact was published for public download. `notary-binding.json` also records the submitted archive hash. The notarization request used the existing release identity and owner-authorized1PasswordCLI access. Apple returned Accepted; stapling, strict deep signature and Gatekeeper all pass.

## Exact-byte verification

All462pre-notary signed file/symlink members are unchanged. Stapling adds only `Contents/CodeResources`; the final463-member inventory is frozen. All17Mach-O executables remain arm64 with the same reviewed entitlements and ten preview-specific bundle identities; eight certificate-blocklist hashes remain present. Sixty UI assets remain identical to the preceding accepted candidate; only the two deliberately stamped metadata pages differ. See the audits, inventory and UI comparison.

## Final tests after stapling

| Suite | Passing checks |
| --- | ---: |
| Healthy default prerender activation, regular/private | 8 |
| Blocker utility loss before activation, regular/private | 12 |
| Held decision deadline, late reply and resumed fresh request | 6 |
| Startup/session restoration | 7 |
| Encrypted session/loading-close/crash recovery | 6 |
| Native core behavior and persistence | 17 |
| Notice, keyboard focus, status route and persistence | 16 |
| **Total** | **72** |

Every suite ran serially with pinned Node22.14.0, on fresh disposable profiles, after notarization/stapling. The unchanged463-member inventory was checked after each suite and at cleanup. The deadline schedule is a functional refusal/late-reply control, not a latency benchmark. Notice uses a real pointer-triggered dialog and checks Escape focus return; no new owner VoiceOver pass is claimed. Original failures and fixture corrections remain in [the preceding repair record](../f12-prerender-repair-20261024/README.md).

All owned test profiles/app copies were removed after normal exit; the signed master and archive remain. Google baseline/permanent profiles were not used. No Chromium or Electron build was run for this notarization checkpoint; Electron remains paused and latency remains deferred.

## Remaining gates

Technical L7 requalification and explicit owner approval are complete for this exact candidate. Readiness returns to9/12 (75%), delta+1L7. The current release packet remains NO-GO pending its other requirements. This is not a fresh-download/L8 acceptance claim, a complete F12 spike decision, or a new physical-input acceptance. CI snapshotc150d69b reports25success, two known Electron modified-link failures and two named skips, with CodeQL reporting no new alerts. No failing CI check is waived.
