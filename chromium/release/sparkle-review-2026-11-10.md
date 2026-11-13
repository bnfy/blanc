# Sparkle 2.10.1 review — November 10, 2026

The owner approved the newest stable Sparkle 2.x. The first-party latest
release is [2.10.1, published October 25](https://github.com/sparkle-project/Sparkle/releases/tag/2.10.1),
not a prerelease. It incorporates the preceding
[2.10.0 release](https://github.com/sparkle-project/Sparkle/releases/tag/2.10.0).
The selected framework reports version 2.10.1, build 2065 and minimum macOS
12.0; Blanc Beta retains its approved 13.0 minimum.

`Sparkle-2.10.1.tar.xz` is 16,346,336 bytes. Its locally calculated SHA-256 is
`1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27`, matching
the release asset's published digest. This is first-party distribution
provenance, not an independently authenticated source-build reproduction.
`sources.json` records the URL and refreshed hashes of all 19 reviewed source
inputs. Raw public release/advisory responses, source bytes and the archive are
under `evidence/foundation/sparkle-2.10.1-review/` outside this repository.

## Security changes since 2.8.0

| First-party advisory | Fixed in | Relevance |
| --- | --- | --- |
| [GHSA-hg88-v3cw-3qrh / CVE-2026-47121](https://github.com/sparkle-project/Sparkle/security/advisories/GHSA-hg88-v3cw-3qrh) | 2.9.2 | Delta application could traverse intermediate symlinks outside its destination. |
| [GHSA-g3hp-f6mg-559v / CVE-2026-47122](https://github.com/sparkle-project/Sparkle/security/advisories/GHSA-g3hp-f6mg-559v) | 2.9.2 | The installer's later XPC listener could accept spoofed appcast metadata. |
| [GHSA-gmj2-gq3j-vqmj / CVE-2026-115568](https://github.com/sparkle-project/Sparkle/security/advisories/GHSA-gmj2-gq3j-vqmj) | 2.9.5 | Follow-up delta fix prevents a symlink output from overwriting files outside the destination. |
| [GHSA-3x7w-j75x-ppq5](https://github.com/sparkle-project/Sparkle/security/advisories/GHSA-3x7w-j75x-ppq5) | 2.9.6 | Download validation and movement could operate on different resolved paths. |
| [GHSA-4v99-qgq9-6pxp](https://github.com/sparkle-project/Sparkle/security/advisories/GHSA-4v99-qgq9-6pxp) | 2.9.6 | Privileged cache cleanup could follow a symlink in the console user's home. |

All five published affected ranges include 2.8.0; 2.10.1 is beyond their fixed
versions. [Upstream's 2.9.6 security discussion](https://github.com/sparkle-project/Sparkle/discussions/2838)
explains why disabling deltas alone did not address the later installer race.
The wrapper keeps its no-delta and no-root rules, immutable production feed,
strict version/architecture/URL checks, and EdDSA verification before extraction.
These restrictions supplement the fixes; they were not a basis for waiving them.
The reviewed advisory list is a dated observation, not a guarantee of no future
vulnerabilities. Consult [upstream security guidance](https://sparkle-project.org/documentation/security-and-reliability/)
again before distributing a signed release.

## License and qualification boundaries

The entire [2.10.1 LICENSE](https://github.com/sparkle-project/Sparkle/blob/2.10.1/LICENSE),
including bundled third-party terms, hashes to
`389a4e4e9a32f059775b13a06e25a591445ba229d2838d26dd3e7c0c45127cfe` and is
byte-identical to the committed full notice. Keep the entire file in the app
and notice set; an MIT-only summary is insufficient.

The policy, metadata fixtures, runtime version check, offline stager and tree
verifier now pin 2.10.1/2065. The actual release archive begins entries with
`./`; the stager now normalizes that prefix before selection and duplicate/link
checks. Tests cover both layouts and refuse duplicate normalized entries.

Preview offline tests do not link or execute Sparkle. The dedicated beta must
still prove framework/helper IDs, architectures, linkage, local installation,
wrong-key/tampered-update refusal and clean relaunch. Developer ID signing,
notarization and the production signed update remain separate owner gates.

The hash-verified archive was staged successfully with the offline stager.
Read-only `lipo -archs` reports arm64 and x86_64 for Sparkle, Autoupdate,
Updater, Installer and Downloader. Each passes local strict `codesign` integrity
verification with no signing team (upstream ad-hoc signatures); no Gatekeeper
or Apple service was used. `native-inputs.json` records binary hashes and IDs.
Framework/Updater/XPC IDs match the existing policy. Autoupdate has an upstream
ad-hoc hash-derived identifier; the production signing adapter must explicitly
assign the reviewed `org.sparkle-project.Sparkle.Autoupdate` identifier before
production verification. These observations qualify staged inputs only.
