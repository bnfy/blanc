# Moving the Android lane to a new Chrome stable

Blanc for Android follows Chrome stable for Android (design §7.1). A stable security release must
reach Play's production track within 7 days, and a fix for a vulnerability exploited in the wild
within 72 hours (§8.3). This is the procedure, and the first run of it is A7's rebase drill (K4).

Every run gets a row in `chromium/android/rebase-ledger.json`:
`{from, to, startedAt, finishedAt, hours, patchesConflicted: [...], notes}`.

1. **Pick the version.** The newest Chrome stable for Android on chromiumdash
   (`https://chromiumdash.appspot.com/releases?platform=Android`), with its Chromium revision.
   Record `startedAt`.
2. **Fetch it on the build server** (owner approval: it downloads and rebuilds). In
   `~/chromium-android/src`: `git fetch --depth 1 origin <revision>`, `git checkout FETCH_HEAD`,
   then `gclient sync -D --no-history` (see `chromium/android/server/README.md`).
3. **Refresh the pin** from a checkout of this repository on the server:
   `python3 chromium/tools/refresh-upstream.py --lane android --src ~/chromium-android/src --version <x.y.z.w>`
   - Exit 1: a pinned file no longer exists upstream. Find where it moved, update the patch and
     `chromium/upstream-android/manifest.json` by hand, then run it again.
   - Exit 3: a patch no longer applies. Rebase that patch against the new file in
     `chromium/upstream-android/`, then `refresh-upstream.py --lane android --patched-only`.
     Add the patch to the row's `patchesConflicted`.
4. **Check the patch set:** `python3 chromium/tools/check-patches.py --lane android`.
5. **Apply and build:** `apply.py --lane android --apply` into the server tree, then the debug
   builds (`out/AndroidDebug`, `out/AndroidDebugX64`) and the release build
   (`chromium/android/server/release-build.sh`).
6. **Gates:** the A5c gate split across both emulators
   (`chromium/tests/android/split-gate.sh a5c-gate.sh`) and `release-gate.sh` on the release APK.
7. **PR:** one PR with the pin, the rebased patches and the ledger row. Record `finishedAt` and
   `hours` when it merges. A missed clock also goes in `chromium/STATUS.md` with its reason;
   two misses in a quarter open the kill-criteria review (§8.4).
