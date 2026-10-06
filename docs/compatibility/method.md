# Compatibility evidence method

Blanc publishes compatibility as versioned evidence, not as an unqualified claim
that every website works. `manifest.json` is the source of truth and
`README.md` is generated from it.

## Collection

Each platform-specific scenario has a stable ID and records the exact public version and source
SHA, operating system and architecture, expected behavior, result, evidence
date, commit-pinned evidence references, and classification. There must be a row
for each required category on macOS arm64, macOS x64, Windows x64 and Linux x64.
A missing result is explicitly `not-run`, not inferred from another platform.
Testers use clean or documented
profiles, record the packaged app version before a run, and avoid collecting
credentials, page content, account values, URLs, or browsing history.

Automated evidence may be reused only when it exercises the stated behavior on
the named release and platform. A unit test can support a `partial` result, but
it cannot by itself turn a packaged website flow into a `pass`. Synthetic camera
and microphone tracks do not establish physical-device or OS-consent behavior.
Capture tests do not establish playback, display sharing or system audio.
Manual evidence
must record the scenario ID, package identity, platform, date, and outcome in a
private test log; only the aggregate result and approved notes are published.

## Publication rules

- `pass` requires direct, release-tagged evidence for the whole stated scenario.
- `partial` identifies exactly what was and was not exercised.
- `unsupported` is stated without euphemism or an implied commitment.
- `blocked` names the environmental or third-party blocker.
- `not-run` is the default when current evidence does not exist.

A failure is classified before work begins. `defect` means shipped behavior
contradicts the stated expectation. `product-decision` and
`unsupported-capability` do not authorize implementation. Evidence-backed
issues need reproduction steps and acceptance criteria, and still follow the
normal product and owner-review gates.

## Release and evidence binding

Schema version 2 binds the release tag to its full Git commit and the version
inside that commit's `package.json`. A committed publication JSON record must
name the same version, tag, `sourceSHA` and publication timestamp.

Each evidence reference contains a repository `path`, full `commit` and
`kind`: `source`, `execution` or `decision`. Source references must use the
release commit. Execution records may be added after publication, but must
descend from that release and explicitly identify its version and SHA.
`pass` and `partial` require both source and execution references. The checker
reads Git objects, not mutable local copies, and renders pinned GitHub links.
It cannot judge whether prose proves a scenario: human review must check the
test scope, actual execution, package/platform identity and limitations.

Evidence dates for `not-run` and `unsupported` describe the review date.
Execution dates and publication timestamps may differ by timezone; the matrix
uses calendar dates and the pinned record retains exact timestamps.

Keep earlier release manifests and generated matrices unchanged under
`releases/<tag>/`. They are historical records, not current results.

Run `npm run compatibility:build` after a manifest change and
`npm run compatibility:check` in CI. The check rejects unknown result values,
missing category/platform rows, invalid dates, stale generated Markdown,
arbitrary URLs, unsafe or missing committed paths, unpinned commits, mismatched
release identities, and `pass` or `partial` rows without source and execution
evidence. Review the finished matrix before publishing it.
