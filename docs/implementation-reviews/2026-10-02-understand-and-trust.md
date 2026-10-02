# Desktop review — make Blanc easier to understand and trust

Prepared from fresh `origin/main` at `5b8fa03bda00cbd7fbcafba16384e63c7e85ff9a`
on `codex/blanc-trust-app`. The original dirty checkout was not changed.

Settings Help now shows the running Blanc/Electron/Chromium versions,
platform and architecture, with plain whole-app update/restart wording and
links to source, privacy, release notes and How Blanc works. Its new update
bridge is Settings-only at the exact-host/session/frame/owned-surface guard
and uses the existing manual updater through sender-derived window runtime.
No updater behavior, runtime, security control or privacy default changed.

Onboarding retains both fresh optional choices on and existing saved choices.
It names Cloudflare/Google and search-provider recipients, data categories,
the save-before-send boundary and pseudonymous measurement. Known blocking
is qualified. Help describes connections without presenting a live monitor.

Validation: all 1,985 unit tests, lint and substrate checks; 10 Settings and
onboarding desktop acceptance scenarios / 45 steps; and the disposable-profile
`node test/desktop/settings-help-smoke.mjs` checks actual running build data,
the existing manual updater dialog, fresh defaults, replayed saved choices,
and absence of the bridge on an ordinary website. Guard unit tests reject
other hosts, subframes and unowned surfaces and distinguish window runtimes.

This is an unreleased source preview. Website deployment must precede
shipping its new explanation links. Windows/Linux candidates, affected-machine
confirmation and ordinary release/updater gates remain required; no previous
release’s physical-machine evidence or waiver is carried forward.
