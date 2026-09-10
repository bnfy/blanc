# Capture platform isolation — source repair, not new conference evidence

Owner subsequently authorized freezing this reviewed source and a **Mac-only
private notarized build** on 2026-09-10. The source-review observations below
remain historical; package identity and authentication belong in a separate
candidate record. This authorization does not include a Windows/Linux build,
merge, public release, or promotion of conference evidence.

The owner requires the working Windows and Linux candidates to stay as-is.
This work changes no installed app, performs no guest tests, and builds no
package. It is isolated from both the dirty PR worktree and the Mac diagnostic
align worktree, based on `c26127eb`.

## Selected runtime

| Platform | Runtime baseline | Source treatment |
| --- | --- | --- |
| macOS | Playout `fda425eb` | Restore exact preload, broker, and helper in `*-playout.js` files. |
| Windows | Installed candidate `c26127eb` / installer `20837e7b…` | Preserve original filenames and bytes; no adapter or clock edits. |
| Linux | Passing arm64 `c26127eb` / AppImage `b35616f0…` | Preserve identical bytes in dedicated `*-linux.js` files so later Linux work cannot alter Windows. |

The installed `/Applications/BlancCaptureCandidatePlayout.app` preload,
broker, and helper were independently extracted from its ASAR. All three
match `fda425eb` byte-for-byte. The current Mac `6eda9bac…` diagnostic
ASAR is not this baseline and its presentation-startup failure stays open.
The off-destination clock experiment is not included on any platform here.

Main chooses the runtime using `process.platform`, selecting its broker,
browsing-session preload, and the helper script behind the same exact
`blanc-chrome://display-capture-helper/display-capture-helper.js` URL. Pages
cannot select a platform, fetch the alternate script filenames, or opt into
the Linux adapter. Mac uses the approved relay track and muted private-clone
audio sink without the newer canvas adapter or its AudioContext clock.

## Locks and verification

`src/main/capture-runtime-lock.json` pins all nine runtime files plus
fourteen shared capture/permission/relay dependencies. Unit checks reject
source drift. The cross-platform afterPack hook rejects a package whose
selected runtime differs from its pin or whose dispatch/manifest differs
from source. A Linux-only runtime edit cannot change the Windows/Mac files;
a shared dependency edit fails all three platform checks.

The duplicate baseline files are deliberate launch isolation. Do not merge
them back into one implementation or refresh hashes to silence a failure.
Changes require an impact review naming affected platforms and an explicit
decision about their evidence. Shared main/UI integration still requires
review; these checks do not prove an entire browser is immune to regressions.

Verification before the final additional shared-lock assertions: 173 related
unit tests passed; 61 original Playout broker/helper/page tests also passed
against the restored Mac runtime. Original Windows files and Linux copies
were compared directly with `git show c26127eb:<file>` and were identical.
Package-gate tests inject changed helpers, dispatch code, and shared relay
bytes to verify failure rather than silently accepting a different runtime.
The final focused guard/Mac-plumbing rerun passed 16/16 after adding shared
dependency locks and placing the manifest inside the existing `src/**/*`
packaged tree. `git diff --check` passed. Temporary baseline test copies were
removed; no dependency installation, package, or native test was run.

No conference result is promoted. Mac Playout's existing PASS remains tied
to that original package; a future restored Mac package still needs Mac
verification. Windows/Linux owner waivers and historical evidence remain
as recorded. No freeze, rebuild, merge, or release is performed here.
