# A4 sync spike

Can shipping desktop's sync run in the sandboxed V8 runner on Android? Yes.

## Results

- **Bundle.** `sync.js` at v1.46.0 pulls in 64 modules, 537 KB as one script. A small bundler in `chromium/tools/build-sync-bundle.mjs` reads the tag from git, so no new dependency is needed. The real `settings.js`, `bookmarks.js` and `store.js` load unchanged, so nothing needs a stand-in.
- **Shims.** Eight small modules cover what bare V8 lacks: `crypto`, `fs`, `path`, `electron`, `async_hooks`, `os`, `child_process`, `url`, plus a prelude for `Buffer`, `URL`, timers and `AbortController`. Crypto is BoringSSL and URL parsing is GURL, both in the utility process.
- **Emulator.** In the jitless sandboxed utility, against the real Worker code (`createSyncFixture` over `adb reverse`): the bundle loads and answers `sync.status` in about 170 ms; `sync.startNew` wraps the key in Android Keystore and finishes a full first sync in about 270 ms; a Node peer joins with a pairing code the phone generated and receives a Favorite the phone saved. The join itself takes under a second.
- **Limits met.** `SimpleURLLoader` allows 5 MB as a string. The Worker caps a blob at 512 KB, so 4 MB is ample. Shipping's request window (10 GETs in 60 s) applies as on desktop, so a second full pass right after the first waits for the window.
- **Still owed:** scrypt time, and the utility's resident memory on its own. Task 3 records both.

## Rulings

- Keep the spike's runner code as Task 2's start, and still write Task 2's tests first and watch them fail. Rewriting identical code proves nothing. Cost if wrong: none.
- Background start (Step 3) moves to the start of Task 9. A4a and the first half of A4b don't depend on it, and a failure there changes only background sync, not the runner. If it fails, it goes to the owner. Note for Task 9: `chrome_java` depends on Blanc's Java, so a worker that starts Chromium lives in a patch, and Chromium's own `BackgroundTaskScheduler` is the alternative to WorkManager. Cost if wrong: Task 9 takes longer.
- **One scanner, in the app, on every phone: `camera2` with ZXing core (Apache-2.0).** The design said the Play services scanner with a CameraX fallback. Chromium's tree has neither library. The iPhone's scanner is in-app and asks for the camera, so this matches it, needs no Play services and removes a Google dependency, and Review Focus 3 holds by construction. Cost if wrong: a camera permission prompt that the Play scanner wouldn't need.
- The jar stays out of git, pinned by hash, as the blocker bundle does, and is listed in the notices.

## What the iPhone does (these override the plan where they differ)

- It applies and publishes only `theme`, `searchEngine` and `adblockEnabled`. Every other synced setting is kept and republished unchanged.
- `adblockExceptions` doesn't sync on the iPhone in either direction. Android matches: exceptions stay on the device, including any set in a private tab. Task 5 Step 3 assumed otherwise.
- It publishes the fixed name "iPhone" and platform `ios`, and a chosen name lives in `deviceNames`. Android publishes "Android" and `android`. Shipped send and closed-tab models turn an unknown platform into an empty one and keep the entry.
- Other devices and sent pages live in the palette, above and below each other, and on the Start Page. Sending is from the Island menu and `/send`. No notifications, ever.
- Recently closed is one merged band, and synced rows show only with the Spaces switch on.
- The Sync sheet starts with Pair with Blanc (QR). Other ways then shows the code field, then the passphrase account. The iPhone renames only itself.
