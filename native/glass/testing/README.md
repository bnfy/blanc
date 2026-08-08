# Liquid Glass spike — validation harnesses

Every measured claim in PR #74 was produced by one of these. They are the
reproduction, not polished tests: each launches Blanc through Playwright's
`_electron` with `BLANC_TEST=1 BLANC_GLASS=1`, drives the real IPC surface via
`globalThis.__blanc`, and asserts on real geometry.

Parked here so the findings can be re-derived if this direction resumes. They
are **not** wired into `npm test` and are macOS-26-only.

## Prerequisites

The native addon must be built against Electron's ABI first — it is not built
by `npm install`, and `native/glass/build/` is gitignored:

```
cd native/glass
npx node-gyp rebuild \
  --target=$(node -p "require('../../package.json').devDependencies.electron.replace('^','')") \
  --arch=arm64 --dist-url=https://electronjs.org/headers
```

Run each harness from the repo root with `node <path> [outDir]`.

## What each one establishes

| script | question it answers |
|---|---|
| `backdrop-probe.mjs` | Does CSS `backdrop-filter` cross the `WebContentsView` boundary? (Yes — with an in-document positive control alongside.) |
| `native-glass-test.mjs` | Does `NSGlassEffectView` sample the Chromium-composited page? Scrolls the page under a stationary window and compares pill pixels. Also the falsification run: `BLANC_GLASS_Z=bottom` drops the glass to the bottom of the subview list and renders identically, proving NSView order does not stack against Chromium content. |
| `crosswindow-test.mjs` | Does a transparent child window composite *above* the parent's glass, and does its lifecycle hold? 9 checks: parenting, DOM interaction, keyboard, move, resize, fullscreen, app deactivation. |
| `phase2.mjs` | The real island split across windows — 16 checks through the shipping IPC path: ⌘L → panel → typing → navigation, Escape/blur dismissal, glass tracking the panel and returning to the pill, address-bar focus reclaim, full window lifecycle. |
| `harden.mjs` | The three bounds decisions — tight resting island (traffic lights clear), tight panel/find vs full-window palette, utility sheet hiding glass + island. Plus permission prompting and Spaces. |
| `dump.mjs` | Diagnostic: prints the parent window's real AppKit subview tree via the addon's `describe()`. This is what revealed that ordering was not the problem. |

## Known harness limitations

- **Screenshots.** Several runs used `screencapture -R`, which needs Screen
  Recording permission for the terminal. That permission was revoked mid-session
  once; when it fails the message is `could not create image from rect` and the
  fix is System Settings → Privacy & Security → Screen & System Audio Recording.
  The behavioural assertions do not depend on screenshots.
- **Single display.** `harden.mjs` reports multi-display / mixed-scale as
  UNTESTABLE when only one screen is attached. Re-run it with an external
  monitor at a different scale factor — that is the largest unverified risk in
  the migration plan.
- **Assertion pitfalls found the hard way.** The pill's width changes with the
  domain string, so compare the glass against the *live* pill, not an earlier
  capture. The permission bar is narrower than the pill and stacks below it, so
  the host grows in height, not width. Both produced false failures first.
