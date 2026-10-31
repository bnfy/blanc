# Replacement manifest authentication and hosted-download checks

The notarized native certificate replacement is source7c427328 / archiveffcfefdfbb54. The exact manifest verifies against anthony@bnfy.me and https://github.com/login/oauth, locally and independently on the release Mac. Real altered-manifest and altered-artifact controls reject. All458files/five symlinks in the archive match; source/provenance/license/SBOM bindings verify and macOS signature/staple/Gatekeeper pass.

An unpublished validation draft422428502 contains the six-file packet. All six uploaded digests/sizes match. Six new HTTP GETs through signed GitHub asset redirects receive200; account authorization is used only for the GitHub API redirect and is not forwarded to release-assets.githubusercontent.com. Every downloaded byte matches and the downloaded packet authenticates against the same pinned identity, source and artifact digest.

After the owner completed the download in Safari on the MacBook, the actual downloaded **Downloads/Blanc Chromium Preview.app** matches all458files and5symlinks. Native Safari quarantine, strict deep signature, stapled ticket and Gatekeeper pass on macOS27.2/arm64. The replacement was confirmed closed before this check. The owner has been asked for ordinary launch, two clean restarts, exact tabs/selection, Shelf, Bitwarden popup keyboard focus and Shipping-tab preservation. That hand check is pending; no final replacement acceptance is claimed yet.

The Google baseline and permanent profiles are untouched. No new build or runtime acceptance was run in this manifest/download check. Latency and Electron diagnostic build remain pending. L4/L11 blockers remain independent;9/12gates,delta0.

## Owner first-launch finding

The owner reports the previous Example tabs were missing on first launch of the replacement. Running source/profile selection is correct. Read-only session inspection finds one tab/no Example navigation in both retained open-session streams, while the separate Tabs streams contain Example navigation records. This does not establish when or why open tabs disappeared, nor prove which historical entries remain available for restoration. No app restart, profile edit, full profile copy or restoration was performed. The SQLite history query failed and supplies no evidence. The owner has been asked for one controlled loaded-Example/Cmd+Q/reopen check. Replacement acceptance remains pending; prior automated passes do not resolve this finding.

### Controlled follow-up and concurrency clarification

The owner reports both recreated Example tabs returned after one Cmd+Q/reopen. Read-only postcheck verifies all458files/5symlinks of the running7c427328 app and finds both Example URLs in the retained open-session streams. A first inspection used the pre-restart PID and correctly failed because that process had exited; dynamic identity lookup supplied the fresh process. This is a diagnostic correction, not a product failure.

The owner then disclosed another session testing Sync with the iOS port, potentially confounding the initial tab state. The inspected “Review iOS feedback plan” records describe isolated desktop test data; they do not establish that it changed this Preview profile. The initial missing-tabs observation and the owner's statement that the tabs had been open are retained, but neither a product regression nor Sync causation is established. No production fix or profile mutation was performed. The remaining second controlled restart and preference/popup/Shipping checks are still pending.

## Final owner acceptance

The owner reports **“Both tabs returned”** for the first controlled Cmd+Q/reopen check, then **“All checks passed”** for the final controlled check covering selected example.org, both Example tabs, Shelf, Bitwarden popup/Tab focus and Shipping tabs. The exact question and scope are in [owner-acceptance.json](owner-acceptance.json). The [read-only final postcheck](owner-final-postcheck.json) verifies the running App-Translocated7c427328 copy against all458files/5symlinks and finds both Example URLs in the retained open-session records. Restart count, visible selection, popup focus and Shipping state are owner-reported, not claimed as automated UI observations.

**L8 is accepted for this replacement. Readiness remains9/12,delta0**, updating an already accepted gate to the new artifact. The initial first-launch observation remains unexplained with concurrent Sync testing disclosed; no product repair or causal attribution is asserted. This is bounded second-Mac acceptance of an unpublished packet, not factory-clean OS, arbitrary migration, independent/hermetic build or release approval. L4, L11, L12 and Decision2 remain open. Google baseline separate;latency/Electron pending.
