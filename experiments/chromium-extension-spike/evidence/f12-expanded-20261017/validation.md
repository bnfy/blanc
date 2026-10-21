# Validation

- `node --test fixtures/replay/synthetic/*-test.mjs fixtures/replay/pipeline/*-test.mjs` (paths under this experiment): **48 passed**. See `tests.tap`.
- `python3 fixtures/replay/validate-test.py`: **15 passed**. The earlier unittest discovery command found zero tests; it is not counted as a pass.
- Targeted recommended ESLint rules: 16 synthetic modules (including CJS), 10 pipeline modules; zero errors/warnings. As in the earlier harness checks, unused-variable and preserve-caught-error rules are disabled; correctness rules remain enabled.
- `git diff --check`: clean before commit.
- All compressed/original evidence hashes verified; final runtime module hashes verified against source or the explicitly retained comment-only predecessor (`source-verification.json`).
- Real browser TLS positive/negative controls pass; no unpinned HTTP arrival.
- Electron full and no-referrer regular/private pairs stable; Chromium full negative control completed twice per profile. These are automated checks, not physical keyboard/mouse tests or native blocker acceptance.
- No native build or upstream patch was made; patch budget was not remeasured in this checkpoint.
