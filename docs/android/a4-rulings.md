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
