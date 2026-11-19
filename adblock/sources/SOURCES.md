# Filter List Sources

Pinned snapshots, committed verbatim. Run `npm run adblock:build` after updating.

| List | Upstream URL | Pinned | SHA-256 |
|------|-------------|--------|---------|
| EasyList | https://easylist.to/easylist/easylist.txt | 2026-07-09 | `ceac7bd34d538ad448f05a7237b600485f2185a620d8ce32f77ae7365e1e662b` |
| EasyPrivacy | https://easylist.to/easylist/easyprivacy.txt | 2026-07-09 | `5b69cbb6958485b5688e76bf2a43a548acaa5cc57380aed7d3dc800da7e0bf6b` |
| Ghostery resources | Ghostery adblocker commit `6f0610bf5eec1f31c4975ce0e707cdf47023e5b5` | @ghostery/adblocker-electron 2.20.3 | `5ce0ce483f0e5514308ccb0240960a9dd7bfeab417debeef96960dce2c95f690` |

Desktop and mobile both consume these committed snapshots. Desktop verifies
the manifest before parsing and never downloads executable filter resources at
runtime. The desktop seed is compiled from these same bytes; startup checks a
valid user cache, the verified packaged seed, and finally recompiles these
verified bundled inputs without a network fallback. Updating any input requires
updating `pinned.json`, rebuilding generated output, and shipping a new signed
release.
