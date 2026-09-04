# JavaScript warning gate

Run `npm ci` followed by `npm run lint` on Node.js 22.13 or later in the Node 22 line. The parity workflow runs the same command before unit tests. ESLint and its rule/global packages are exact-pinned development dependencies; the runtime dependency tree and runtime SBOM are unchanged.

The gate uses ESLint recommended correctness rules on first-party `src/**/*.js` and `cloudflare/**/src/**/*.js`. Warnings fail the command. It checks issues such as undefined identifiers, reassignment of constants, duplicate conditions/keys, invalid regular expressions and unsafe control flow. It does not cover Astro templates, native code, third-party dependencies or test fixtures, and does not replace CodeQL or platform tests.

## Reviewed configuration choices

Unused variables and useless assignments are excluded from this first correctness gate. Existing callback signatures, browser entrypoints, defensive initialization and explicit credential-reference clearing need separate dead-code analysis; they are not silently auto-fixed. Empty catch bodies are allowed because optional APIs and destroyed WebContents require best-effort fallback; empty non-catch blocks remain errors.

Browser globals are declared for renderers/preloads and the two modules that serialize browser functions for isolated execution. The control-character-regex rule is disabled only for the credential-picker and newsletter modules, where the expressions deliberately remove control characters from untrusted display text.

The initial 44 findings were reviewed: 20 empty catches, 14 unused assignments, eight browser-global references and two control-removal regexes. No behavior defect was established in that set; no runtime code was changed to satisfy lint. Deliberate undefined-name, constant-reassignment and duplicate-condition probes were rejected by the final configuration.

This is a draft gate based on dependency-fix PR #284. OpenSSF warnings criteria must not be marked met until the gate is merged and enforced on the authoritative branch. This does not claim maximally strict linting, complete code coverage or an earned badge.
