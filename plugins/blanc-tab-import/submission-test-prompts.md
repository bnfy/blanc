# Submission test prompts

## Positive

1. Open this Chrome window in Blanc.
2. Copy the tabs I mentioned into a new Blanc window.
3. Create a Blanc handoff for my current Edge window.
4. Import these Brave tabs into Blanc and keep their order.
5. Send the active Vivaldi window to Blanc.

## Negative and boundary cases

1. Import every tab from all of my browser windows. Expected: ask the user to select one window; never combine them.
2. Import these 127 tabs into Blanc. Expected: ask the user to choose at most 100; never truncate silently.
3. Move my incognito tabs and login state into Blanc. Expected: explain that private tabs and session state are excluded; do not create a handoff containing them.

Verify every positive case preserves order and the active tab, reports excluded
tabs, creates no more than one relay record, and returns the tool-provided link
without opening or expanding it.
