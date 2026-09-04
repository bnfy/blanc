# Contributing to Blanc

Public contributions are welcome: bug reports, documentation corrections,
tests, and focused code changes. Start a [GitHub issue](https://github.com/bnfy/blanc/issues)
before a large feature or architectural change so we can discuss scope.

## Reports and questions

For a bug, use the bug-report template and include the Blanc version, operating
system, steps to reproduce, expected behavior, and actual behavior. For a
feature request, describe the problem and the smallest useful outcome. Keep
credentials, browsing history, and other private data out of public reports.

Report suspected vulnerabilities privately using [SECURITY.md](SECURITY.md),
not the public issue tracker. Installation and account questions can go to
support@blancbrowser.com.

## Development setup

Use Node.js 22 and npm, matching CI. Fork the repository, clone your fork,
and create a branch for the change. From the repository root:

```sh
npm ci
npm start
```

Development runs use a separate profile and do not send usage events. See the
[README](README.md) for architecture, commands, and keyboard shortcuts, and
[AGENTS.md](AGENTS.md) for detailed engineering and release constraints.
The website source and its build scripts live in `site/`.

## Changes and validation

Keep each pull request focused. Explain the behavior being changed, include
reproduction steps where useful, and add regression coverage for behavior or
security fixes. Report the checks actually run and any remaining platform
limitations. Do not mark an unperformed check as passed.

The common local checks are:

```sh
npm run test:unit
npm run substrate:check
npm run test:acceptance:dry
```

There is no generic `npm test` command or configured linter. The acceptance
dry run checks step wiring; it does not exercise the desktop. For desktop
behavior changes, also run `npm run test:acceptance:desktop` on a machine with
a graphical session. OAuth changes have `npm run test:oauth:desktop`. Explain
which affected platforms you tested; a macOS run does not prove Windows or
Linux behavior.

For website changes, run `npm ci --prefix site` and `npm run site:build`.
For dependency changes, commit the corresponding lockfile and run
`npm run compliance:build` followed by `npm run compliance:check`; include
updated generated compliance files. Do not hand-edit generated inventories.
For other generated assets, use the relevant build/check commands documented
in AGENTS.md and package.json.

## Pull requests and review

Open a pull request against `main` and link any relevant issue. Summarize the
problem, the resulting behavior, and validation. Screenshots are useful for
visual changes; redact private information. The maintainer reviews scope,
correctness, tests, and compatibility and may request changes before merging.
An automated review or passing CI is not an independent human approval.

Release timing is controlled by the maintainer. During a launch freeze, work
may remain in a draft pull request even with passing checks. Do not publish
releases, overwrite existing release assets, change signing identities, or
deploy the official website as part of an ordinary contribution. Packaging
and public releases have separate gates in
[release verification](docs/release-verification.md).

## Licensing and conduct

Submit only material you have the right to contribute. Contributions to
Bananify Creative-owned software use the repository's [MIT License](LICENSE);
third-party files retain their existing terms. Preserve notices and consult
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and
[ASSET-LICENSE.md](ASSET-LICENSE.md). The Blanc name and identity artwork remain
reserved; the software license does not grant trademark rights.

Keep discussion respectful and focused on the work. Explain disagreements
with evidence, avoid personal attacks, and respect contributors' privacy.
