# Extensions picker Store search — October 20, 2026

Typing filters installed extensions and adds an explicit Chrome Web Store search option. Arrow keys select it; Enter or click opens the encoded query in a native Blanc tab. Empty queries do not add a search row. Existing installed-extension activation remains unchanged. Text is inserted with textContent.

Validation: syntax and scoped ESLint pass. A DOM-stub behavioral probe passed encoded navigation (spaces, &, / and #), installed filtering, keyboard selection and empty-query handling. The first probe lacked scrollIntoView in its stub; corrected probe passed. This is automated logic coverage, not native input or fresh installation acceptance. Existing Store installation and permission handlers were not changed. Assets regenerated with --assets-only; no compile. Physical input and fresh Store search/install walkthrough remain pending.
