# Compatibility evidence method

Blanc publishes compatibility as versioned evidence, not as an unqualified claim
that every website works. `manifest.json` is the source of truth and
`README.md` is generated from it.

## Collection

Each scenario has a stable ID and records the exact public version and source
SHA, operating system and architecture, expected behavior, result, evidence
date, evidence references, and classification. Testers use clean or documented
profiles, record the packaged app version before a run, and avoid collecting
credentials, page content, account values, URLs, or browsing history.

Automated evidence may be reused only when it exercises the stated behavior on
the named release and platform. A unit test can support a `partial` result, but
it cannot by itself turn a packaged website flow into a `pass`. Manual evidence
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

Run `npm run compatibility:build` after an approved manifest change and
`npm run compatibility:check` in CI. The check rejects unknown result values,
missing required categories, stale generated Markdown, missing local evidence
references, and `pass` or `partial` rows with no evidence.
