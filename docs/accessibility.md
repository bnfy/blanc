# Desktop accessibility audit

Blanc treats accessibility as a release gate for the trusted browser UI, not a
one-time visual review. The automated check runs against the real Electron
documents and the manual checklist covers the OS and assistive-technology
boundaries that browser automation cannot observe.

This is an engineering audit, not a claim of formal WCAG certification. Web
pages loaded from the internet are authored by their sites and are outside the
scope of Blanc's chrome audit.

## Automated gate

Run:

```sh
npm run test:accessibility
```

Linux CI runs the same command under `xvfb-run`. The script creates a temporary
profile, launches Blanc through Playwright's Electron driver, injects the
version-locked `axe-core` development dependency into each trusted
`WebContents`, and removes the profile on exit.

The gate requires zero axe violations for WCAG 2.0/2.1/2.2 A and AA tags plus
axe best-practice rules across these rendered states:

- ledger new tab and all three first-run steps;
- resting Island, a representative grouped workspace, and the vertical rail;
- Island panel, command palette, find, and site-information details;
- permission alertdialog with the safe choice focused;
- credential and display-sharing pickers;
- light, dark, and private presentation;
- Favorites, History, Downloads, Settings, and Keyboard Shortcuts sheets;
- certificate-error and basic-auth documents.

The script separately asserts initial focus for dialogs/sheets/onboarding,
rejects pointer-only Island result rows, and checks every utility sheet at the
640×480 minimum window size with 200% zoom. That combination gives a 320 CSS-px
reflow target and fails on horizontal document/card overflow.

The chrome strip and overlay are partial application documents, not standalone
web pages. The chrome disables only axe's document-level
`page-has-heading-one` best-practice rule; its `main` landmark is still audited.
The overlay disables that heading rule plus `landmark-one-main`, because it is
an attachable dialog/search surface rather than a page. Their real toolbar,
dialog, search, region, name, contrast, and target-size rules remain enabled.
Every complete `blanc://` page keeps both H1/main rules.

## Manual assistive-technology release pass

Run this checklist on a packaged candidate whenever chrome structure, focus
ownership, native menus/dialogs, or platform styling changes. Record the OS,
assistive-technology version, architecture, app build, and result with the
candidate evidence.

### macOS — VoiceOver

1. Turn VoiceOver on and launch Blanc into a clean profile.
2. Use only VoiceOver navigation and the keyboard to finish all onboarding
   steps. Confirm headings, checkboxes, radio choices, status messages, and
   progress are announced once and in reading order.
3. Open the Island with Command-L. Traverse the address field, tab switch
   actions, per-tab pin/group/close actions, footer actions, and dismiss
   control. Confirm the current tab and expanded group are conveyed.
4. Switch between Island and vertical tabs. Exercise the rail's roving focus,
   group collapse/expand, tab activation, close action, and resize separator.
5. Trigger a permission prompt. Confirm it is announced as an alert dialog,
   Block receives focus, and both choices are operable.
6. Open each utility sheet. Confirm its title is announced as a modal dialog,
   background page controls are not reached, Escape closes it, and focus
   returns to a useful browser surface.
7. Open find, site information, basic auth, credential selection, and display
   sharing. Confirm no focus trap remains after dismissal or tab/window change.
8. Use the rotor to inspect headings, landmarks, links, and form controls in
   each internal page. Confirm labels are concise and unique.

### Windows — NVDA

Repeat the journeys above with NVDA using browse/focus modes. Also verify the
native application menu, Alt-key navigation, Windows window controls, and the
installer's first launched build. A macOS VoiceOver pass does not substitute
for this check because Electron exposes native window and focus boundaries
differently on Windows.

### OS display preferences

- Enable Reduce Motion before launch; tab-dot peeks, loading indicators, group
  carets, scrolling titles, and strip transitions must stop without hiding
  state changes.
- Enable Windows High Contrast / forced colors. Every control, current item,
  focus indicator, private marker, and destructive action must remain visible
  and distinguishable without relying on background images or color alone.
- Check 200% app zoom at the 640×480 minimum and 200% OS display scaling on
  real hardware. There must be no two-dimensional scrolling for utility-page
  content and no unreachable actions.
- Verify light, dark, and private themes with the OS contrast inspector; the
  automated check covers rendered text contrast but not every icon/stroke or
  translucency produced by the window compositor.

## Boundary and follow-up policy

axe cannot judge whether the combined accessibility tree across sibling
`WebContentsView`s reads naturally, whether a native menu/dialog is announced
correctly, or whether focus returns sensibly after the OS takes over. Those are
manual release checks above. Any repeatable failure should become an automated
Electron assertion or acceptance scenario; keep only irreducibly OS/AT behavior
in the manual list.

Do not weaken a rule globally to make the gate pass. Fix the rendered surface,
or document a narrowly scoped exception with the semantic reason and the
replacement assertion that still guards the behavior.
