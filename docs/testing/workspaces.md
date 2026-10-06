# Workspace regression tests

Run `npm run test:workspaces:desktop` for the runnable F41 scenarios. On
headless Linux, use `xvfb-run -a npm run test:workspaces:desktop` after the
repository's disposable-runner sandbox setup. `npm run test:acceptance:dry`
checks their step bindings. The parity workflow runs Workspace scenarios on
macOS, Windows and Linux.

The added lifecycle cases cover:

- A real form POST, response document identity, unsaved edits, sessionStorage
  and navigation history across a same-process Workspace round trip. Request
  counters reject a repeated POST or a replacement GET. Durable stores must
  not contain the fixture's POST body, response text or draft state.
- Cross-origin fixture sign-in using both native popup and managed-tab opener
  families. A Workspace switch, including an invalid forced attempt, must be
  refused while the family is active. The callback must still reach the
  original opener, and switching must work after the child closes.

These are deterministic local fixtures, not certifications for live identity
providers. They use fake data and no real accounts or credentials.

## Packaged quit/restart and recovery

Set `BLANC_PACKAGED_EXECUTABLE` to the packaged executable, then run
`npm run test:packaged:workspaces`. The default path is the local macOS arm64
build. The app must match the branch's version and locked Electron runtime.

The smoke creates a disposable profile before launch, disables usage
measurement and search suggestions, and uses the existing production chrome
and Settings projections over Chromium CDP. No main-process inspector,
test-hook IPC, sandbox exception or personal profile is used. A fixture-only
local Patron record allows creation without contacting the billing service.

It creates a Workspace through production IPC rather than seeding a binding,
then verifies three successful process exits and fresh launches: durable
binding, group/pin metadata (including pending capture changes at quit),
selected tab, private-tab exclusion, quiet restored pages, one load on wake,
and Recently Deleted recovery after a restart.
`Browser.close` requests graceful quit; a signalled or nonzero exit cannot
count as success. This is automated process-lifecycle coverage, not a claim
about native menu clicks or an updater Restart Now handoff.

The existing signed macOS release gate and Windows/Linux native packaging
workflow run this smoke for future packages. Windows/Linux execution results
must come from their actual jobs, not from a macOS run. No release is created
or published merely by running these tests.

Live DOM, form values and POST bodies are not promised to survive quitting.
The same-process preservation cases and durable URL/group recovery cases are
deliberately separate.
