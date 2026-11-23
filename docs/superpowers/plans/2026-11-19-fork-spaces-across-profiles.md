# Blanc Beta: Spaces across profiles in the fork

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: November 19, 2026. Branch: `chromium/next`. Status: proposed, waiting for
the owner's approval.

**Goal:** With two or more Chromium profiles, the fork's Spaces menu and Quick
Switcher list every profile's Spaces, open another profile's Space in a window of
that profile, and create a Space in another profile, as shipping does since
bnfy/blanc#1642.

**Architecture:** Each loaded profile mirrors its Space list (id, name, color,
symbol, tab count) into a Local State dictionary, so listing never loads a
profile. Opening or creating goes through Chromium's own profile loading
(`profiles::LoadProfileAsync`) and the fork's existing open-in-new-window path,
where the new window's own Island host does the open or the create inside its
own profile. The menu itself is shipping's `workspace-ui.js` and `overlay.js` from
#1642, taken at a pin of their own, as the Favorites page was (V30).

**Tech Stack:** C++ in `chromium/blanc/browser/ui/` (one new `.inc`, one
standard-library-only header), one new upstream patch (`browser_prefs.cc`), the
Island host (`chromium/blanc/island/host.js`), the Node generators in
`chromium/tools/`, Node tests, and one native check on the Mac Studio.

**Spec:** `docs/superpowers/specs/2026-11-19-spaces-across-profiles-design.md`
(owner-approved November 19, 2026), §4 behavior, §6 fork, §8 acceptance. It is on
`main` (bnfy/blanc#1639, #1642); `chromium/next` gets it with Task 1's merge.
The Electron build it follows is #1642: `src/main/spaces-across-profiles.js`,
`openSpaceInProfile` and `createSpaceInProfile` in `src/main/main.js`, and the
menu and editor in `src/renderer/workspace-ui.js`.

## What the fork has today

- **Spaces store.** Names, colors, symbols, tab counts, order and deleted ids are
  the profile pref `blanc.spaces.meta` (`{order, items: {id: {name, color,
  symbol, tabCount}}, deleted}`, registered by patch 0030). Tabs are in
  `<profile>/BlancPrototypeSpaces.json`. The store's rules (name check, limit 25,
  identity fallback) live in the Island host, `host.js` lines 405–560, which asks
  native for `spaceMeta`, `spaceMetaSave`, `spaceFocus`, `spaceOpenNewWindow`,
  `spaceCreateBlank` (`blanc_prototype_ui.cc` around line 10486).
- **Open in a new window.** `spaceOpenNewWindow` makes a window with one new tab
  and records a `PendingSpaceOpen` under its session id; that window's host asks
  `spacePendingOpen`, swaps to the Space and answers `spacePendingDone`, closing
  itself on failure (`host.js` `openPendingSpace`).
- **Profiles.** Ordinary Chromium profiles (V18; owner, November 16, 2026).
  Link routing already loads another profile with `ProfileManager::LoadProfile`
  and names profiles with `RouteProfileId` (`"default"` or the directory name),
  `RouteProfile` and `RouteProfileName` (Personal for an unrenamed Default).
  `LinkRouteSettings` reads Spaces only from profiles that are loaded.
- **The menu.** The Island renderer is shipping v1.49.1
  (`blanc/island-renderer.json`). Between v1.49.1 and #1642, `workspace-ui.js`
  and `overlay.js` changed only in #1642; `styles.css` also took #1622 and #1624.
- **Tests.** The shipping runner runs the v1.49.1 scenario inventory with
  v1.49.1's step files (`tests/lib/shipping-core.cjs`), so F41-83 to F41-92 are
  not in it. Profiles are created through Chromium's picker
  (`tests/fork-steps/profiles.mjs` `createProfile`, `profileHosts`).

## Decisions for the owner

1. **The mirror is a Local State dictionary keyed by profile directory
   (recommended).** `blanc.spaces.profiles` maps `"Default"`, `"Profile 1"`, … to
   `{order: [ids], items: {id: {name, color, symbol, tabCount}}}`, the same keys
   Chromium uses for its own `profile.info_cache`. The alternative, an attribute
   on each `ProfileAttributesEntry`, needs a patch to Chromium's
   `profile_attributes_entry.{h,cc}` for a value Chromium never reads; the
   dictionary needs only one registration line in `browser_prefs.cc`.
2. **Opening loads the profile the way the picker does, then opens the Space in a
   new window of it without restoring that profile's last session
   (recommended).** `profiles::LoadProfileAsync` (the picker's loader), then the
   fork's own new-window open. `profiles::SwitchToProfile` would also restore
   the profile's last session or its startup pages, so a Space would arrive
   with extra windows beside it. That breaks the spec's "opening something must
   never cost you tabs, and nothing else changes".
3. **The menu comes from #1642 at a pin of its own (recommended).**
   `chromium/blanc/spaces-menu.json` pins #1642's merge commit for
   `workspace-ui.js` and `overlay.js` and its nine new strings; #1642's three
   `styles.css` rules are anchored edits on v1.49.1's stylesheet. It never trails
   the renderer pin and is deleted when the renderer moves past #1642. Moving the
   whole renderer and scenario inventory to a release with #1642 is a separate
   job (the last move, `384b409d5`, touched 33 files).
4. **F41-83 to F41-92 run as a native check until the shipping target moves
   (recommended).** `tests/native-spaces-across-profiles.mjs` runs each
   scenario's steps by the fork's means, as `native-link-routing.mjs` and
   `native-favorites-manager.mjs` do. The shipping runner picks the scenarios up
   when the inventory moves past #1642.

### Divergences from Electron Blanc, for the owner

*Renumbered November 19, 2026:* `chromium/next` recorded its own V32 the same
day (e41e713fa), so the proposed V32 and V33 below are recorded as **V33** and
**V34**; V31 keeps its number.

- **V31 (proposed): a profile's Spaces are listed once it has been opened in a
  build with the mirror.** Until then its mirror is empty and it shows no Spaces
  (it still appears in the editor's Profile choice). Every profile that has
  windows at launch, or is opened later, writes its mirror then. The
  alternative is reading the profile's `Preferences` file from disk without
  loading it, which is custom code around Chromium's pref system. Not
  recommended.
- **V32 (proposed): other profiles are in Chromium's order.** This window's
  profile first, then Personal, then the rest in
  `GetAllProfilesAttributesSortedForDisplay` order (the profile picker's). Shipping
  uses its Settings order. The fork's Settings shows Chromium's profiles, so this
  is still the fork's Settings order.
- **V33 (proposed): no "Couldn't read this profile's Spaces." line.** The mirror
  is always readable, and an invalid entry reads as a profile with no Spaces.
  `status` is always `saved`.
- **Already true, unchanged here:** the fork's Spaces menu draws no Shared Spaces
  sync marks in any window, so F41-92 checks only that Personal's Spaces show
  in a Work window as ordinary rows. Headings stay text-only (spec §6). The first
  open of a Space in a profile with no window loads that profile and takes a
  moment longer (spec §6).

## Global Constraints

- Only these fields cross profiles: a Space's `id`, `name`, `color`, `symbol`,
  `tabCount`, and `openElsewhere`; per profile `id`, `name`, `status`, `full`. No
  URLs, titles, favicons, groups, tab records or sync state (spec §1 anti-goal,
  §5.2).
- `otherProfiles` and `profileName` appear in the payload only with two or more
  live profiles. With one, the payload is byte for byte today's (spec §4.1).
- A live profile: `RouteProfile(id)` finds it (not omitted, not sign-in
  required) and `IsProfileDirectoryMarkedForDeletion(path)` is false. Guest,
  system and off-the-record profiles are never mirrored or listed.
- Opening or creating in another profile never touches the calling window's
  tabs, never runs the unsaved-tabs guard there, and never shows a prompt
  (spec D1, §4.3).
- Another profile allows only an empty start; This window always saves into this
  window's profile, whatever the renderer sends (spec §4.4, §5.3).
- Limits: 25 Spaces per profile (`SPACE_LIMIT`, shipping's `MAX_WORKSPACES`);
  names trimmed, inner spaces collapsed, at most 60 characters, unique per profile
  ignoring case (host.js `spaceName`, `checkSpaceName`).
- Error codes are shipping's: `profile-unavailable`, `not-found`,
  `activation-failed`, `busy`, `duplicate-name`, `limit`, `invalid-name`,
  `storage-failed`, `saved-not-opened`.
- Mini windows hold no Space: no `otherProfiles`, and both new native calls
  answer `busy` (spec §4.6).
- Builds only through `chromium/tools/build.mjs` on the Mac Studio, with no
  release or build running; no hooks, clean, GN or toolchain change; no cold
  build. Browser tests run on the Mac Studio, never the MacBook Pro.
- Never run `third_party/ninja/ninja -t …` in the Studio's outputs.
- No public claim about this in Blanc Beta until a beta that carries it is
  published.

## Review Focus

1. **A double click on another profile's row.** Two requests for the same Space
   while the profile loads must open one window, and both get its result
   (Task 4, `spaceOpenInProfile` joins a pending open).
2. **The Work Space deleted, or Work marked for deletion, between listing and
   choosing.** The menu stays open with `not-found` or `profile-unavailable`, and
   no Work window is left behind (Task 4 tests, Task 6 F41-91).
3. **A damaged or oversized Local State mirror.** Local State is a file a person
   or another program can edit. Reading it must cap rows at 25, drop rows with a
   bad id or empty name, and never pass anything but the allowlisted fields
   (Task 2 tests).
4. **A private tab active in the calling window.** The menu is the same, and the
   Work window opens in Work's normal profile, not off the record (Task 6 check).
5. **Renaming Work in the picker while a Personal menu is open.** The heading
   follows on the next list (`OnProfileNameChanged` pings every window; Task 3
   test).

---

### Task 1: Merge `main` into `chromium/next`

Brings #1642's regenerated typed interface (`browser_api.mojom`,
`browser_api_checks.h`, `island/browser-api-codec.js`: `otherProfiles`,
`profileName`, the `profileId` option, `profile-unavailable`), the spec, the
F41-83 to F41-92 feature text and #1642's commit itself, which Tasks 5 and 6 pin.

**Files:** whatever the merge touches; expect conflicts only in generated
manifests (`chromium/blanc/island-assets.json`, `chromium/source-map.json`).

- [ ] **Step 1:** `git fetch origin && git merge origin/main` on a branch from
  `origin/chromium/next`. Never rebase or force-push.
- [ ] **Step 2:** Resolve generated files by regenerating, not by hand:
  `node chromium/tools/browser-api-mojom.mjs --write`, then the asset manifest
  and source map with the tools that own them (`chromium/tools/assets.mjs`,
  `chromium/tools/apply.py --write-map` or whichever the conflict names).
- [ ] **Step 3:** Run the fork unit suite and the patch check.
  Run: `node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs && python3 chromium/tools/check-patches.py`
  Expected: all pass.
- [ ] **Step 4:** Commit the merge ("Merge main into chromium/next: #1642's
  Spaces contract") and push to `origin/chromium/next`.

### Task 2: The pure cross-profile rules

**Files:**
- Create: `chromium/blanc/browser/ui/spaces_across_profiles.h` (standard
  library only, like `island_proximity.h`)
- Test: `chromium/tools/spaces-across-profiles.test.mjs`

**Interfaces:**
- Produces, in `namespace blanc::spaces_across_profiles`:
  - `inline constexpr size_t kMaxSpaces = 25;`
  - `struct Space { std::string id, name, color, symbol; int tab_count = 0; };`
  - `std::vector<Space> MirrorRows(const std::vector<std::string>& order, const std::map<std::string, Space>& items, const std::set<std::string>& deleted);`
    Rows in `order`, skipping ids missing from `items`, in `deleted`, repeated,
    or `__scratch__`; at most `kMaxSpaces`. Drops a row whose id fails
    `^[A-Za-z0-9_-]{1,120}$` or whose name is empty or longer than 60 code
    points. A `color` not matching `^#[0-9a-fA-F]{6}$` or a `symbol` not
    matching `^[a-z0-9-]{1,40}$` becomes `""`. `tab_count` is clamped to
    0–10000.
  - `struct Profile { std::string id, name; bool live = false; };`
  - `struct Item : Space { bool open_elsewhere = false; };`
  - `struct OtherProfile { std::string id, name, status = "saved"; bool full = false; std::vector<Item> items; };`
  - `std::vector<OtherProfile> OtherProfileSpaces(const std::vector<Profile>& profiles, const std::string& current_id, const std::map<std::string, std::vector<Space>>& mirrors, const std::map<std::string, std::set<std::string>>& shown);`
    Empty unless at least two `profiles` are live. Otherwise every live profile
    but `current_id`, in the given order, with its mirror rows (absent: none),
    `full` when it has `kMaxSpaces` rows, and `open_elsewhere` from `shown`.
    Profiles with no Spaces are kept (the editor lists them).
  - `std::string ToJson(const std::vector<OtherProfile>&)` for the test harness
    only (the `.inc` builds `base::Value` directly).

- [ ] **Step 1: Write the failing test.** Compile a harness with the system
  `c++ -std=c++20 -Wall -Werror` (as `island-proximity.test.mjs` does). Load
  shipping's `src/main/spaces-across-profiles.js` from the commit in
  `chromium/blanc/spaces-menu.json` (Task 5 creates it; until then hard-code
  #1642's merge commit `79f0f2b658e2c453ded60d56cc3aeb394521c654`) and assert:
  - `parity`: for fixtures of one, two and three profiles (one with 25 Spaces,
    one with none, one not live), `ToJson(OtherProfileSpaces(...))` deep-equals
    shipping's `otherProfileSpaces` given the same profiles,
    `readProfile → {status: 'saved', spaces: [{id, name, color, symbol, urls: Array(tabCount)}], shownIds}`.
  - `allowlist`: the JSON's keys are exactly `id, name, status, full, items` per
    profile and `id, name, color, symbol, tabCount, openElsewhere` per item.
  - `one profile`: one live profile plus one not live gives `[]`.
  - `damaged mirror`: 40 ids in `order`, a repeated id, `__scratch__`, an id with
    `<`, an empty name, a 61-character name, `color: "red"` and `tabCount: -3`
    give 25 rows at most, none of the bad ones, `color: ""` and `tabCount: 0`.
- [ ] **Step 2:** Run `node --test chromium/tools/spaces-across-profiles.test.mjs`.
  Expected: FAIL, the header doesn't exist.
- [ ] **Step 3:** Write the header with the signatures above.
- [ ] **Step 4:** Run the test again. Expected: PASS.
- [ ] **Step 5:** Commit ("Fork Spaces across profiles: the pure rules, checked
  against shipping's").

### Task 3: The Local State mirror

**Files:**
- Create: `chromium/patches/0106-blanc-spaces-mirror.patch` (on
  `chrome/browser/prefs/browser_prefs.cc`, already patched; one hunk in
  `RegisterLocalState`: `registry->RegisterDictionaryPref("blanc.spaces.profiles");`)
- Modify: `chromium/lanes/desktop.json` (list the patch; `fileCount` unchanged)
- Create: `chromium/blanc/browser/ui/spaces_across_profiles.inc` (included by
  `blanc_prototype_ui.cc` after `mini_window_controller.inc`, beside the link
  routing code it reuses)
- Modify: `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (include; start the
  mirror where `ObserveLinkRouteProfiles()` runs, line ~1338; two test-only ops)
- Test: `chromium/tests/native-spaces-across-profiles.mjs` (created here, grown
  in Task 6)

**Interfaces:**
- Consumes: Task 2's `MirrorRows`.
- Produces:
  - `constexpr char kSpacesMirrorPref[] = "blanc.spaces.profiles";`
  - `class SpacesMirror final : public ProfileManagerObserver, public ProfileObserver, public ProfileAttributesStorage::Observer` with
    `static SpacesMirror* Get()` (a `base::NoDestructor`) and `void Start()`.
    - `OnProfileAdded(Profile*)` (ProfileManagerObserver, every run): for a
      regular profile, a `PrefChangeRegistrar` on `blanc.spaces.meta` that calls
      `Write(profile)`, then `Write(profile)` once (the backfill V31 relies on).
    - `OnProfileWillBeDestroyed(Profile*)`: drops the registrar; the mirror stays.
    - `OnProfileWasRemoved(path, name)`: erases the mirror key, then
      `NotifySpacesMenus(nullptr)`.
    - `OnProfileNameChanged`, `OnProfileAdded(path)` (storage) and
      `OnProfileMarkedForPermanentDeletion`: `NotifySpacesMenus(nullptr)`.
    - `Write(Profile*)`: `MirrorRows` from the pref, stored under the directory
      base name only when it differs from what is there, then
      `NotifySpacesMenus(profile)`.
  - `void NotifySpacesMenus(Profile* except)`: runs
    `window.BlancPrototypeHost?.spacesChanged()` in every live Island host whose
    original profile is not `except`. `spaceMetaSave` keeps pinging its own
    profile's other windows as today.
  - `std::vector<blanc::spaces_across_profiles::Space> ReadSpacesMirror(const std::string& directory)`:
    read side, through `MirrorRows` again, so a damaged Local State is cleaned
    on every read.
  - Test-only ops in the `quiet_method` block (build flag and `--blanc-test`):
    `spacesMirrorProbe` → `{mirror: <the Local State dict>, loaded: [directory, …]}`
    (`loaded` from `ProfileManager::GetLoadedProfiles()`, regular only);
    `profileDeletionMarkTest [directory, bool]` →
    `MarkProfileDirectoryForDeletion(path)` or `CancelProfileDeletion(path)`,
    then `NotifySpacesMenus(nullptr)`.

- [ ] **Step 1: Write the failing native check.** In
  `native-spaces-across-profiles.mjs` (structure of `native-link-routing.mjs`:
  `NativeFixture`, `installDriver`, `createWorld`, `createProfile`), assert:
  - `mirror written`: after `createProfile(w, 'Work')` and Work's host
    `saveWorkspaceAs('Sprint')`, `spacesMirrorProbe().mirror[workDir]` has one
    row named `Sprint` with exactly the keys `name, color, symbol, tabCount` and
    no other profile's data.
  - `mirror follows edits`: renaming Sprint to Sprint 2 in Work updates the row;
    deleting it removes it from `order`.
  - `listing does not load`: relaunch with Personal's window only (the
    fixture's relaunch keeps session restore); `loaded` excludes Work and the
    mirror still holds Work's row.
  - `rename reaches the heading`: renaming Work to Studio in the picker makes
    Personal's host `listWorkspaces()` name it Studio (needs Task 4; mark the
    assertion as Task 4's until then).
- [ ] **Step 2:** The check can't run before a build; confirm the step text
  matches shipping's intent and move on (Task 6 builds and runs it).
- [ ] **Step 3:** Write the patch and the `.inc` with the interfaces above. Run
  `python3 chromium/tools/check-patches.py` (expected: pass, 105 patches, upstream
  file count unchanged at 207) and the fork unit suite.
- [ ] **Step 4 (optional, before the build):** a syntax-only compile of
  `blanc_prototype_ui.cc` on the Mac Studio with the flags read from
  `out/BlancPrototype/obj/**/<target>.ninja` and `-fsyntax-only`, as the
  `mac-studio-fork-builds` notes describe. Expected: no errors.
- [ ] **Step 5:** Commit ("Fork Spaces across profiles: each profile mirrors its
  Space list into Local State (patch 0106)").

### Task 4: Native open and create in another profile

**Files:**
- Modify: `chromium/blanc/browser/ui/spaces_across_profiles.inc`
- Modify: `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (three methods in the
  Island handler near `spaceMeta`; `PendingSpaceOpen` and `spacePendingOpen` /
  `spacePendingDone`, lines ~2740 and ~10580)
- Test: `chromium/tests/native-spaces-across-profiles.mjs`

**Interfaces:**
- Consumes: Task 2's `OtherProfileSpaces`; Task 3's `ReadSpacesMirror`,
  `NotifySpacesMenus`; `RouteProfile`, `RouteProfileId`, `RouteProfileName`.
- Produces (Island handler methods; the calling window's original profile is
  "this profile"):
  - `spaceOtherProfiles []` → `{}` from a mini window or with fewer than two live
    profiles; otherwise `{profileId, profileName, others}`, `others` from
    `OtherProfileSpaces` with profiles ordered as V32 says, mirrors from
    `ReadSpacesMirror`, and `shown` from live non-mini, non-hold Island windows'
    `space_name` per profile.
  - `spaceOpenInProfile [profileId: string ≤255, spaceId: string ≤120]` →
    `{ok: true, action: 'focus'}` or `{ok: false, error}`:
    1. `busy` from a mini window; `profile-unavailable` if the target isn't live
       or is this profile.
    2. If the target is loaded and a window of it shows the Space: restore that
       window if minimized, `Activate()` it, answer.
    3. Else `profiles::LoadProfileAsync(path, …)`. On load: still live, else
       `profile-unavailable`; the Space is in `blanc.spaces.meta` `items` and
       `order` and not `deleted`, else `not-found`; if a window of it shows the
       Space now, focus it as in 2; else a new window as `spaceOpenNewWindow`
       does (no session restore), with
       `PendingSpaceOpen{kind: open, id}`. The new window's `spacePendingDone`
       answers.
    4. A second request for the same `(profileId, spaceId)` while one is pending
       joins it: both get the same answer.
  - `spaceCreateInProfile [profileId, name, color, symbol]` → `{ok: true,
    action: 'focus', workspaceId}` or `{ok: false, error, workspaceId?}`:
    1. `busy` and `profile-unavailable` as above; `invalid-name` unless the name
       is 1–60 code points after trimming and collapsing spaces;
       `activation-failed` for a `color` or `symbol` that fails Task 2's patterns
       (the editor always sends valid ones).
    2. Load as above; in the loaded profile, `duplicate-name` if a Space in
       `order` has the same name ignoring case (`base::i18n::FoldCase`),
       `limit` at 25.
    3. A new window with `PendingSpaceOpen{kind: create, name, color, symbol}`.
  - `PendingSpaceOpen` becomes `{std::string kind, id, name, color, symbol;
    base::OnceCallback<void(base::DictValue)> done;}`; `spaceOpenNewWindow` uses
    `kind = "open"` and keeps its reply's current shape (`SpaceOpenedElsewhere`
    reads `ok` and `detail` from the dict).
  - `spacePendingOpen []` → `""` or `{kind: 'open', id}` or
    `{kind: 'create', name, color, symbol}` (was a bare id string).
  - `spacePendingDone [ok: bool, detail: string, extra?: {error?, workspaceId?}]`:
    `error` must be one of the Global Constraints codes and `workspaceId` a
    lowercase UUID, else dropped. The waiting caller receives
    `{ok, detail, error, workspaceId}`.

- [ ] **Step 1: Add to the native check** (each runs after Task 6's build):
  - `open from a closed profile`: Work has Sprint and no window; Personal's host
    `openWorkspace(SprintId, {profileId: workDir})` answers `ok`, and
    `windowRuntimes` gains one Work window whose `workspaceId` is Sprint;
    Personal's tabs and `workspaceId` are unchanged.
  - `double open`: two calls without awaiting the first both answer `ok` and
    exactly one new Work window exists.
  - `deleted meanwhile`: Sprint deleted in Work, then the open answers
    `not-found` and no Work window was added.
  - `marked for deletion`: `profileDeletionMarkTest [workDir, true]`, then the
    open answers `profile-unavailable` and `spaceOtherProfiles` no longer lists
    Work; cancel the mark afterwards.
  - `create`: `createBlankWorkspace('Planning', {profileId: workDir, color,
    symbol})` answers `ok`; a Work window shows Planning with one new tab;
    Work's mirror lists Planning; a second create of `planning` answers
    `duplicate-name` and opens no window.
- [ ] **Step 2:** Implement the methods and the `PendingSpaceOpen` change.
- [ ] **Step 3:** Run the fork unit suite and `check-patches.py`. Expected: pass.
- [ ] **Step 4:** Commit ("Fork Spaces across profiles: open and create a Space
  in another profile through Chromium's profile loading").

### Task 5: The menu: #1642's files at their own pin, and the host

**Files:**
- Create: `chromium/blanc/spaces-menu.json`:
  `{note, commit: "79f0f2b658e2c453ded60d56cc3aeb394521c654", files: ["workspace-ui.js", "overlay.js"], messages: ["ws.row.titleProfile", "ws.row.titleProfileShown", "ws.row.openInProfile", "ws.profile.unreadable", "ws.editor.profile", "ws.editor.profileDisabled", "ws.editor.helpOtherProfile", "ws.switcher.profileLabel", "ws.error.profileUnavailable"]}`
- Modify: `chromium/tools/island-renderer.mjs` (files the record lists come from
  its commit; `EDITS['styles.css']` gains #1642's three hunks, anchored on
  v1.49.1's text: the `.ws-row:hover .ws-row-count` selector, the
  `.ws-profile-heading` rules after `.ws-empty`, the `.ws-select` rules after
  `.ws-name:focus`)
- Modify: `chromium/tools/interface-strings.mjs` (`withFavoritesPage` becomes
  `withPinnedMessages`: the Favorites pin's `favorites.*` keys, and the Spaces
  menu pin's listed keys, from their commits, into both catalogs)
- Regenerate: `chromium/blanc/island/{workspace-ui.js,overlay.js,styles.css,strings.js}`,
  `chromium/blanc/island/pages/strings.js`, `chromium/blanc/island-assets.json`
- Modify: `chromium/blanc/island/host.js`
- Test: `chromium/tools/spaces-menu-pin.test.mjs`; `island-renderer --check`;
  `interface-strings --check`

**Interfaces:**
- Consumes: Task 4's methods.
- Produces in `host.js`:
  - `spaceProjection` adds `otherProfiles` (`others` when non-empty, else
    `undefined`) and `profileName`, from one `request('spaceOtherProfiles')` per
    projection; `ownProfileId` is kept from it.
  - `otherProfileTarget(options)` → `options.profileId` when it is a string other
    than `ownProfileId`, else `null` (today's path).
  - `openSpace(id, options)`: with a target, `request('spaceOpenInProfile',
    [target, id])` under a 30-second give-up (a cold profile load is slower than
    the 20 s same-profile path), then `settleElsewhere(result)`; never
    `switchGuard`.
  - `createBlankSpace(name, options)`: with a target, check the name with
    `spaceName`, take identity from `spaceIdentity` over the target's items in
    `otherProfiles`, `request('spaceCreateInProfile', [target, name, color,
    symbol])`, then `settleElsewhere(result)`. `saveSpaceAs` never reads
    `profileId`.
  - `openPendingSpace` handles `{kind: 'open'}` as today. For `{kind: 'create'}`
    it runs `createBlankSpace`'s steps in its own window and profile (name check,
    limit, `spaceCreateBlank`, the meta write through `spaceMetaSave`, so Personal's
    Spaces sync picks a new Personal Space up, then `swapToSpace`), without
    `switchGuard`: the window holds only the new tab it was made with. It passes
    `{error, workspaceId}` to `spacePendingDone`, and closes itself on failure as
    an open does. Factor those steps out of `createBlankSpace` as
    `createSpaceHere(name, identity)` so both paths share them.
  - **The focus fix (#1642's `settleElsewhere`):** `settleElsewhere(result)`
    sets `focusLeftWindow = true` and runs `close(false)` when `result.ok` and
    `result.action === 'focus'`, for same-profile Show window too. `close(focus)`
    treats `focusLeftWindow` as `focus = false`; `show()` clears it. So the
    menu's own `api.closeOverlay()` after the result never calls `focusPage`,
    and the window that came forward stays in front.

- [ ] **Step 1: Write the failing tests** in `spaces-menu-pin.test.mjs`:
  - `pin`: the record's commit is an ancestor of `HEAD`; `generate()` takes
    exactly the listed files from it; the renderer ref is not a descendant of it
    (fails once the renderer moves past #1642, telling the mover to delete the
    record and the three `styles.css` edits).
  - `strings`: every `blancI18n.t('…')` key in the generated `workspace-ui.js`
    and `overlay.js` resolves in all six languages of `blanc/island/strings.js`.
  - `styles`: the generated `styles.css` contains `.ws-profile-heading`,
    `.ws-select` and `.ws-row:not(.ws-row-elsewhere):hover .ws-row-count`.
  - `host routing` (source checks, as `island-adapters.test.mjs` does): `openSpace`
    and `createBlankSpace` call `otherProfileTarget` before `switchGuard`;
    `saveSpaceAs` doesn't mention `profileId`; `close` honors `focusLeftWindow`.
- [ ] **Step 2:** Run `node --test chromium/tools/spaces-menu-pin.test.mjs`.
  Expected: FAIL.
- [ ] **Step 3:** Add the record, the generator changes and the host changes;
  `node chromium/tools/island-renderer.mjs --write`,
  `node chromium/tools/interface-strings.mjs --write`, then the asset manifest.
- [ ] **Step 4:** Run the new test, `island-renderer.mjs --check`,
  `interface-strings.mjs --check`, and the fork unit suite. Expected: PASS.
- [ ] **Step 5:** Commit ("Fork Spaces across profiles: #1642's menu at its own
  pin, and the host opens and creates in other profiles").

### Task 6: Build, the acceptance check, and records

**Files:**
- Modify: `chromium/tests/native-spaces-across-profiles.mjs`
- Modify: `chromium/STATUS.md` (a Current work entry; V31–V33 under
  Native-versus-port decisions once the owner approves them),
  `chromium/tracker.json` (F41 basis), the spec's Status line (fork part: this
  plan, then the candidate)

- [ ] **Step 1: Finish the native check.** One check per scenario, named by its
  id, in the scenario's words, driving the Personal window's real menu in its
  overlay frame (open the Spaces menu, click rows and editor controls), with
  `createProfile(w, 'Work')` for Work:
  - **F41-83:** Personal only, Space Home: no `.ws-profile-heading`; New Space
    has no Profile select.
  - **F41-84:** headings `Personal` then `Work`; Home under Personal before
    Sprint under Work.
  - **F41-85:** Personal shows a web page; choosing Sprint under Work opens one
    new Work window showing Sprint; Personal's tabs are unchanged and no
    unsaved-tabs prompt appeared.
  - **F41-86:** a Work window shows Sprint behind Personal; choosing Sprint makes
    that window `windowActive` and it is still active 1 s after the menu closed
    (the focus fix); no window was added.
  - **F41-87:** Sprint set aside in Work with a typed draft (a second Work window
    switched away from it); choosing it opens a new Work window with the draft
    still in the field.
  - **F41-88:** in the editor, choose Work: Start with is Empty and This window
    is disabled; create Sprint: a new Work window shows it with one new tab, and
    Work's list has it.
  - **F41-89:** Sprint under Work has no `.ws-row-more`, no context menu and
    isn't draggable.
  - **F41-90:** typing Sprint in the Quick Switcher shows "Space · Work";
    choosing it opens a Work window showing Sprint.
  - **F41-91:** `profileDeletionMarkTest [workDir, true]`, reopen the menu:
    neither Work nor Sprint shows; cancel the mark.
  - **F41-92:** in a Work window, Personal's Space shows under Personal with no
    sync mark element.
  - Plus Review Focus 4: with a private tab active in Personal, F41-85's open
    still lands in a normal Work window.
- [ ] **Step 2: Build on the Mac Studio**, after checking nothing builds or
  releases (`pgrep -fl siso`, `records/beta*-work/state.json`, `gh release
  list`): stage `chromium/`, dry-run `tools/apply.py --src ~/Projects/Blanc/src
  --previous-map <the tree's map>`, then `--apply --backup
  ~/Projects/Blanc/records/spaces-across-profiles`; `node
  chromium/tools/build.mjs ~/Projects/Blanc/src --check --out=BlancPrototype`;
  review the plan (one patched upstream file and `blanc_prototype_ui.cc`, no GN
  change); `--build`. Never during the 02:00 nightly.
- [ ] **Step 3: Run the check** in the Studio's test worktree
  (`~/Projects/Blanc/scratch/tests`, app copied with `cp -Rc`, candidate id
  `macos-` + the first 16 of the framework SHA-256):
  `node chromium/tests/native-spaces-across-profiles.mjs config.json out/spaces-across-profiles`.
  Expected: every check passes. Then the F41 and local-profiles slices of the
  shipping runner, which must not change: F41's 84 applicable cases still pass.
- [ ] **Step 4: Records.** STATUS.md entry with the candidate, the check's
  result, patch totals (105 patches, upstream files unchanged at 207, one hunk added),
  what wasn't checked (Windows; a real mouse; the menu at the smallest window
  with many Spaces; a site signed in only in Work, spec §9's hand check), and
  the proposed V31–V33. Commit and push to `origin/chromium/next`.

## Not in this change

- Moving the renderer pin or scenario inventory past #1642 (decision 3).
- `LinkRouteSettings` reading the mirror, so Settings → Profiles lists Spaces of
  profiles that aren't loaded. It's a small follow-up once the mirror exists.
- Profile avatars or colors in the headings (spec §6; needs a D-number if built).
- Windows hand checks. The cross build compiles this code, but this plan's
  check runs on macOS only.
- Android and iPhone, which have no local profiles (D25).
