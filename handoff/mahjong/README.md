# Mahjong handoff

Continue product work from [PR #931](https://github.com/bnfy/blanc/pull/931). This branch preserves the working files and visual evidence from the Codex session as of PR commit `f5f597cdd`.

- The root `design-qa.md` preserves the local QA notes, including earlier iterations. Use the November 12 section for the final crop comparison from this session.
- The two root `output-mahjong-*.png` captures and the 18 intermediate numeral and motif PNGs retain their original worktree paths.
- The 63 `output/playwright/mahjong-*.png` captures retain their original paths so the QA references can be opened.
- `handoff/mahjong/mahjong-tile-crops.zip` contains the supplied original tile crops and contact sheets. The four `mahjong-2026-11-12-*.png` files show the live board, before and after, close-ups, and the three-theme asset sheet.
- `handoff/mahjong/generated/` contains the session’s original generated numeral studies and board mockups. `handoff/mahjong/references/` contains the reported board screenshot used in the final comparison.

The source sheets and numeral master used by the current asset generator are under `assets/mahjong/` on the PR. Electron 45.2.1 is pinned in the lockfile. Run `npm ci` before launching Blanc from a fresh checkout.
