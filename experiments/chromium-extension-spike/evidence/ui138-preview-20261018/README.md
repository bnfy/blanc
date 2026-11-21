# Electron 1.38 UI preview — October 18, 2026 EDT

**Partial migration, ready for scoped user testing; not full 1.38 parity.** Reviewed
renderer source is `7f57544b85ab3eb3dbccdfd8273437e839d8fc54`. Overrides are retained
under `renderer-1.38/`, with per-file SHA-256 verification during preparation.
The paint module is unchanged apart from its CommonJS-to-browser wrapper.

## Measured

- Three guarded incremental builds: 40.03 s / 39.40 s / 45.06 s wrapper times (see invocation
  records for authoritative timing), six actual Siso steps each. Final dry-run
  guard zero. No cold output, GN argument, toolchain or 156 changes.
- Inventory remains **40 upstream files / 93 hunks**, within 40/120. New bridge
  work is in the existing Blanc-owned implementation; no upstream file added.
- 79 reviewed Electron tests plus one header-anchor regression pass against the copied drag, sections and paint
  modules; scoped lint reports four files, zero errors.
- Real native bridge: group create/color/rename, case-insensitive duplicate-name
  refusal, collapse/focus, new tab in group, ungroup, move group to a new window.
- Real native tab operations: new tab below; close above/below preserving pins.
  DOM context-menu event exposes these actions; tooltip bridge exercised.
- All four Start Page layout settings; preset/fill/style/wash changes; reload
  persistence. File chooser selected bundled sunrise-mark.png through Playwright,
  re-encoded it to JPEG, persisted across reload, then removed it. No physical
  mouse/keyboard claim. Sunrise/time-of-day source and preference agreement pass.
- Ordinary startup: both Island frames initialize, panel rows render in DOM,
  no bridge error banner. Disposable profile only.

## Differences and outstanding verification

- Vertical rail, Recently Closed, site-wide mute, Glance and Spaces remain
  unsupported. Follow-Space color is hidden; fixed presets work. This is not
  completion of the migration inventory or the tranche visual-comparison gate.
- Tab context menu currently exposes a bounded subset in trusted WebUI; it is
  not Electron's complete native menu. Chromium keeps groups contiguous and
  cannot group pinned tabs. Its persisted palette maps to the eight Blanc colors.
- Custom image supports PNG/JPEG/WebP up to 25 MiB input, resizes to 3840px,
  re-encodes JPEG without metadata, and limits stored data URL to 3 MiB. Storage
  is profile-local WebUI localStorage, not Electron's image-file/sync mechanism.
  Spaces/sync and full image-format/orientation/corruption coverage remain open.
- Physical input, private visual comparison, drag interaction and exact tooltip
  placement remain unverified. Native app inspection timed out. The host's CDP
  screenshot initially showed only the top region. After the native layout fix,
  the complete panel/group list renders and was visually inspected. Start Page
  color screenshot was also inspected, but no matched Electron comparison run.
- Failed harness attempts retained: initial CDP expression lacked async wrapper;
  first acceptance selected the wrong CDP New Tab URL; initial extracted test
  suite lacked i18n/closed-slot fixtures. Corrected repetitions pass.
- Latency remains deferred. Electron diagnostic build §8 remains unapproved
  and unstarted. F12, Task 0 upgrade and production/release gates unchanged.

`evidence.tar.gz` contains invocation logs, harnesses, assertions and reviewed
unit test inputs. `manifest.json` hashes every member and the archive; all hashes
were verified by reading the completed archive. Profiles and original user
images are not included. Test browser uses `/private/tmp/blanc-ui138-build/profile`.

## Header overlap correction

The 157 layout preparation used a broad presence marker already matched by the
separator customization, skipping the independent 68px header reservation. The
marker now identifies the actual layout block. Regression test confirms this
specific partial-patch state and idempotence. An incremental six-step build passes.
At unchanged 1200px width and 996px outer height, page inner height changes from
996 to 928: exactly 68px reserved. Final group/wallpaper and tab-action regressions
pass. No Start Page-only CSS spacer or website-specific layout special case.
