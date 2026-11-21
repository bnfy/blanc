# Chromium158 rebase source bundle

This records the exact source modifications used by the completed158.0.8127.2 native build. It preserves the separate157 fallback and does not change the default prepare.mjs target.

`tracked.patch` is the complete binary-capable diff against upstream681cd621e82e606d7536eae8ea2576afb3c7d65c. `added/` contains the23additional source files under their Chromium-relative paths. The manifest binds every member by SHA256. The durable completed snapshot was independently matched to the native checkout before these files were copied here.

For an explicitly authorized new preparation, first check out exactly the pinned upstream revision and its matching dependencies in an isolated source directory. Check and apply tracked.patch with git apply, then copy the added files to those relative paths without replacing unrelated content. Verify every manifest digest. This bundle does not authorize fetching, hooks, replacing caches, toolchain changes or compilation. Inspect the fresh guarded dry run before any new build; reuse the already completed output for current qualification.

The native build required158API adaptations for self-deleting DocumentService ownership and the app-menu delegate/foreground-tab enum, plus in-checkout TypeScript buffer resolution. See the dated staging evidence for failed attempts, narrow repairs and successful object checks. The full patch also contains inherited157protection/session/UI work; its size is not the incremental158repair size.

Build receipts and affected-check evidence live in ../../evidence/chromium158-staging-20261028. The successful real-keychain follow-up does not establish the root cause of the prior stall. Developer ID/notarized158qualification and original L12 prerequisites remain outstanding. This is not permission to publish, merge or replace the signed157fallback.
