# A3 spike: the desktop fork's blocker on the Android lane

Result: it works. The desktop fork's blocker (`chromium/blanc/services/blocker/`) builds on Chromium
156 for Android and blocks on the emulator, with four small differences from desktop. So A3 keeps
it and doesn't port anything, and the spike's hooks became patch 0106 instead of being thrown away.

| Question | Finding |
| --- | --- |
| Does it compile? | Yes. The hooks needed no change. `blocker_proxy.cc` needed `//extensions/browser` made desktop-only (the extension includes sit behind `BLANC_RESEARCH_HOOKS`), `IsProfileDirectoryMarkedForDeletion` skipped on Android, and Chromium 156's `DocumentService` constructor, which has no pass key yet. |
| Does the V8 utility process start? | Yes, in Android's sandbox with no changes. |
| Does it block? | A request EasyList blocks never reaches the network, a request it allows loads, and an element it hides is hidden, in normal and private tabs. Twelve checks across the four paths (from the Start Page and from a web page, each normal and private): hidden within half a second. |
| How long does the engine take? | The first page after launch took 2.2 s on the emulator with the engine starting (it waits, filtered); later pages about 0.4 s. |
| How much memory? | Blanc gains three sandboxed processes on the first page, 212–299 MB resident each on this debug x86_64 build. `ps` can't tell the blocker's apart, and resident size counts shared pages. The Pixel run should measure it. |
| How does the bundle ship? | As an uncompressed APK asset, `assets/blanc_blocker/engine.js`, read with `base::android::OpenApkAsset` and refused unless its SHA-256 equals `kBlancBlockerBundleSha256`. 8.4 MB. A `.pak` resource would be compressed and need a copy. |
| Is the bundle in git? | No, as on desktop. The build server keeps it in `~/blanc-assets/blocker/`; see `chromium/android/server/README.md`. A missing bundle fails the build. |
| What about a missing command-line switch? | Desktop filters only with `--blanc-blocker-assets`. Android has no such switch, so `BlockerAvailable()` is always true there: a build can't quietly run unfiltered. |
| The service-worker hook? | Left out. `BlancUpdateFactory` only logs for a diagnostic switch; update fetches go through the same factory wrapper as other requests. |
| A private tab's exception? | The iPhone keeps exceptions in one shared settings list, whichever tab set them, and so does the desktop fork (`GetOriginalProfile()`). Android does the same. |
| Where does the count show? | The iPhone has none (D13). Android's goes in the Sunrise menu's blocking row and on the Start Page. |

## A warning for later checks

Most of this spike's debugging turned out to be the harness, not Blanc. `sleep()` and `adb` are
synchronous in Node, and the fixture server ran in the same thread, so it stopped answering whenever
a check waited: pages stalled, requests vanished, and an error page came and went. It looked like
missing hooks and a private-tab bug. The server now has its own thread (`fixture-server.mjs`). Keep
it there.
