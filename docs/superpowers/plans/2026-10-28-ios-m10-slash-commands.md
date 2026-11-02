# iOS M10: the shared slash commands — plan

**Spec:** `docs/superpowers/specs/2026-10-24-ios-v1-companion-release-design.md`, rows F7 (slash commands), F8 (Find in page) and F12 (blocking), and the M10 row of §7. Approved by the owner on 2026-10-24; this plan only orders the work.

**Goal:** the phone's palette runs the shared commands that make sense on iOS 1.0, with desktop's meaning.

## What changes

- `SlashCommand.execute` takes the text after the command (`/theme dark` → `"dark"`), as desktop's `commandArgument` does.
- New commands:
  - `/favorites` and `/history` open their pages.
  - `/find` opens Find in page once the palette has closed.
  - `/block-ads` re-blocks a site that is allowed; otherwise it switches blocking everywhere (desktop's `resolveBlockAdsCommand`).
  - `/allow-ads` allows the current site.
  - `/theme` with no word cycles system → light → dark; a valid word picks it, and an unknown word does nothing.
  - `/send <device>` sends the page to the device named, ignoring case. A bare `/send` keeps the palette open with `/send ` typed, a private tab never offers it, and the result shows in the Send banner.
- The Send banner moves from `ContentView` state into `TabsManager` (`sendNotice`), so the Sunrise menu and `/send` share it.
- `copy/slash-commands.json` marks `/glance`, `/archive` and `/dark-site` as desktop-only (the 1.0 doc's list, beside `/rename` and `/1password`), which drops them from the mobile strings.

## Not in M10

These are recorded as rulings:
- `/group`, `/ungroup`, `/close-group` and `/space` need groups and Spaces on the phone, so they come with M17.
- `/sleep` isn't offered: iOS frees a background web view's memory itself (D8).
- `/bangs` comes after 1.0 (owner, 2026-10-24).
- The shield chip and per-site allow are already in the Sunrise menu's "Ad & tracker blocking" item. The owner chose the Sunrise menu (option A, 2026-10-25) over a separate chip on the Island.

## Tests

- `BlancTests/SlashCommandTests` covers:
  - argument parsing
  - the order of available commands, and that a private tab has no `/send`
  - `/theme` cycling, exact words, and unknown words doing nothing
  - `/block-ads` re-blocking an allowed site, otherwise switching
  - `/allow-ads`
  - `/send` matching a device without regard to case
- `BlancUITests/SlashCommandUITests` covers `/favorites` opening the Favorites page and `/find` showing the find bar.
- The full suite passes on the iOS 26.5 and 27.0 simulators.
- `npm run copy:check` passes.
