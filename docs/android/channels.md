# Blanc for Android: betas and stable on Google Play

How Blanc for Android keeps shipping betas once a stable version is on Play's production track,
and how a beta becomes the next stable. The plan and its reasons are in
`docs/superpowers/plans/2026-11-23-android-beta-train.md` (decisions D1–D8, Claude's calls of
2026-11-23 for the owner to check). The release tool's stages are in [release.md](release.md), and
moving to a new Chrome stable is in [rebase.md](rebase.md).

## The rules

- **One app, several tracks.** `me.bnfy.blanc` is the only package. Betas go to a testing track
  and stable goes to production. Beta and stable can't be installed side by side. A second package
  would be a new app on a personal Play account, with its own 12-testers-for-14-days rule, listing,
  Data safety and declarations.
- **Betas carry Blanc's new work first, on the same Chrome stable as production.** No Android
  build follows Chrome Beta. A Chrome stable rebase lands on `main` once and reaches both channels.
- **Names and codes.**
  - Stable is `MAJOR.MINOR.PATCH` (`1.0.0`, `1.1.0`, `1.1.1`).
  - A beta is named after the stable it leads to: `1.1.0-beta.1`, `1.1.0-beta.2`, and so on.
  - Every build takes the next version code from `chromium/android/release/ledger.json`, so each
    upload is above every earlier one. Tags stay `android-v<name>-<code>`.
  - A stable release is a **new build of the soaked beta's commit under the stable name**, with a
    new code. The beta bundle is never promoted, because Play shows the version name to everyone.
  - Testers receive each stable build (its code is higher) until the next beta arrives.
- **Owner approval per action.** Every upload, promotion and rollout step is the owner typing its
  exact phrase in a foreground Terminal on the Mac. The upload key and the Play credential stay in
  1Password.
- **The desktop lane comes first on the build server.** The Android nightly runs only between
  midnight and 03:15 US Eastern, and never while the desktop checkout is locked or a Siso build
  runs.
- **Notes are claims.** Release notes for `alpha`, `beta` and `production` are approved by the
  owner first ([`docs/marketing-claims.md`](../marketing-claims.md)). They are en-US, 1–500
  characters (Play's limit), and kept as a file in the release's `WORK` folder.

## Tracks

| Phase | Betas | Stable |
|---|---|---|
| Until production access | `internal`, then closed testing (`alpha`, the signup list) | none yet |
| After production access | open testing (`beta`) | `production`, staged |

When production access is granted, betas move to open testing and closed testing is retired. The
signup list gets the open-testing link once, in an email the owner approves. The `/android-beta`
page changes in its own website-only PR.

## Every night

The build server builds `main`'s Android lane and runs the release gate on it
(`chromium/android/server/README.md`, "The nightly"). Each night is recorded in
`~/blanc-evidence/android/nightly/<stamp>/result.json`. `LAST-PASS` names the newest passing
night, and its `sourceCommit` is the commit a beta starts from.

## The weekly beta

At most twice a week, normally on Tuesday, and only when the Android lane changed since the last
beta:

1. Read `LAST-PASS` on the server. Its `sourceCommit` is the beta's commit.
2. Pick the name: the next `X.Y.Z-beta.K` for the stable it leads to. Tag
   `android-v<name>-<code>` at that commit, with the code `ledger.json` gives next.
3. On the server, run `release-build.sh TAG --previous-map "$(cat ~/chromium-android/.blanc-applied-commit)" --gates`,
   then run the release gate, the packet capture and the licence handoff as before
   ([release.md](release.md)).
4. On the Mac, write `WORK/config.json` with `"track": "alpha"` (`"beta"` after production access)
   and `"notes": "release-notes.txt"`, both **before `fetch`**, because the stages bind the config
   from then on. Put the owner-approved notes in `WORK/release-notes.txt`.
5. Have the owner run `status`, `fetch`, `verify`, `sign`, `attest` and `upload`. The upload asks
   for `upload 1.1.0-beta.1 (7) to alpha`.
6. Commit the ledger (the row is now `uploaded`, with its `published` entry) and merge it before
   the next tag.

## The stable release, every four weeks

1. **Soak check.** The candidate is a beta that spent 7 days on the testing track with:
   - no regression report from testers;
   - no rise in the crash rate in Play Console's Android vitals, compared with the last stable.
2. **Build.** Build the stable name from the same commit: tag `android-v1.1.0-<code>`, then the
   server build and gates as above.
3. **Upload.** Use `config.json` `"track": "production"`, `"rollout": 10` and `"notes"`. The phrase
   is `upload 1.1.0 (9) to production at 10%`.
4. **Roll out.** Two days later, check Android vitals again and run `release.mjs rollout WORK 50`
   (phrase `roll out 1.1.0 (9) to 50%`). Two days after that, run `release.mjs rollout WORK complete`.
   - A crash report or a vitals rise stops it: run `release.mjs rollout WORK halt`.
   - A halted rollout resumes at the same or a higher percentage once the cause is understood.
5. Commit the ledger after each step.

A stable build that went to `internal` first moves to production with
`release.mjs promote WORK production 10`.

## Security releases

`.github/workflows/android-stable-watch.yml` checks Chrome stable for Android every day. When it
moves past the lane's pin, the workflow opens one issue labeled `android-security-clock`. The
issue names the due date:

- **7 days** from the first newer stable;
- **72 hours** when Google's post for that build says an exploit exists in the wild.

To ship it:

1. Rebase with [rebase.md](rebase.md) and merge the PR.
2. Build the patch release `X.Y.(Z+1)` from it.
3. Upload it to production.
   - Normally at 20%, then `rollout WORK complete` within the clock.
   - When exploited in the wild, go straight to `"rollout": "complete"`.
4. The rebase is on `main`, so the next beta carries it too.

A missed clock goes in `chromium/STATUS.md` with its reason. Two misses in a quarter open the
kill-criteria review (design §8.4). The issue closes itself when the pin reaches that version.

## Before production access

- Play requires 12 testers opted in to the closed test for 14 days in a row. Play Console shows the
  count under Dashboard → Production. After that, the owner applies for production access.
- The owner grants the service account `blanc-play-upload@…` **Release to production** for Blanc in
  Play Console → Users and permissions. Until then, production uploads fail with a Play error and
  nothing is recorded.
- The first stable is `1.0.0`, built from the last `1.0.0-beta.K` that passed its soak.

## Where each build is

Every upload, promotion and rollout change appends to the build's `published` list in
`ledger.json`: `{track, status, fraction?, date, editId}`. The newest build whose last production
entry isn't `halted` is what production users get. The tool refuses to send an older build to a
testing track, because its testers would silently get production's higher code instead.
