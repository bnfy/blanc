# Arc rich test setup — October 24, 2026

Built the three `Blanc Test` Spaces through Arc's native UI on the Mac, following `docs/testing/arc-rich-test-setup.md`. No direct writes to Arc's sidebar JSON were used.

- **Blanc Test Nesting:** 13 web tabs, four folder levels, independent same-name sibling folders and identical paths, case-only folder names, nested-versus-literal slash collision, long names, empty folders and Today tabs.
- **Blanc Test Splits:** 18 web tabs, six splits (four two-pane, one three-pane and one four-pane), including loose pinned, folder-contained, nested-folder and Today splits. A native Easel supplies the non-web item after the Today tab.
- **Blanc Test Profile:** three web tabs and one Favorite in the separate **Blanc Test** Arc profile.

Total: **35 web items including the Favorite**, plus one non-web Easel. Distinct paths follow the checklist, including the deliberate repeated `example.com/r1` across two Spaces.

## Verification

The checker ran against Arc's saved sidebar and passed all expected names, profiles, paths, folder structure, sections and ordering:

```text
Sidebar: 7 Spaces (3 test, 4 other, not inspected)
The test setup matches docs/testing/arc-rich-test-setup.md exactly.
```

(That was the checker's success line at the time. After the October 24 review it reads "No differences from docs/testing/arc-rich-test-setup.md in the parts this check compares", because the check never compared query strings, stray custom names or the kind of the non-web item; the checklist now lists what it compares.)

The checker needed one correction: matching profile markers with `JSON.stringify` rejected equivalent objects whose keys appeared in different orders. It now uses `isDeepStrictEqual`. A synthetic regression check confirmed that reordered keys pass, a different machine/profile marker fails, and Today-before-Pinned section ordering passes. JavaScript syntax validation passed.

The checklist now explicitly accepts an Easel for the non-web item. Arc's command palette offered **New Easel**, but no **New Note** command. This is an Easel, not evidence of current Note creation support.

## Earlier QA setup and privacy

The three earlier `Blanc QA` Spaces remain as supplementary cases, including two long names with the same first 40 characters and duplicate URLs with different titles. They do not replace the checklist setup. Their 19 tabs used 18 distinct full URLs that differed only by query or fragment; all had the same pathname. (They were visible in the earlier native export, which has since been deleted; see below.) The checker intentionally ignores queries and fragments, so they were unsuitable substitutes for the checklist's distinct paths.

The earlier full before/after sidebar copies and native export in `/private/tmp/blanc-arc-rich-test-2026-10-24/` were removed after the corrected setup passed. No raw Arc IDs or original browsing contents are recorded here.

This pass verifies setup construction and the checker only. A fresh export comparison for the 35-item setup, cross-computer ID comparisons, Windows verification and end-to-end import into the released Blanc remain to be performed. Today items remain subject to Arc's configured auto-archive interval. The test Spaces have been left in Arc for those checks.
