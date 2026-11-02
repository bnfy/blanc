# Native certificate-patched replacement — notarized and checked

Source `7c427328100d1ba76cb7e8b651a1f36d74ec86c6`, Chromium157.0.8103.15. Archive **ffcfefdfbb5421619f3ba359bb4c5d92134b468ac8475c18eda12153a7f5e4ed**. Apple Accepted **e46dbe18-f1f1-424e-abe9-ab44b79ef29c**; stapling, strict deep signature and Gatekeeper pass. [Artifact details](artifact-details.json), [frozen inventory](frozen-candidate.json), [source delta](source-delta.json).

The existing native output passed the zero-action guard; only the small packaging launcher was compiled. Twelve compliance tests pass. Developer ID signing used the existing release Mac/key, with no key export. All eight reviewed SPKI sequences are present in the signed framework. Their behavior is supported by the separately recorded native verifier tests; byte presence is not a new live TLS revocation test.

The full native patch, excluding the certificate table, matches the previous accepted6b9a05a0 patch exactly. Native added sources, upstream, build environment, blocker/filter pins and six compared UI assets match. Start-page HTML has newly stamped candidate metadata. Prior complete gate/owner acceptance is not silently transferred to new bytes.

## Frozen replacement acceptance on macOS27.2/arm64

| Schedule | Passed checks | Coverage |
| --- | ---: | --- |
| Startup | 7 | Two normal restarts preserve tabs/selection; explicit startup preferences; private-only exclusion and subsequent regular recovery |
| Encrypted recovery | 6 | Fresh isolated profile; encrypted-only restart; closing a loading tab; immediate post-ack crash preserves survivors |
| Core | 17 | Native navigation/find/zoom/download/media/bookmark/history/settings and clean restart smoke |
| Version/security notice | 16 | Exact metadata; offline notice; reviewed status/support destinations; layout; dismissal/focus and restart persistence |

**46checks pass**. All458regular-file and5symlink records remain unchanged through all four schedules. [Summary](checks-summary.json) and individual results retain actual coverage; these counts are not additional independent full-gate passes. No owner physical-input/VoiceOver, extension upgrade, fresh hosted download, second-Mac launch or complete certificate handshake matrix is claimed here.

The local four-file archive/SBOM/inventory/provenance packet is prepared. Its checksum manifest is **not yet Sigstore-authenticated**, uploaded or tested through a fresh download. Metadata lives in [artifacts/](artifacts/); the ZIP remains outside Git at `/private/tmp/blanc-l11-signed-replacement/artifacts/Blanc-Chromium-Preview-157.0.8103.15-7c427328-arm64.zip`. L8 replacement acceptance and final approval remain pending.

## Incidents and preservation

Initial remote retrieval failed on a space-containing path; the parent path worked. Restricted local verification reported an error, but the same app passes with macOS trust-service access; a transfer-corruption cause was not established. Initial1Password authorization timed out before submission; after the owner unlocked it, one successful submission produced the Apple acceptance above. These incidents are retained separately.

The temporary remote signing job is unloaded and the already-authorized key retained. All test browsers and servers exited; six owned fixture paths were removed. Signed master/packet remain. No owner Preview/Shipping app, permanent profile, isolated Google baseline or closed baseline backup was changed. No Chromium recompile, Electron build, latency run, merge or release. L11 remains blocked by the independent Electron sandbox duplication failure; L4 still lacks an eligible offer. **Readiness9/12,delta0.**
