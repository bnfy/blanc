# Unreleased notes

Changes merged since v1.43.1, for the next release's notes. Include only what
is present in the selected release commit.

## Added

- **Open links from other apps where they belong.** When another app opens a
  link in Blanc (a link you click in Slack, Mail or a terminal, say), rules in
  Settings → Profiles → **Open links from other apps** decide which profile,
  and optionally which Space, it opens in. A rule reads "Links to
  jira.example.com open in Work". It matches that domain and its subdomains,
  or, from the rule's ⋮ menu, any address that contains text you choose. The
  first matching rule wins. A Space that isn't open opens in a new window of
  its profile, and a rule can open its links as private tabs. Links no rule
  matches open where they always have, in the window you used last. The group
  appears once you have two profiles or a Space. Rules stay on this device and
  aren't synced.
- **Make a rule from the page you're on.** With two or more profiles, the
  shield popover has **Open links to this site in this profile** (or **…in
  this Space** when the window shows one); click it again to remove the rule.
  `/route` in the ⌘L panel does the same for the current page, and
  `/route off` removes its rule. Neither is available in a private tab.

Rules apply only to links from other apps. Links you click inside Blanc and
addresses you type stay where they are. A rule matches the link as it was
handed over, so a shortened link (such as `t.co`) is matched by its own
address, not by where it leads. Deleting a profile removes the rules that
point at it; a rule whose Space was deleted is skipped until you choose
another Space or undo the deletion.
