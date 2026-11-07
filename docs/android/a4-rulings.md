# A4 rulings

The decisions made while building A4 (sync), each with what it costs if wrong. Plan: `docs/superpowers/plans/2026-11-05-android-a4-sync.md`. Spike: `a4-sync-spike.md`.

## A4a: runner, keys, pairing, Profile Sync

- The spike's runner code stayed as Task 2's start, with the tests written after it. Cost if wrong: none; the review and the emulator checks cover it.
- Background start moved to Task 9. Cost if wrong: Task 9 takes longer, and a failure there changes only background sync.
- One in-app scanner for every phone, `camera2` with ZXing core, instead of the Play scanner with a CameraX fallback. It matches the iPhone and needs no Play services. Cost if wrong: a camera permission prompt the Play scanner wouldn't need.
- Site exceptions don't sync, as on the iPhone. This corrects what the plan assumed. Cost if wrong: a site allowed on desktop isn't allowed on the phone.
- Android applies and publishes only the theme and the blocking switch for now, and keeps every other synced setting untouched. The iPhone also applies the search engine; Android joins that when A5 gives it a choice. Cost if wrong: the search engine doesn't follow until A5.
- The device publishes the name "Android" and platform `android`, as the iPhone publishes "iPhone" and `ios`. Shipped send and closed-tab models turn an unknown platform into an empty one and keep the entry. Cost if wrong: an older client shows no platform for this phone.
- `/sync` is the only way in until A5's Settings. The plan's Sunrise menu row is dropped, because the iPhone has none. Cost if wrong: Sync is harder to find until A5.
- A real camera scan isn't automated: the decoder is tested on generated frames and the camera waits for the Pixel. Cost if wrong: a camera fault shows up on the Pixel.
- A refused camera goes straight to the code field with the hint, without the iPhone's separate screen. Cost if wrong: one screen differs.
- A lost Keystore key is acted on when the Sync sheet opens: Sync turns off here only, and the sheet asks for a code. Until then sync stops with an error. Cost if wrong: a person who never opens the sheet stays stopped.
- A setting a newer device added survives on the phone, as on the iPhone, through a layer beside shipping's settings module; so does a newer value for a known setting. Shipping desktop drops both. A Favorite's unknown fields are dropped, as desktop and the iPhone both do on purpose, which narrows the ladder's Review Focus 4. Cost if wrong: a future per-Favorite field wouldn't round-trip through a phone.
- Phone renames and folder moves aren't carried, because Android has no surface for them; the runner's title and folder always win. Cost if wrong: if a Chromium surface ever renames a Favorite, the rename reverts.
- An address Chromium can't hold stays in the runner, out of the plan, and is never deleted. Cost if wrong: that Favorite is missing on the phone.
- The endpoint check in the proxy has no test, because the script has no way to ask for another address. Cost if wrong: only a compromised runner could reach another host.
- The desktop syntax compile of the runner was skipped: its Mojo headers aren't generated in the Mac Studio tree, and desktop doesn't build the target until S4. Cost if wrong: compile fixes at S4.
- Sync's test hooks follow `blanc_enable_test_hooks`, so A7 must build with the release channel or as an official build. Cost if wrong: a release would carry the test receiver, and A7's checks need to confirm it doesn't.

## A4b: open tabs, Send to device, background sync

- Background sync uses Chromium's own `BackgroundTaskScheduler`, not WorkManager. It's the same Android job underneath, already knows how to start Chromium with no window, and needs no new library. Cost if wrong: one job class to move.
- Synced Recently closed moves to A4c, because the iPhone shows those rows only with the Spaces switch on. Cost if wrong: none until A4c.
- This phone's tab icons aren't published yet, so other devices show their default icon. Cost if wrong: plainer rows elsewhere.
- Other-device pages in the Quick Switcher open as a Favorite does. Cost if wrong: a small difference from the iPhone.
- Tabs reach the runner at launch, when the app leaves the screen, and on the 30-second sweep. Cost if wrong: a shared tab can take that long to go out, on top of shipping's own delay.

- The first sync after pairing isn't told the phone is in front for 20 seconds: in front, shipping leaves requests free for change checks, which held a first sync for 15 seconds. Cost if wrong: checks run at the background rate for those 20 seconds.
- The Start Page's sent list belongs to the Ledger layout, so on Android's Billboard it's filled but out of sight, as on the iPhone; the palette is where a person sees it. Cost if wrong: none beyond the iPhone's.

### Fixed in A4b's review

- Saving after a call cancelled a live pairing code (Critical). `sync-bundle.test.mjs`, through `__call`.
- Start Page sent rows did nothing, and an open Start Page never heard list changes.
- The background job could replace itself mid-run, and ended before reconcile settled.
- An address just added to Chromium could read as removed if Blanc died before Chromium saved it. `ProfileSyncTest`.
- Two vacuous tests, now proven: the job's result is read before any window opens, and a private tab really loads.

### Deferred minors

- Other-device lists refresh with three calls per event, not coalesced.
- The tab replay after pairing can miss if the store isn't written yet; the 30-second sweep repairs it.

## Fixed in A4a's review

- A saved agreement could outrun what landed, so a refused or interrupted save read as a removal and deleted the person's bookmark (Critical). Agreement is now written only after the runner confirms and saves. `ProfileSyncTest`, `SyncedFavoritesTest`, and `sync.mjs` "a Favorite saved as the runner dies".
- A runner that didn't answer read as Sync off and wiped the agreement, bringing back deleted Favorites (Critical). `ProfileSyncTest.aRunnerThatDoesntAnswerLeavesWhatWasAgreed`.
- The test driver and endpoint switch were reachable without test hooks; both are now compiled out.
- Keystore ran on the UI thread; it now runs on a background sequence.
- A passing Keystore error counted as a lost key. `SyncSheetTest.aKeystoreHiccupLeavesSyncOn`.
- A newer value for a known setting was overwritten. `sync-bundle.test.mjs`.
- A remote folder move didn't reach the phone, an address Chromium rewrites broke the plan, and whitespace in a title could loop. `SyncedFavoritesTest`, `ProfileSyncTest`.
- A redirect could follow outside the endpoint, a bad header name could crash the browser, and a restart could read an older store. All fixed by reading; no test.

## Deferred minors

- A local theme or blocking change publishes at the next reconcile, not at once. Task 9's foreground hook reconciles on resume.
- Restarting can drop a queued store write; the next write repairs it.

## A4c: Spaces on this phone

Rulings:

- **A switch moves Chromium's real tabs.** Each tab's state, with its Back and Forward, is saved under its own id in `blanc_spaces/tabs`, the switch is written down, the new set comes up frozen, the old tabs close, and Chromium's list is written to disk before the switch counts as finished. An app killed before that finishes the switch on its next launch. Cost if wrong: a tab comes back without its history, never lost.
- **Chromium's tab group sync is off (patch 0109).** It closes any group it doesn't know at launch, with its tabs, and every group a switch brings back is one. Blanc's own Sync carries groups, and off is a state Chromium supports. Cost if wrong: a Chromium feature that assumes it is on; the acceptance gate found none.
- **The set on show isn't kept current in the library.** Chromium owns those tabs, and the set is captured when a switch leaves it. A4d will need it for sharing and should capture without freezing.
- **The card leaves swipe-to-close out.** A tap outside and Back close it. The iPhone also closes on a swipe down, which fights the card's own scrolling on Android.
- **Move to Space is in the grid's card menu only.** The palette's rows have no press and hold.

The review of this milestone found, and these are fixed:

- A grouped tab brought back by a switch was gone after the next restart (Critical). The review put this down to Chromium not saving frozen tabs, but the emulator showed the list and state file on disk and the tab closed at launch by tab group sync. Patch 0109 is the fix: `spaces.mjs`, a tab a switch brought back keeps Back and its group after a restart, failed without it. `TabStateAttributes.setDirty` on thaw stays as a cheap precaution and is unproven: with it removed the same case still passes, because attaching the tab already marks it for saving.
- A kill just after a switch could overwrite a hidden Space with the tabs on show, and a tab reopened under a new id stayed in the new set. `BlancSpacesTest.aSwitchStaysOpenUntilChromiumsListIsOnDisk`, `tabsChromiumReopenedUnderNewIdsAreClosedByTheRecovery`.
- Every tab was written to disk on each pause, and closed tabs' files stayed for good. The pause no longer writes, and launch removes what no hidden set holds. `theSweepDropsFilesNoHiddenSetHolds`.
- A moved tab kept its old group; Undo put a Space at the end of the list; Spaces never showed in palette search; a failed library write still closed the old tabs; a tab closed before a switch could be undone into the wrong set; an unreadable library was overwritten at once; a second delete's Undo acted on the first Space.
- The menu, its tab counts, the shown Space in the grid header, the tile in the Island, the next color and symbol, and TalkBack's color and symbol names now follow the iPhone.

Also fixed: strings with `{name}` went through `replace()` after Android had already turned them into `%1$s`, so send rows and Spaces messages showed the placeholder. That included A4b's send rows.

Deferred minors:

- An iframe's first request can still miss the shield count, the race the main frame had before `shield_page_count.h`.
- A kill between saving a moved tab and closing it leaves the tab in both sets. Nothing is lost, and the next switch settles it.

## A4d: Recently closed

Rulings:

- **The band belongs to the palette, on or off Sync.** This phone's closes are kept in `blanc_closed.json` for 24 hours, 25 rows, as `RecentlyClosedStore.swift` keeps them. Other devices' rows and this phone's synced entry need the Spaces switch, because shipping's `closed` store is one a person agrees to. Cost if wrong: none; desktop and the iPhone do the same.
- **A row is written when the tab closes, and Undo takes it off this phone only**, as on the iPhone. A peer that already synced keeps the row until it expires. Cost if wrong: a page shows as closed on another device for up to a day.
- **Forget is a close button on the row, not a swipe.** The sent rows beside it already work this way. Cost if wrong: one gesture differs from the iPhone.
- **`/reopen` stays on its in-memory list of ten**, separate from the band, as on the iPhone.
