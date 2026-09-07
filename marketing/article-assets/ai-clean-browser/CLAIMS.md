# Claim record — AI clean browser article assets

Checked against the public `v1.9.1` tag on August 27, 2026. Re-run the gate in
`docs/marketing-claims.md` before publishing these assets with a later release.

## Final copy

| Wording | Type | Evidence and qualification | Verdict |
| --- | --- | --- | --- |
| “a clean workspace shouldn't be an AI exclusive.” | Editorial opinion | Does not claim that Blanc ships AI or understands work. | qualified |
| “user-directed groups and Patron workspaces. no AI required.” | Blanc capability | `v1.9.1:src/main/main.js` implements explicit tab grouping and persisted group IDs. `v1.9.1:src/renderer/overlay.js` exposes the user-directed group/workspace controls and identifies workspace creation as Patron-gated. | verified |
| “unfinished context.” | Editorial characterization | Describes the article's view of open tabs, not automatic Blanc behavior. | qualified |
| “you name the groups. blanc keeps them together.” | Blanc capability | `v1.9.1:src/main/main.js` exposes `/group <name>`, stores `groupId`, and persists `groups` plus parallel `groupIds`; no inference or automatic grouping is claimed. | verified |

Rejected drafts remain absent from every output: “the browser should understand
the assignment” and “blanc sees context.” They implied semantic understanding
that Blanc does not provide.

## UI and image provenance

- `expanded-source.jpeg` and `resting-clean-source.jpeg` are the unaltered UI
  capture inputs. `compose.py` only crops, scales, rounds, and shadows them.
  Their visible strings match the public tag at
  `v1.9.1:src/renderer/overlay.html` and
  `v1.9.1:src/renderer/renderer.js`.
- `generated-backdrop.png` is decorative. It does not depict product controls
  or behavior.
- Source SHA-256 values:
  - `expanded-source.jpeg`: `c5bcc810a75f0809118757ffa2f2749e28764ebaa0d8bd80c6a1f93104492b21`
  - `resting-clean-source.jpeg`: `40a960d55c4c3ce94192ce83bf1dfabe1cc4c46db9f4aa6cf96608d200241bdd`
  - `generated-backdrop.png`: `9841067f9609682ebb7cb024a139676bf4954febbd97ae7e6d3f163c2c15741a`

## Outputs

Run `python3 compose.py` from this directory. It writes:

- `ai-clean-workspace-header-5x2.jpg`
- `ai-clean-workspace-cover-3x2.jpg`
- `tabs-are-unfinished-context.jpg`
