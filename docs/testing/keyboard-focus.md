# Keyboard focus regression checklist

A keyboard-only pass over the transitions where focus most often gets lost:
closing tabs, opening a profile window, and Glance. It came from an October 5,
2026 suggestion on daily.dev (Ahmet Özel). It was a usability-test idea, not a
reported bug.

For each step, check two things without using the mouse:

- **Where is focus?** The next keystroke should go somewhere you can predict:
  the page, the ⌘L panel's input, or a control with a visible focus ring.
- **Which site is active?** The Island's favicon and domain, and its active
  dot, should name the tab that now takes your keystrokes.

Run it on macOS, Windows and Linux before a release that touches tab closing,
`setActiveTab`, Glance, Split View, profiles or the overlay. On Windows and
Linux, read ⌘ as Ctrl. Record the build, OS version and results in the
release's hand-check notes.

## Setup

Open a fresh dev or packaged profile and five tabs: three ordinary sites, a page
with a text field (for example a search box), and a blank new tab. Put two of
the sites into a group named `Research`.

## Returning to the address field

| # | Step | Expected |
|---|------|----------|
| 1 | From a page, press ⌘L | The ⌘L panel opens with its input focused and the current address selected |
| 2 | Press Esc | The panel closes and focus goes back to the page |
| 3 | Windows/Linux: press Alt+D | Same as step 1 |
| 4 | Click into a page text field, then press ⌘L | The panel input takes focus, not the page field |

F6 is not bound to anything. Note it if a tester reaches for it.

## Closing tabs

| # | Step | Expected |
|---|------|----------|
| 5 | Visit tabs A → B → C, then press ⌘W on C | B (the most recently used tab) becomes active, the Island shows B, and keystrokes such as Space or arrow keys scroll B |
| 6 | Close the rightmost tab when it was opened last and never revisited | The right neighbour, or else the previous tab, becomes active, and the page has focus |
| 7 | Close the last tab in `Research` | The Island's dots switch to the new active tab's group or run, and the domain matches the page that has focus |
| 8 | Close a group from its ⋮ menu (Close Group) | One surviving tab becomes active and the page has focus |
| 9 | Close every tab with ⌘W | Blanc opens a blank tab. **Check:** does typing go to the address field? (The code currently focuses the page here, unlike ⌘T.) |
| 10 | Close a blank tab, landing on another blank tab | The ⌘L panel input is focused |
| 11 | ⌘⇧T after step 5 | C comes back active and its page has focus |

## Split View

| # | Step | Expected |
|---|------|----------|
| 12 | With a two-pane split, ⌘W in the focused pane | The other pane fills the window, is active, and has focus; the "split dissolved" announcement is read out |
| 13 | Close Split from a tab's menu | One tab becomes active and the page has focus |

## Glance

| # | Step | Expected |
|---|------|----------|
| 14 | Open a link in Glance (context menu, or /glance) | Focus does not jump; the Glance header shows which pane holds focus |
| 15 | Move focus into the reference pane (click once, then keyboard only) | The header shows the reference as focused, and ⌘L / Back act on it |
| 16 | ⌘W with focus in the reference | Only the reference closes, and focus goes back to the main page |
| 17 | ⌘W with focus in the main page | The reference is promoted to the active tab, the "main closed" announcement is read out, and focus is in that page |
| 18 | Press Esc with only Glance open | **Check:** nothing closes Glance by Esc today. Note whether testers expect it to |
| 19 | Keep as split from the Glance header | **Check:** which pane has focus afterwards, and whether the Island matches it |
| 20 | /glance picker, then Esc | The picker closes and focus goes back to the Change control |

## Profiles

| # | Step | Expected |
|---|------|----------|
| 21 | Open another profile from the Profiles menu (keyboard navigation of the menu bar or the ⌘L panel) | A new window opens with a blank tab and the ⌘L panel input focused |
| 22 | Switch back to the first window (⌘\` on macOS, Alt+Tab elsewhere) | Focus returns to where it was in that window, and the Island shows that window's tab |
| 23 | **Check:** can you tell which profile a window belongs to without the mouse? | Today only the window title ("Name — Blanc") and the Profiles menu's check mark say so, and the macOS title bar is hidden |

## Screen reader spot check

With VoiceOver (macOS), Narrator (Windows) or Orca (Linux), repeat steps 5, 12,
16 and 21 and note what is announced when the active tab changes. The active
Island dot carries no `aria-current` today, so a screen reader can't tell it
apart from the other dots.

## Known gaps

These come from reading the code on October 20, 2026. They are not confirmed
user-facing bugs:

- Closing the last tab focuses the replacement blank tab's page, not the address field (step 9).
- Esc doesn't close Glance (step 18), and Keep as split doesn't set focus explicitly (step 19).
- Nothing in the chrome names a window's profile (step 23).
- The active Island dot has no `aria-current`.
- No acceptance scenario checks focus after an ordinary close, after closing the last tab, after a profile window opens, or after Keep as split. `glance.feature` covers the Glance close cases.
