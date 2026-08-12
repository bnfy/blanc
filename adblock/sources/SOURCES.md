# Filter List Sources

Pinned snapshots, committed verbatim. Run `npm run adblock:build` after updating.

| List | Upstream URL | Pinned | SHA-256 |
|------|-------------|--------|---------|
| EasyList | https://easylist.to/easylist/easylist.txt | 2026-07-09 | `ceac7bd34d538ad448f05a7237b600485f2185a620d8ce32f77ae7365e1e662b` |
| EasyPrivacy | https://easylist.to/easylist/easyprivacy.txt | 2026-07-09 | `5b69cbb6958485b5688e76bf2a43a548acaa5cc57380aed7d3dc800da7e0bf6b` |

Desktop and mobile both consume these committed snapshots. Desktop verifies
the manifest before parsing and never downloads executable filter resources at
runtime. Updating a list requires updating its hash and the combined hash in
`pinned.json`, rebuilding generated output, and shipping a new signed release.
