# Spaces across profiles

**Date:** 2026-11-19
**Status:** the owner settled the design questions in §2 and approved it on November 19, 2026. The Electron build is implemented on `feat/spaces-across-profiles` (plan `docs/superpowers/plans/2026-11-19-spaces-across-profiles.md`), not yet released. The fork's part (§6) is implemented on `chromium/next` per `docs/superpowers/plans/2026-11-19-fork-spaces-across-profiles.md` (November 19, 2026): on candidate macos-8614a3a373fe16f9 the native check passes 20 of 20, F41-83 to F41-92 included, with V31, V33 and V34 proposed as divergences.
**Builds on:** Blanc Spaces (F41; `workspaces.js`, `workspaces-model.js`, `workspace-controller.js`, `src/renderer/workspace-ui.js`; redesign spec `2026-10-13-blanc-spaces-redesign-design.md`), local profiles (F33; `local-profile-model.js`, `local-profiles.js`, `window-runtime-registry.js`), link routing (F60; `link-routes.js`, spec `2026-10-26-link-routing-design.md`), and the Arc Spaces import (F45; spec `2026-10-11-arc-spaces-import-design.md`).

## 1. Why

On November 19, 2026, a Blanc user who came from Arc emailed. In Arc, each Space could carry its own profile, with its own cookies, cache, logins and extensions. They kept personal and work accounts for the same websites side by side and moved between them by changing Space. In Blanc a Space is a set of tabs inside one local profile. Named profiles already keep separate cookies, site data, Favorites, history and permissions, but each profile lives in its own windows, and the Spaces menu shows only the window's own profile. To this user, Spaces "feel like glorified tab groups".

What they want is simple: switch to a work Space without hunting for the window that has the right sign-ins.

### Goals

- From any ordinary window, the Spaces menu reaches every Space in every local profile.
- Choosing another profile's Space puts it in front of you in a window of that profile, with that profile's sign-ins, in one step.
- You can create a Space in another profile without first finding one of its windows.
- With one profile, nothing looks or behaves differently.

### Non-goals

- **A window changing profile when its Space changes (Arc's model).** A window's `profileId` is fixed when it is created (`window-runtime-registry.js`), and tabs, sessions, Favorites, Start Page state, link routing and Move to Space all rely on that. Making it change would be a large change to an Electron build that the Chromium fork is meant to replace. This design keeps one profile per window, and choosing a Space in another profile moves you to another window.
- **Moving tabs between profiles.** A tab's page lives in its profile's session, along with its cookies and sign-ins. Move to Space ▸, Move Group to Space ▸ and **Start with: This window** keep to the window's own profile (§4.5).
- **Per-profile extensions or password managers.** Blanc has no general extension runtime (only managed uBlock Origin), and 1Password fill works across the whole app, not per profile. Nothing here changes that, and the copy must not suggest otherwise.
- **iPhone and Android.** The phones have no local profiles (D25).
- **Mapping Arc profiles to Blanc profiles during the Arc import.** F45 still lands every Space in the current profile. Possible follow-up: §10.

### Anti-goals

This would be a failure even if it technically worked:

- The menu with one profile looks or behaves even slightly differently from today's.
- One profile's pages, titles, addresses or sign-ins reach another profile's window. Only the Space list's own fields cross over (§5.2).
- Choosing a Space in another profile closes, replaces or asks about tabs in any window. Opening something must never cost you tabs.

## 2. Decisions (owner, 2026-11-19)

| # | Question | Decision |
|---|---|---|
| D1 | You pick another profile's Space and it isn't open in any window | **It opens in a new window of that profile.** No existing window's tabs are touched, and no unsaved-tabs prompt appears. A Space that's already open in a window of its profile brings that window forward, as today. Rejected: switching that profile's most recently used window to the Space. That would mean fewer windows, but the unsaved-tabs prompt would come up in a window you weren't looking at. |
| D2 | Who sees other profiles' Spaces | **Always, once there are two or more profiles,** grouped under profile names, with this window's profile first. There is no setting. Work's Space names will show in Personal windows (for example while you share your screen); the owner accepted that. |
| D3 | Creating a Space in another profile | **A Profile choice in the New Space editor,** shown only with two or more profiles and defaulting to this window's profile. Another profile allows only an empty start, and the new Space opens in a new window of that profile. |
| D4 | Which build first | **Both, Electron first.** The shipping build reuses link routing's path and is small. The fork follows, built on Chromium's own profiles, with divergences recorded (§8). |

## 3. Approaches considered

1. **A cross-profile Spaces menu, one profile per window (chosen).** The menu lists every profile's Spaces. Choosing one goes through the same controller call link routing already makes for a Space in another profile: bring forward the window holding it, or open it in a new window of its profile. It's small, adds no new state, and every tab rule stays the same.
2. **A window that changes profile with its Space (Arc's model).** This is the closest to what the user had in Arc, but a window's profile would have to change across tabs, sessions, the Start Page, Favorites, link routing, Move to Space and session restore. It would also be built again in the fork, which uses Chromium profiles, where one browser window belongs to one profile by design. Rejected for now. This design doesn't rule it out later.
3. **A profile switcher next to the Spaces menu.** Chromium-style: pick a profile, get its window. It's cheaper still, but you would still pick a profile first and then a Space inside it. That's the hunting the user complained about, and it adds a second control. Rejected.

## 4. Behavior

### 4.1 One profile: unchanged

With only Personal, the menu is exactly today's: no headings, no Profile choice in the editor, and the same rows, commands, empty state and Arc import row. The F41 scenarios pass unchanged. The same holds when other profiles exist but none has a Space and the editor's Profile choice isn't open (see §4.2's heading rule).

### 4.2 Several profiles: the list

```
┌───────────────────────────────┐
│ PERSONAL                      │  ← heading, this window's profile
│ [■] Home                 ✓  8 │
│ [■] Reading                 3 │
│ WORK                          │  ← other profiles, in Settings order
│ [■] Sprint            Show window │
│ [■] Hiring                  5 │
│ STUDIO                        │
│ [■] Clients                12 │
│ ───────────────────────────── │
│ ＋ New Space…                 │
│ Recently Deleted (1)          │  ← this window's profile only
└───────────────────────────────┘
```

- **Headings appear only when at least two profiles have something to show.** "Something" means at least one Space, or this window's profile when it has none (its empty-state line, below). A profile with no Spaces is left out, and you reach it through the editor's Profile choice. *(My call: the list stays short, and an empty profile in the list would be a dead end.)*
- **Order:** this window's profile first, then the others in Settings → Profiles order, Personal first among them. Within a profile, the profile's own Space order. *(My call.)*
- **The heading** is the profile's name in the same quiet uppercase style as the ⌘L panel's group headers. It can't be focused or clicked. Profiles have no color or avatar in the Electron build, and this design adds none.
- **This window's profile's rows** behave exactly as today: ✓ on the current Space, ••• and the editor, right-click Edit…/Delete, drag and Option/Alt+↑/↓ to reorder, Delete with Undo.
- **Another profile's rows** show the Space's tile, name, and tab count, or **Show window** when a window of that profile already shows it. They open only. They have no •••, no right-click menu, no drag, and none of them is ever "current". Editing, reordering and deleting stay in that profile's own windows, which keeps Undo and Recently Deleted inside one profile. *(My call; see §10.)*
- **The row's tooltip and accessible name** add the profile: "Sprint · Work · Opens in a Work window · 5 tabs" (§7).
- **Empty state:** if this window's profile has no Spaces but another has, this profile's heading shows the existing empty-hint line and the other profiles follow. **Import Spaces from Arc** shows only when no profile has a Space, as today.
- **Recently Deleted** lists this window's profile only, as today.
- **A profile whose Space file can't be read** (`read-failed`, `future-format`, `repair-failed`) shows its heading and one quiet line, "Couldn't read this profile's Spaces." A profile being deleted (marked in `profile-deletions.json`) is left out entirely.
- **Keyboard:** ↑/↓ and Home/End move across every row of every profile, skipping headings, and Return opens. Escape closes the menu and returns focus as today.
- **Height:** with up to 16 profiles and 25 Spaces each, the list scrolls within the menu's existing room (the "Twenty five workspaces remain reachable in a small viewport" rule applies to the whole list).

### 4.3 Opening another profile's Space

When you choose a row from another profile:

1. If a window of that profile shows the Space, that window comes forward: restored if it was minimized, then focused. This is today's **Show window**.
2. If the Space is set aside in that profile (kept loaded out of sight after a switch, D22 of the redesign spec), it opens in a new window of that profile with its pages as they were, the way link routing opens a set-aside Space.
3. Otherwise it opens in a new window of that profile from its saved tabs (D1).

In every case the menu closes, and nothing in the window you came from changes. No unsaved-tabs prompt appears, because no window's tabs are replaced. The new window takes focus. If the open fails (the Space was deleted meanwhile, a disk error, the profile started deleting), the menu stays open on the list and shows the existing error line for that cause, such as "That space is no longer available."

### 4.4 Creating a Space in another profile

- With two or more profiles, the New Space editor gains a **Profile** row above **Start with**: a pop-up list of profile names that defaults to this window's profile. With one profile, the row doesn't exist.
- Choosing another profile:
  - sets **Start with** to **Empty** and disables **This window**, with the help line "Tabs stay in their own profile, so a Space in Work starts empty." (§7);
  - checks the name against that profile's Spaces, because names are unique per profile, not across profiles;
  - disables a profile that already has 25 Spaces, with the existing limit message as its reason.
- **Create Space** saves the empty Space in that profile and opens it in a new window of that profile. If the save works but opening fails, the existing "The space was saved, but Blanc couldn't open it" message is shown.
- The editors reached from a tab or group (**Move to Space ▸ → New Space…**, Move Group, a link's New Space) never show the Profile row: what they carry can't change profile.

### 4.5 What stays within one profile

- **Move to Space ▸ / Move Group to Space ▸** list only the window's own profile, as today. Moving a page into another profile would sign it out.
- **Sending a link to a Space** (`space-open-link.js`) stays within this profile. Sending a link into another profile is link routing's job (F60).
- **`/space <name>`** still switches to or creates a Space in this window's profile only. A name typed in another profile shouldn't create a Space in this one by accident, so typing the exact name of another profile's Space does nothing different from today. *(My call.)* Its New Space editor has no Profile row (fixed November 19, 2026, after a review found `/space <name>` offering it).
- **The Quick Switcher** (⌘L, typing) does match other profiles' Space names. A result shows the Space's tile, its name and "Space · Work", ranks below this profile's Spaces, and opens as in §4.3. *(My call: this is the fastest way to reach a work Space, and it's read-only.)* When that open is refused (the profile is going away, the Space is gone, or it can't open), the Spaces menu opens on its list with the reason, since the Quick Switcher opened it with the menu closed.

### 4.6 Private tabs, Mini windows, Shared Spaces

- **Private tabs.** Blanc has private tabs, not private windows: ⌘⇧N opens a private tab in an ordinary window. The menu is the same whether or not the active tab is private. Opening another profile's Space never brings private tabs along (Spaces never hold them), and the new window starts in that profile's normal session.
- **Mini windows** (`runtime.mini`) hold no Space. The Spaces button and mark are hidden there (`data-mini-window`), so the cross-profile menu can't be reached from a Mini window, and `/space` keeps returning `busy`. **Open in Blanc** turns a Mini window into an ordinary one, after which the menu works as described. A Mini window never counts as "the window showing" a Space.
- **Shared Spaces** (Spaces synced through Profile Sync) belong to Personal only. In a Personal window, Personal's group keeps its sync marks, the library count and the recovery notice exactly as today. In another profile's window, Personal's shared Spaces appear as ordinary rows: no sync marks, no counts and no recovery notice, because sync status is Personal's own surface. Creating a Space in Personal from a Work window goes through Personal's store, so Spaces sync's automatic sharing picks it up as it would any new Personal Space.

## 5. Electron build

### 5.1 Opening and creating: reuse link routing's path

`openSpaceForRoutedLink` in `main.js` already opens a Space of any profile. It calls `workspaceController.open` inside `withLocalProfile(profileId, …)` with a stand-in caller `{ id, profileId }` and `{ newWindow: true }`. The controller then focuses the window holding the Space (`workspaceOwner` matches by profile) or stages it in a new runtime of that profile (`openElsewhere`). The menu's cross-profile open must use this same function, extended with what the menu needs (focus, and its result for the error line), not a second path. *(Builder: rename or generalize it, for example `openSpaceInProfile`; keep one function.)*

Creating uses `workspaceController.create` the same way: inside `withLocalProfile(target, …)` with a stand-in caller of that profile and `{ newWindow: true }`. Its validation already runs against the profile in context.

Both refuse a profile that isn't live (`linkRouteLiveness.isLiveProfile`) or is being deleted, and a target equal to this window's profile takes today's path unchanged.

### 5.2 The menu's data

`workspacesProjection()` keeps its current fields for this window's profile, so the strip, the rail mark and the ⌘L footer button are unaffected. Only when two or more live profiles exist does it add:

```
otherProfiles: [{ id, name, status, items: [{ id, name, color, symbol, tabCount, openElsewhere }] }]
```

- **Only these fields cross profiles:** a Space's id, name, color, symbol, tab count and whether a window shows it. No URLs, titles, favicons, groups or sync state. This is the boundary the anti-goal in §1 protects, and the comment above `broadcastWorkspacesUpdated` must be updated to say so.
- Each profile's list is read through `withLocalProfile(id, () => namedWorkspaces.list())`, as `linkRouteTargets()` already does for Settings. The first read of a profile loads (and if needed repairs) its file once, then uses the cache.
- `broadcastWorkspacesUpdated()` already recomputes for every window after a change, so a Space created or renamed in Work refreshes the list in Personal windows.
- `browser-api/contract.json` gains the new field and the open and create options (§5.3). `npm run browser-api:build` regenerates the vectors.

### 5.3 IPC

- `chrome:workspaces-open` takes an optional `profileId` in its options. Main validates it (a live profile, not being deleted, a real Space id in that profile) and never trusts the renderer's notion of which window holds what.
- `chrome:workspaces-create-blank` (the editor's **Empty** start) takes the same optional `profileId`. **Start with: This window** goes through a separate call, `chrome:workspaces-save-as` (`api.saveWorkspaceAs` in `submitNew`), which gets no `profileId` and always saves into this window's profile. So the editor sends every create in another profile through create-blank, and a This-window save can never reach another profile, whatever the renderer sends.
- Every other `chrome:workspaces-*` channel (update, remove, move-to, restore, forget) stays this-profile-only and gets no `profileId`.

### 5.4 Strings

New keys go in `copy/messages/en.json` and every shipped language in the same PR (§7). `ws.row.title` gains a variant with the profile.

## 6. Chromium fork

The fork uses Chromium's own profiles (owner direction, November 16, 2026): imported named profiles are ordinary Chromium profiles, and a Space's name, color, symbol and order are the profile pref `blanc.spaces.meta` (patch 0030), with tabs in that profile's `BlancPrototypeSpaces.json`.

- **Listing another profile's Spaces** can't just read its prefs: a profile that isn't loaded has no `PrefService`, and loading one starts its services. The fork keeps a small mirror of each profile's Space list in Chromium's shared Local State, beside the attributes Chromium already keeps per profile in `ProfileAttributesStorage`. Each profile writes its mirror whenever `blanc.spaces.meta` changes; it holds the same fields as §5.2 and nothing more. The menu reads the mirror for other profiles. *(Builder: whether the mirror is a Local State dictionary keyed by profile path or an attribute on the profile's entry is yours.)*
- **Opening** goes through Chromium: load the profile the way the profile picker does (`ProfileManager` / `profiles::` helpers, not custom code), then use the fork's Spaces open-in-new-window for a browser of that profile. A Space shown in a browser of that profile brings that browser forward.
- **Headings** use the profile's Chromium name. Chromium profiles do have an avatar and color, but the heading stays text-only, as in the Electron build, until the owner chooses otherwise (divergence candidate, §8).
- **Mini windows, Shared Spaces and private tabs:** the same rules as §4.6, keyed to the fork's own Mini window and Personal-only Sync.
- **A profile with no window open** isn't running. Listing its Spaces reads only the mirror and never starts it. Opening one of its Spaces starts that profile, as opening any Chromium profile's window does, so the first open can take a moment longer than a Space in a profile that's already running. *(My call: unavoidable with Chromium profiles, and the same cost as the profile picker.)*
- **A separate plan.** The fork's work goes on `chromium/next` through the guarded build and the beta cadence, so it gets its own implementation plan after the Electron build ships. The Electron plan doesn't wait for it.

## 7. Copy

US English, plain words; the feature is "Spaces" in every heading and label.

| Where | Text |
|---|---|
| Group heading | the profile's name, e.g. **Work** |
| Row tooltip and accessible name, another profile | "{name} · {profile} · Opens in a {profile} window · {count} tabs" |
| Row tooltip, another profile, shown elsewhere | "{name} · {profile} · Show window" (reuses `ws.row.showWindow`) |
| Unreadable profile | "Couldn't read this profile's Spaces." |
| Editor row label | "Profile" |
| Editor help, another profile chosen | "Tabs stay in their own profile, so a Space in {profile} starts empty." |
| Editor help, this profile (existing `ws.editor.help`) | unchanged: "…Spaces share this profile's sign-ins." |
| Quick Switcher result label | "Space · {profile}" |

Release-note line, for whichever release ships it: "**Spaces across profiles.** With more than one profile, the Spaces menu lists every profile's Spaces. Choose one to open it in a window of its profile, with its own sign-ins. You can also create a Space in another profile."

Marketing must not say a Space "has its own profile" or that a window switches profile (it doesn't), or mention extensions per Space.

## 8. Spec records

- **`spec/features.md`:** F41 gains a bullet under "Spaces are profile-scoped": the menu lists other profiles' Spaces as in §4, and opening one never replaces a window's tabs. F33 gains a cross-reference.
- **Acceptance scenarios that change:** none of the existing ones. F41-1 to F41-82, F33-1 to F33-3, F60's link-routing scenarios and `shared-spaces.feature` keep passing unchanged, which is the "one profile is unchanged" guarantee. New scenarios go in `spec/acceptance/F41-named-workspaces.feature`, tagged `@F41 @F33 @desktop`:
  - **F41-83** With one profile the Spaces menu has no headings and no Profile choice.
  - **F41-84** With Personal and Work Spaces, a Personal window lists Work's Spaces under a Work heading after its own.
  - **F41-85** Choosing a Work Space that's open nowhere opens it in a new Work window and leaves the Personal window's tabs as they were, with no prompt.
  - **F41-86** Choosing a Work Space shown in a Work window brings that window forward.
  - **F41-87** A set-aside Work Space opens in a new Work window with its page as it was.
  - **F41-88** A New Space created in Work from a Personal window starts empty, opens in a Work window, and appears in Work's list.
  - **F41-89** Another profile's rows offer no edit, delete or reorder.
  - **F41-90** The Quick Switcher finds a Work Space from a Personal window and opens it in Work.
  - **F41-91** A profile being deleted disappears from the menu.
  - **F41-92** A Work window shows Personal's shared Spaces without sync marks.
  - **F41-93** A Quick Switcher open refused because Work is being deleted opens the Spaces menu with the reason, and no window opens.
  - **F41-94** `/space <name>` with a new name opens the New Space editor without the Profile row.
- **`spec/divergence-register.md`:** if the fork ships heading avatars or anything else from Chromium's profiles, add a D-number for it then. D25 already covers the phones.
- **`spec/parity-matrix.md`:** F41's desktop row notes cross-profile Spaces; iPhone and Android are N/A (D25).

## 9. Testing

- **Unit:** the projection's cross-profile shape and its field allowlist (no URL or title can appear); headings only when two groups show; order; a deleting profile left out; an unreadable profile's status; main refusing `Start with: This window` with another profile and an unknown or deleting `profileId`; `workspace-ui.js` rendering both one-profile and several-profile lists (its existing Node harness).
- **Desktop acceptance:** F41-83 to F41-92 in the runnable profile, using F33's steps to create Work.
- **By hand, before release:** a packaged build with three profiles, checking that the new window really has Work's sign-ins (a site signed in only in Work), the Quick Switcher result, and the menu at the smallest window with many Spaces.

## 10. Left to the builder, and follow-ups

**Left to the builder:** names of new functions and string keys; the heading's exact type style within the existing tokens; how the editor's Profile pop-up is drawn (it must work from the keyboard); the fork's mirror format (§6).

**My calls, for the owner to check while reading:** headings only when two groups show; empty profiles left out of the list; other profiles' rows open only (no edit, delete or reorder); `/space <name>` stays this-profile-only while the Quick Switcher crosses profiles; Shared Spaces marks only in Personal windows.

**Follow-ups, not in this design:**
- Editing, reordering or deleting another profile's Spaces from any window.
- The Arc import offering to put a Space that used its own Arc profile into a chosen Blanc profile (F45 labels those Spaces today).
- Arc's model, where a window changes profile with its Space (§3, approach 2), if this first step proves too few for people coming from Arc.
