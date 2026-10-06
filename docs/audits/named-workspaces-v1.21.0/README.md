# Named Workspaces audit — public v1.21.0

Status: in progress. This audit is pinned to public tag `v1.21.0` at
`159f274de47ffb32412420ae241d6337a416d0da`. The September 13 report is a
regression seed, not current defect evidence.

No current-release defect is recorded here until it is reproduced against the
public build. A source or automated pass can close an automated check, but it
does not stand in for installed-package behavior where the scenario depends on
window lifecycle, signing, operating-system prompts, or native storage.

## Promise under test

Named Workspaces are user-created, device-local, profile-scoped saved sets of
ordinary tabs and Named Groups. Switching can replace the current window's set.
Private tabs are excluded; existing workspaces stay usable if Patron lapses;
live views are preserved only where the implementation can do so safely; a
durable save must finish before success is shown. Blanc does not promise exact
recovery of every live page state.

## Scenario matrix

| Area | Required scenario | Current evidence state | Finding class |
| --- | --- | --- | --- |
| F41 regression seed | Re-run all public Workspace acceptance scenarios | 11/11 F41 scenarios passed in the 163-scenario desktop run on September 22; installed public-build confirmation pending | no defect in automated run |
| Dirty state | Changed controls survive or receive an accurate warning | F41-1 and F41-7 passed with live textarea identity and value preserved; installed public-build check pending | no defect in automated run |
| Before-unload | A page objection prevents a silent destructive switch | F41-1/F41-7 live-view path passed; explicit destructive objection on the installed public build remains pending | no defect in covered path |
| POST state | Switching does not claim exact recovery it cannot provide | installed public-build check pending | pending |
| Quiet tabs | Quiet snapshots restore within their documented bounds | F41-6 passed with group, pin, ownership, and quiet state retained | no defect in automated run |
| Opener families | OAuth and sign-in children remain with their initiating context | F41-6 covered inactive popup/auth/download denial; full sign-in family check pending | pending |
| Persistence failure | A failed durable write never reports a saved Workspace | F41-10 and unit failure-path coverage passed | no defect in automated run |
| Recovery/restart | A saved set returns after quit, recovery, and restart | installed public-build check pending | pending |
| Newer store | A future-format store fails safely without destructive rewrite | full unit suite passed future-file byte-preservation coverage | no defect in unit run |
| Same Workspace | Re-selecting or saving the current Workspace is unsurprising | F41-2 passed as a no-op without a private-tab warning | no defect in automated run |
| Cross-window ownership | One window cannot capture or mutate another's set | F41-7 and F41-9 passed; broader installed multi-window check pending | no defect in covered paths |
| Empty/private-only | Empty and private-only windows preserve private exclusion | F41-5, F41-9, and F41-11 passed | no defect in automated run |
| Keyboard | Focus, Escape, Return, and shortcuts remain deterministic | F41-3/F41-4 passed focus, selection, validation, and protected-decision checks | no defect in automated run |
| Minimum viewport | Controls and warnings remain reachable | F41-8 passed at 640×480 and 125% overlay zoom | no defect in automated run |
| Capacity | The 25-Workspace limit has accurate refusal and recovery copy | F41-8 rendered 25 reachable rows; explicit 26th-item refusal check remains pending | pending |

## Classification and remediation rule

Findings are classified as `data-loss risk`, `incorrect or misleading state`,
`usability friction`, or `no defect`. Only a reproduced v1.21.0 defect advances
to implementation. A remediation needs a narrow specification, unit coverage,
runnable acceptance coverage, failure-path testing, and validation on every
affected platform. Profile scoping, private-tab exclusion, Patron lapse
behavior, live-view preservation, and durable-save semantics are constraints,
not variables to relax.

Exit requires zero known critical data-loss failures and release-tagged evidence
for the promise above. This document must remain `in progress` until the exact
public build and required platform cases are complete.

## September 22 automated run

From the clean `codex/wave1-roadmap` worktree based on `origin/main`:

- `npm run test:acceptance:dry`: 163 scenarios / 984 steps wired;
- `npm run test:acceptance:desktop`: 163 scenarios / 984 steps passed,
  including F41-1 through F41-11;
- the complete unit suite passed after installing the locked root dependencies;
- lint, substrate (including compatibility drift), and the site/SEO build passed.

This evidence applies to the source worktree. Workspace production code is
unchanged from public v1.21.0, but the run is not labeled as an installed-public-
artifact pass. Exact packaged checks, POST-state coverage, full opener-family
coverage, restart/recovery, and the 26th-item refusal remain open.
