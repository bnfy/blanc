# Marketing claim verification

This is the required pre-publication check for Blanc articles, social posts,
ads, demos, outreach, comparisons, press copy, and text embedded in imagery.

## The release boundary

Public product copy describes the **current public release**, not whatever is
present in the working tree. Resolve the public version from `AGENTS.md` and
the matching dated record in `docs/release-incidents/`, then inspect the exact
release tag with `git show vX.Y.Z:<path>`. A feature on `main` is not a public
capability until its release evidence says it shipped.

Use this evidence order:

1. Code, tests, and acceptance evidence at the public release tag.
2. The matching dated release-incident record and published release notes.
3. Public site or press copy only when it belongs to that release and agrees
   with the code. Existing marketing copy is not proof by itself.
4. Current working-tree code only for explicitly labelled previews or future
   plans.

Design specs, implementation plans, mockups, drafts, and unreleased branches
never prove a public capability.

## Required check for every asset

Before drafting, extract every falsifiable product or comparison claim. For
each one, record:

- the exact wording;
- whether it describes Blanc, another product, or an opinion/inference;
- the release-tag code, test, release record, or current first-party external
  source that supports it;
- any qualification that must travel with the claim;
- the verdict: `verified`, `qualified`, `aspirational`, or `remove`.

Do not publish while a material claim is `remove`, while an aspiration reads
as a present capability, or while the evidence describes a different release.

## Explicit feature and benefit message gate

**Standing owner direction, October 4, 2026:** Be explicit throughout the
website and all other Blanc communications. Assume readers are new to Blanc.
They should understand which feature is being discussed, what it does and why
it matters without relying on an image, prior page or familiarity with Blanc.
This applies to headings, supporting copy, social posts, email, release notes,
support replies, demos and product messages.

Use this order for feature messaging:

1. **Feature and action:** name the feature and explain what the user can do.
   Pair an unfamiliar product name with its meaning rather than using it alone.
2. **Concrete benefit:** explain the useful result in plain language. A
   familiar problem can provide context, but must not delay naming the feature.
3. **Qualification and action:** preserve material limits and give an honest
   next step.

Prefer “Choose your Start Page layout” to “Start with a view that suits you,”
“View two tabs with Glance” to “Keep a reference beside your page,” and
“Navigate with mouse gestures” to “Let a small movement take you somewhere.”
Warmth and personality are welcome when the meaning remains clear. Do not
replace a feature explanation with an evocative slogan. The approved brand
tagline remains “A little less browser.”

Do not open with a feature inventory and leave the reader to infer the value.
Do not make internal state vocabulary carry the message: words such as
“quiet,” “awake,” “eligible,” or “renderer” need a plain-language consequence
beside them. A reader should not need to understand browser architecture to
know what is in it for them.
Prefer ordinary cause-and-effect language over a coined slogan: “free up
memory without closing the tab” is clearer than “give the memory back.” Name
only the resource the release evidence supports. Do not broaden a verified
memory behavior into claims about generic resources, CPU use, battery life,
heat, speed, or how hard the computer is working without separate evidence.
Do not turn the emotional payoff into an unsupported speed, productivity,
memory-savings, privacy, security, or wellbeing guarantee. The mechanism and
its qualifications remain subject to the release-backed claim gate above.

## Current Blanc capability boundaries

These boundaries describe public v1.39.0; its scope, publication evidence,
hand checks and adjacent public-feed updater handoffs are recorded in
[the release report](release-incidents/2026-10-19-v1.39.0.md). Installed
candidates keep their original source/artifact bindings; hosted verification
does not establish physical-machine outcomes. The v1.27.0 uBO acceptance, the
v1.28.0 duplicate macOS build number, the v1.29.0, v1.30.0, v1.30.1, v1.31.0,
v1.32.0, v1.33.0, v1.34.0, v1.35.0, v1.36.0, v1.37.0 and v1.38.0 updater confirmations, the v1.35.0, v1.36.0, v1.37.0 and v1.38.0 hand checks, the v1.30.0 drag-to-reorder hands-on coverage, historical
wallpaper/Linux waivers and earlier updater confirmations remain in their
original reports:

- **Optional uBlock Origin:** Public v1.39.0 offers full uBO 1.75.0 on
  Apple Silicon, native Intel Mac, Windows x64 and Linux x64, on official
  Electron 44.8.0, unchanged since v1.35.0. The move from 44.5.1 passed the real blocking and tools
  suite on all four in hosted CI; the installed-candidate acceptance dates
  from v1.27.0 on 44.5.1. Click the Island shield to choose a blocker and restart
  Blanc to apply it. Blanc Blocker stays the default and protects private
  tabs; Rosetta uses Blanc Blocker. Profile configuration is separate and
  outside Sync. Filter data can update, while executable resources remain
  pinned to reviewed releases. This does not provide general extension-store
  installation. Keep the [support matrix](ublock-origin-support-matrix-2026-10-03.md)
  and its limits beside broader compatibility claims.
  If uBO fails mid-session, Blanc restarts it automatically (at most three
  times per profile in 10 minutes) while holding requests, then offers a
  manual restart; do not claim uBO can never fail or that pages load
  unfiltered while it restarts.
- **About & Trust:** Settings shows facts about the installed build checked
  on the device and links to the release, verification guide, SBOM and
  provenance. It makes no network request. It does not itself verify the
  Sigstore manifest or prove the build is untampered; do not describe it as
  a security audit.
- **Dark websites:** Off by default and device-local. While Blanc is dark it
  darkens http(s) pages that have no dark mode of their own, using the bundled,
  pinned Dark Reader engine; there is no runtime download. Embedded frames
  keep their original colors. Do not claim every site renders correctly dark,
  that it works while Blanc is light, or that it darkens iframes.
- **Local certificate warnings:** Only local and private-network addresses
  offer Advanced and a way to continue, for that origin and certificate until
  Blanc quits; the choice is never saved or synced. Public sites keep the hard
  stop. Do not describe this as a general certificate bypass.
- **Downloads:** Interrupted downloads offer Resume when Chromium can continue
  them and Retry (http/https) otherwise. Retry restarts from the source URL;
  do not promise that every interrupted download can be completed.
- **Island:** Blanc replaces the permanent horizontal tab strip and
  conventional toolbar with a compact Island. Its resting controls occupy a
  reserved 68px band above the page; its expanded panel overlays the page.
  Do not claim the resting Island floats over the web content or reserves no
  toolbar space. The user opens its panel for navigation, switching, search,
  and commands. Blanc does not understand what the user is working on.
- **Quick Switcher search:** For search text, Enter opens the highlighted
  result, which can be a strong match from tabs, Favorites, history or groups.
  The user can choose the exact-text web-search result explicitly. Do not
  promise that Enter always searches the typed text. Address-shaped input
  navigates unless the user explicitly selects a result.
- **Search engines:** Since v1.34.0 Settings → General → Search engine offers
  DuckDuckGo, Google, Bing, Brave Search, Kagi and Custom…. A custom engine is
  the user's own search address with `%s` where the words go, for example a
  SearXNG server. It syncs with the other settings when Profile Sync is on,
  and a plain `http://` address is accepted only for this computer or the
  local network. Kagi needs a Kagi account, and private tabs don't share its
  sign-in. Kagi shows live suggestions; a custom engine shows none. Do not
  claim Chrome-style search-engine keywords, several saved custom engines,
  OpenSearch auto-discovery, or suggestions for custom engines. Bangs are a
  separate feature with their own entry below.
- **Bangs:** Since v1.36.0 a known bang (`!` plus a site's code, such as
  `!yt lofi`) at the start or the end of the text in the ⌘L or Ctrl+L panel
  opens that site's search directly, whichever search engine is chosen, and a
  code alone opens the site's home page; `!` alone lists recently used and
  popular bangs, and more letters filter the whole list by code or site name.
  The list is Kagi's open bang list (MIT), 10,624 bangs bundled and changed
  only by a Blanc update, with no online lookup and nothing sent to Kagi.
  Settings → General has a Bangs switch (on by default) and Your bangs, the
  user's own codes, which sync with the other settings when Sync is on.
  Qualify every privacy claim: Blanc opens the bang's own address and never
  sends the words to the selected search engine first, but 40 bangs in this
  list send the words through Google or DuckDuckGo to search one site, so
  never claim a bang avoids every search engine. No suggestions are requested
  while a bang is in the box; text typed before a trailing bang may already
  have been sent. Recently used bangs stay on the device and are never
  recorded from private tabs. Never imply Kagi endorses Blanc.
- **Fresh optional connections:** Search suggestions and usage measurement
  are preselected on in fresh-install setup. Optional sends are gated until
  the user saves their choices; either can be turned off before continuing
  or later in Settings. Saved choices are retained on upgrades. Do not imply
  these features default off or that optional means no network connections.
- **First-day signals:** Since v1.31.0, with usage measurement on, Blanc
  sends at most two events in an install's first 24 hours: whether Blanc is
  the default browser, and that three web pages were opened in regular tabs.
  No URL, title or page content is sent, and private tabs never count. Do not
  describe these as tracking browsing, or claim they apply to older builds.
- **Mouse gestures:** Mouse gestures are disabled by default and configured in
  Settings → General. A physical mouse uses right-button drag; a trackpad uses
  Alt/Option plus a one-finger click-and-drag. Four default directions map to
  Back, Forward, New tab, and Close tab. The user can draw patterns of up to
  three directions and assign Back, Forward, Reload, New tab, Close tab,
  Reopen closed tab, Previous tab, Next tab, or Open Island. The setting and
  assignments are device-local. Do not imply semantic gesture inference,
  touch-screen gestures, or that right-button input works as a trackpad
  trigger on every platform.
- **New-tab shortcut:** The resting Island's Plus creates one regular,
  ungrouped tab and focuses its address field. It stays bare beside the slash
  keycap and is hidden in vertical-tabs mode, where the rail already has a New
  tab control. Do not describe it as creating private or grouped tabs.
- **Custom tab names:** Since v1.35.0 the user can give a tab a name of
  their own with Rename Tab… in the tab's right-click menu or `/rename`, and
  go back to the page title with Reset Tab Title or `/rename` alone. The name
  stays through navigation, Quiet Tabs, Move Tab to New Window, Reopen Closed
  Tab, Blanc Spaces and relaunch, and shows on other devices when Profile
  Sync shares open tabs. History and Favorites keep the page's own title, and
  a private tab's name is kept only in memory. Blanc never names tabs itself:
  do not describe automatic, suggested or AI-generated tab names.
- **Glance:** Glance shows one other tab the user picks, the reference.
  Since v1.40.0 it is a card floating over the current page (not beside or
  below it): the page behind stays usable, the card moves by its header,
  resizes from its edges, resets with a double-click on the header, and keeps
  its place on this device. Switching tabs closes it; Open as tab makes the
  Glance page the current tab, Keep as split turns the two into a Split View,
  and Escape closes it from the card's header, never from inside the page.
  Since v1.35.0 Reload, Close Tab, Find, zoom, Print, Back, Forward, mouse
  gestures and the 1Password fill act on the pane that has keyboard focus,
  while ⌘L, ⌘T, ⌘1–9, the shield and slash commands stay on the main page. A
  link the reference opens in a new tab opens in Glance, a link's right-click
  menu offers Open Link in Glance, and `/glance` opens the picker. Glance
  holds one reference at a time; do not describe more panes, tiling of
  several tabs, or automatic pairing of related pages. Material about v1.39.0
  or earlier describes the side-by-side Glance of those releases.
- **Split View:** Since v1.40.0 two tabs can show side by side in one window,
  made from a tab's Split with menu or Glance's Keep as split. The divider
  resizes the panes, the pane you click is the current tab, and a split stays
  together in the ⌘L panel, after a relaunch and in Blanc Spaces. Remove from
  Split takes one tab out; Close Split closes both, and Reopen Closed Tab
  brings the split back. Two panes only: do not describe three or four panes,
  a grid, or keyboard shortcuts for moving between panes. Pinned tabs can't
  join a split, private tabs in a split aren't saved, and splits aren't
  synced.
- **Favorites import from signed-in Chrome profiles:** Since v1.35.0
  Favorites import from Chrome, Edge, Brave, Chromium and Vivaldi also reads a
  signed-in profile's separate account bookmarks file (`AccountBookmarks`)
  and combines it with the local file without duplicates. The release
  evidence is scenarios that reproduce Chrome's file format; no file written
  by a real signed-in Chrome was tried before release, so do not claim it was
  checked against a live Google account.
- **Named Groups:** The user explicitly creates or assigns a tab to a named
  group through `/group` or the grouping UI. Blanc does not infer group names,
  categorize tabs semantically, or organize them automatically. Since v1.36.0
  a group name keeps the capitals the user types (matching ignores case),
  names saved in lowercase before that were given a capital first letter
  once. Since v1.37.0 a group can carry one of the eight Spaces colors (off
  by default), drawn as a tint on its block, a dot before its name and its
  tabs' Island dots. Right-clicking a group header, or its ⋮ button, opens a
  group menu with the name, the color, New Tab in Group, Move Group to New
  Window, Ungroup and Close Group. On Linux, Move Group to New Window was
  checked after release in an ARM64 VM on an unpackaged build, not on the x64
  AppImage or a physical machine. A link
  opened in a new tab from a grouped tab opens ungrouped, like any new tab.
- **Drag to reorder:** Since v1.30.0 the user can drag tabs and group headers
  in the expanded Island and in vertical tabs, or use Alt/Option+Shift+Up and
  Down on a focused row or header. A drag can move a tab within its group,
  into another group or out of it, and reorder whole groups; it never changes
  pinned state, and releasing over a page does nothing. Since v1.37.0
  ungrouped tabs can also sit above, between or below groups; new tabs still
  land at the bottom. Ordering is entirely user-directed. The owner hand-tested it on macOS and Windows; Linux is
  covered by hosted automated pointer tests only, so do not claim hands-on
  verification there.
- **Favorites folder picker:** v1.25.0 keeps the move picker above neighboring
  rows and inside the window, with internal scrolling for long folder lists
  and a visible new-folder field. Escape closes the picker and returns focus
  to its move button; a second Escape closes Favorites. Group headings use
  plain labels and count badges. These claims are verified by the exact-tag
  `src/renderer/pages/bookmarks.js`, `src/renderer/pages/pages.css`, and
  `test/desktop/favorites-folder-picker-smoke.mjs`, the published release notes,
  and the 12-layout macOS/Linux regression evidence in the release report.
- **Blanc Spaces:** Since v1.33.0 Blanc Spaces is free for everyone; Blanc
  Patron is optional support and unlocks nothing. Anyone can explicitly save a
  window or create a blank space. A bound space saves its tabs and groups as
  the user browses and can later replace the current window's set. Each space
  has a colour and a symbol, shown at the start of the Island, where a click
  opens the Spaces menu to switch, edit, reorder or delete (with Undo).
  Switching between spaces is never refused for a limit; to keep memory in
  check Blanc may free up memory from tabs in spaces left a while ago, and
  those tabs reload on return. This is not automatic task detection, an AI
  workspace, or an agent session, and spaces are not synced.
- **Quiet Tabs:** Eligible inactive background tabs may give back their
  renderer memory and are rebuilt or reloaded when revisited. Dirty,
  uncertain, active, recording, or otherwise ineligible tabs remain awake.
  A quiet tab reloads; it does not promise exact resumption of all live page
  state.
- **Reopen Closed Tab:** Blanc records eligible ordinary tabs in a bounded,
  per-window Recently Closed undo buffer. At most one eligible closed page per
  window may keep its same live view for about 30 seconds; reopening it during
  that window can avoid a reload. After the live hold ends, a still-recent
  entry may fall back to its safe navigation snapshot or URL. Entries expire,
  the buffer is capped, and private tabs never enter Recently Closed. Do not
  promise exact state recovery, permanent retention, or recovery of every tab.
  Since v1.36.0 Recently closed is a band under Pinned in the ⌘L panel,
  folded each time the panel opens and listing up to 25 entries per window
  when unfolded; the user can drag it among the groups.
- **Adding a Sync device with a code:** Since v1.36.0 a device that already
  syncs shows an eight-character code that works for ten minutes, and a new
  device enters it under Add this device to my sync; the sync name and
  passphrase still work. A device can also move to another sync with a code.
  The sync service holds the wrapped sync secret under an identifier derived
  from the code for at most ten minutes and deletes it when it is read or
  cancelled; it cannot unwrap it without the code. Copy recovery code puts a
  code on the clipboard only after a native confirmation. Do not claim QR
  codes, nearby or Bluetooth pairing, accounts or sign-in, or that the service
  never stores anything.
- **Device names:** Since v1.36.0 the user can rename a synced device from the
  Other devices drawer (Rename Device…) or name the current device in Settings
  → Sync; names sync with the settings and show in the drawer, the Quick
  Switcher and the Start Page. A device still publishes its computer name, so
  earlier Blanc versions keep showing that. A Mac now publishes its computer
  name rather than a network-derived host name.
- **Invite a Friend:** Since v1.36.0 Help → Invite a Friend… and `/invite`
  open a new email in the user's default mail app with a short invite and the
  link `https://blanc.day/?ref=invite`; the user chooses the recipient and
  sends it. Without a mail app, Windows asks which app to use. Blanc copies
  the text only when the system reports that no mail app opened. That fallback
  wasn't hand-checked on macOS. On Linux it never ran in v1.36.0 (Electron
  reported every hand-off as successful); since v1.37.0 Blanc runs xdg-open
  itself and copies when it fails. That was checked in an Ubuntu VM on an
  unpackaged build before release, not on the packaged AppImage.
  Blanc sends nothing and
  learns nothing about who was invited; the link is the same for everyone, so
  invite landings can only be counted in aggregate by the website's
  consent-gated analytics. Do not describe referral rewards, per-person
  invite codes or tracking of invitees.
- **Tab menu additions:** Since v1.37.0 a tab's right-click menu offers New
  Tab Below, Close Tabs Above and Close Tabs Below (unpinned tabs only, as one
  Recently closed entry), and Mute Site, which mutes every tab on that exact
  host, including tabs opened there later, until Blanc quits. Site mutes are
  never saved or synced. Don't describe Mute Site as permanent or as covering
  a whole domain.
- **Pinned pages:** Since v1.37.0 a pinned tab remembers the page it was
  pinned on and starts there again after a normal quit and relaunch; after a
  crash it reopens on the last page. Back to Pinned Page and Replace Pinned
  Page with Current are in the tab menu. The owner confirmed on Windows that
  after a v1.36.0 → v1.37.0 Restart Now there was no recovery prompt and
  pinned tabs reopened at their pinned pages; that's a single machine, so
  don't present it as tested across Windows setups.
- **Open the Island on hover:** Since v1.37.0 an opt-in setting (off by
  default, Settings → General) opens the ⌘L panel when the pointer rests on
  the Island's address for 300 ms. It never opens from the rest of the Island.
- **Bang row icons:** Since v1.37.0 bang rows in the ⌘L panel show site icons.
  Blanc first uses an icon already in the profile from the user's own visits,
  then a device-level copy, and otherwise asks `blanc.day/bang-icons/<host>`
  for that one catalog site, only for rows that stayed on screen. Private
  tabs, custom bangs and profiles that haven't saved their privacy choices
  never ask. Don't say bang icons make no network request.
- **What's new after an update:** Since v1.36.0, after Blanc restarts into a
  newer release, the Start Page footer shows a What's new pill linking to that
  release on the changelog for seven days or until it is opened or closed. It
  is device-local, takes the Patron pill's place, and never shows on fresh
  installs, downgrades, pre-releases or private tabs.
  Since v1.39.0, after an update that changes the major.minor version, Blanc
  also opens that release's What's New page on blanc.day once, as an ordinary
  tab, and only after a cookie-less HEAD request (at most once per launch, for
  up to seven days) finds the page. It never opens after a bug-fix update, a
  fresh install, a pre-release or a downgrade, or as a private tab. The pill
  links to that page once it is found. Don't claim it opened on a real update
  until the release report records the v1.38.0 → v1.39.0 handoff.
- **Default browser prompts:** Since v1.36.0 Finish setup leads with Make
  Blanc your default on macOS and Windows and checks it off once Blanc is the
  default. On a new install that finished setup without switching, Blanc asks
  once, between 12 hours and 14 days after setup, with Set as default and Not
  now, and never again; profiles from before v1.36.0 and Linux are never
  asked. Setting the default still goes through the operating system's own
  prompt or Settings. Do not describe repeated nagging or Blanc changing the
  default by itself.
- **1Password on macOS:** The optional integration depends on the installed
  1Password app and account. Blanc may show a small device-local hint when the
  visible page has a current-password field, and Settings can verify the saved
  1Password account identifier. The hint uses bounded structure-only page
  metadata, never field values or page text, and does not contact 1Password.
  Credential lookup and fill remain explicit user actions. This is not
  automatic fill, a general extension runtime, or a Blanc password manager.
- **1Password on Windows and Linux:** Since v1.34.0 public Blanc enables the
  same fill on Windows and Linux (not on Windows on Arm), announced on the
  website on October 16, 2026. Its evidence comes from Windows and Linux
  virtual machines under the waiver in
  [the 1Password integration doc](1password-integration.md); keep any claim
  within that evidence and name the Windows on Arm limit.
- **Interface languages:** Blanc's own interface is available in German,
  Spanish, French and Portuguese (Brazil) since v1.32.0, and in Italian since
  v1.33.0, all machine-translated. Blanc
  follows a matching system language (any Portuguese system gets Brazilian
  Portuguese), and Settings → General → Language chooses any of them or
  English; a change applies after a relaunch. Blanc does not translate web
  pages. Do not call the translations human or professional, or name other
  languages as available.
- **Mahjong:** Mahjong opens from every start-page footer into its own managed
  tab and offers eight solvable-by-construction boards. Daily rotates across the
  eight layouts. Device-local state remembers the last layout, mode, and deal,
  can offer to continue an unfinished board from another tab, and keeps records
  and daily streaks. The game also includes scoring, timed combos, automatic
  clears, hints, shuffle, undo, and sound controls. Do not describe it as
  online multiplayer, cloud-synced, or
  AI-generated.
- **Call audio buffering:** Automatic, Stable, and Resilient are receive-buffer
  choices for WebRTC calls. Stable targets about 400 ms and Resilient about one
  second, trading responsiveness for more tolerance of choppy playback. Do not
  promise that either mode eliminates every crackle or fixes source-side,
  network, Bluetooth, driver, or hardware faults.
- **Time-of-day wallpaper:** Free and off by default. The start page's Customize popover or
  Settings → General enables bundled Sunrise artwork for dawn (05:00–08:00),
  day (08:00–17:00), dusk (17:00–20:00), and night (20:00–05:00), using the
  device's local clock without location permission or artwork requests.
  It works across all four layouts and private tabs, with two-second fades
  and immediate changes for reduced motion. Optional Sync carries only the
  preference; each device computes its own phase. Physical Windows/Linux
  appearance and lifecycle acceptance was waived, not passed.
- **Your own Start Page image:** Since v1.38.0 the Customize popover's
  Wallpaper section (and Settings → General → Start Page image) can show a
  JPEG or PNG of the user's own, up to 25 MB, with Wash (Auto, Light, Dark,
  Spotlight) and Fade controls. Blanc stores a copy fitted inside 3840 px with
  every metadata field except orientation removed, owner-only on this device.
  The image and its controls are never synced, and private tabs never show
  it. The owner hand-checked it on Windows; the Linux hand check (file
  picker, phone photos staying upright) was waived, not passed, so don't
  claim hands-on Linux verification.
- **Start Page color:** Since v1.38.0 the Wallpaper section offers Color: one
  of the eight Spaces presets as a Soft, Solid or Gradient fill, plus Match
  each space's color, which paints a window that belongs to a space in that
  space's color. These choices sync with Profile Sync; a device's own image
  still takes priority on that device, and private tabs never show a color.
  Hand-checked on Windows; the Linux check was waived as above. Don't describe a
  separate image per space; that isn't shipped.
- **Auto-hide the Island:** Since v1.39.0 an opt-in, device-local setting
  (Settings → General, the View menu, ⌘⌥B or Ctrl+Alt+B) hides the Island's
  strip so the page fills the window. Pointing at or just above the top edge,
  resting near the top, or any Island surface such as ⌘L brings it back. It is
  off by default. On native Wayland the band above a floating window can't
  reveal it; don't claim it works identically there. In v1.39.0 revealing
  it moved the page down. Since v1.40.0 the revealed Island floats over the
  page by default (**When the Island comes back**: Float over the page, or
  Push the page down); while it floats it comes back only from the top edge
  or ⌘L and hides once the pointer moves into the page, and the window
  buttons hide and come back with it.
- **Tab Archive:** Since v1.39.0 Settings → General → Archive inactive tabs
  (Off by default; 12 hours, 1 day, 7 days or 30 days) closes idle loose tabs
  into a per-profile, device-local Archive kept 30 days (up to 500), restored
  from the ⌘L panel or History → Archived tabs. Pinned, grouped and private
  tabs are never archived, nor a tab playing or capturing media, awaiting a
  permission prompt or holding form input. An update never turns it on; a
  new profile's onboarding offers it. The Archive keeps no page state or back
  history and is never synced. The hand checks passed on October 20, 2026:
  the installed Mac app (owner), the published Windows build, and on Linux
  an ARM64 package of the release commit that exercised the sweep, not the
  interface. Don't claim a hands-on check of the published x64 AppImage.
- **Sunrise Gold:** Since v1.39.0 Settings → General → App icon offers Sunrise
  Gold on macOS only, alongside Sunrise and Sunrise Dark. It isn't a Patron
  perk, and Windows and Linux don't offer it. In the Clear and Tinted icon
  styles macOS shows the styled bundle icon instead.
- **Linux AppImage:** v1.24.0 removes the host FUSE 2 library dependency and
  fixes sandbox-disabling packaged desktop arguments. Existing integrated
  shortcuts need reintegration. The launcher can still disable Chromium's
  sandbox when its user-namespace capability probe fails. Do not claim that
  every Linux launch is sandboxed or that Michael's machine was verified.
- **Billboard frequently visited sites:** Billboard ranks ordinary browsing
  history on the device and keeps its favicon artwork and hidden-tile choices
  local. Private tabs do not contribute or receive this row. Do not describe
  the feature as synced, account-based, remotely retained, or semantically
  organized.
- **Screen and system-audio sharing:** A site request opens Blanc's centered
  confirmation before capture begins. The user chooses a surface, separately
  approves computer audio, and can stop each share from the Island while its
  tab is in the background. Linux continues into its system chooser. Direct
  and legacy desktop-capture paths remain denied. Do not claim that every
  platform has an identical chooser or broaden tested conference behavior
  beyond the dated release evidence.
- **App icons:** Public v1.21.0 offers Sunrise and Sunrise Dark. Public copy
  must not present app icons as a paid benefit.
- **AI:** Blanc ships no AI assistant or agent browser. It does not understand
  assignments, detect semantic task boundaries, automatically organize tabs
  by meaning, or isolate automated browsing work from a person's session.
- **Bring Your Tabs and open-tab handoff:** Both are available in public
  v1.21.0. They are complementary, not interchangeable. Bring Your Tabs
  starts inside Blanc, reads a user-selected Chromium profile's saved session
  locally, supports selection and Named Group editing, and can preserve eligible
  source groups and pins. The one-time handoff starts in ChatGPT or the
  Firefox/Safari companion and copies only URL, title, order, and active-tab
  status from one live source window into the current Blanc window. It has a
  100-tab limit and a simpler review screen; it does not transfer groups or
  pins. Copy must preserve those distinctions, excluded private/internal tabs,
  and the fact that OpenAI processes selected
  metadata on the ChatGPT path while Firefox/Safari encrypt locally. Do not call
  either path account sync, migration of sessions or logins, an automatic
  import, or an AI browser feature.
- **Arc Spaces import:** Since v1.32.0 Bring Your Tabs can read Arc's
  sidebar file on the device, without changing it, and bring each Space the
  user picks: pinned tabs, Today tabs, and folders as tab groups. Since
  v1.33.0 each Space becomes a space in Blanc Spaces for everyone (in v1.32.0,
  without Blanc Patron, each opened in its own window). Tabs load only when
  opened. Arc's top-row Favorites can be
  added to one Favorites folder named Arc. Sign-ins, passwords, history,
  archived tabs, Notes and Easels stay in Arc. On Linux the user chooses a
  `StorableSidebar.json` copied from a Mac or PC. Real-sidebar evidence
  ([F45](evidence/f45-arc-import-real-sidebars-2026-10-12.md)) covers Apple
  Silicon, Windows on Arm64 and GNOME on Wayland, not Intel Macs or x64
  Windows. Do not call it account sync, a live Arc connection, or an import
  of logins or history.

Canonical evidence locations include `src/main/main.js`,
`src/renderer/overlay.js`, `src/main/tab-sleep.js`, the matching public release
tag, `site/src/pages/features/`, and the dated release record. Re-check them;
do not copy this file as a substitute for verification after the product
changes.

## Language that requires rejection or qualification

Do not use present-tense wording such as:

- "Blanc understands the assignment/task/context";
- "Blanc automatically organizes or groups your tabs";
- "Blanc gives every task its own AI workspace";
- "Blanc isolates agent browsing from your browser";
- "Quiet Tabs resumes every page exactly where you left it";
- unqualified superiority, privacy, security, or memory claims.

An editorial opinion may discuss what browsers *should* do, but the transition
to Blanc must state what Blanc actually does today and must not imply that the
opinion is an implemented capability.

## External comparisons

Use current first-party documentation for another product's behavior,
availability, price, privacy, or architecture. Record the source and access
date. If the source supports only part of the statement, narrow the copy.
Clearly label inferences. Never infer architecture from a screenshot, launch
post, third-party summary, or the name of a feature.

## Imagery and demos

Text inside an image is a product claim and follows the same gate. Product UI
must come from the current public build or a clearly labelled preview build.
Do not let generated imagery invent controls, automatic behavior, names, or
states that Blanc does not ship.

Visual identity follows `docs/brand-usage.md`, including its explicit
website-only Sunrise palette and mark treatments. Outside those website
exceptions, the Blanc mark is black on white or white on black and is never
placed on, inside, or visually backed by an accent-colored treatment.
