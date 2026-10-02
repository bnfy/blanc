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

The desktop branch was rebased onto fresh origin/main b83393a8 before the
additional owner-requested tint work. Help/onboarding remain intact.

The Island now follows wallpaper fades and post-load page changes. Each
window owns a single-flight controller: two rendered top-edge pixel rows,
80 ms minimum spacing while changing, and a one-second fallback when stable
for CSSOM/canvas changes that do not mutate the DOM. Isolated preload
notifications are empty markers, coalesced to at most ten per second; main
accepts only its owned active main frame. Pages receive no new browser API,
color input or pixels. The trusted chrome receives a small color-only event
to avoid repeated tab UI rebuilds. Samples stay in memory and are neither
persisted nor transmitted. Private tabs and internal utility pages retain
their untinted theme; background, hidden/minimized and closed windows stop
sampling. Identity, navigation epoch, active view and generation checks
discard stale captures; activation and theme changes resume sampling.

Validation on the source preview: 2,023 unit tests, lint and substrate checks,
ten Settings/theming/onboarding acceptance scenarios (72 steps), the Help
smoke, existing wallpaper smoke (48 layout/theme/phase combinations and 60
responsive placement checks), and the new page-tint smoke. The latter checks
actual intermediate colors in a two-second wallpaper fade, live DOM and
CSSOM colors, scroll, stable backoff, private/background/hidden exclusions,
window routing, navigation/switch/close races, and absence of a website bridge.
Its disposable renderers disable background throttling so automation-host
occlusion cannot stall frame observations; no shipping preference changed.
Source inventory hashes/channels were refreshed for the new boundaries; this
is scoped implementation evidence, not completion of the independent audit.

Earlier Windows/Linux candidate run 37044861852 belongs to the superseded
65a202eae4576d795de35df216599cb9c1dff4e2 commit and does not validate this tint
change. New private native candidates, affected-machine confirmation, and
the normal release gates remain required before merge or public shipping.
