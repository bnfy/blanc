# Linux AppImage launch troubleshooting

For public Blanc v1.23.0, make the downloaded AppImage executable and run it
from a terminal so its actual error is visible:

```sh
chmod +x ./Blanc-1.23.0.AppImage
./Blanc-1.23.0.AppImage
```

If the output says `dlopen(): error loading libfuse.so.2`, the current public
AppImage needs the FUSE 2 library. FUSE 3 alone does not supply that library.
On Ubuntu 24.04, install its renamed package and try the AppImage again:

```sh
sudo apt install libfuse2t64
./Blanc-1.23.0.AppImage
```

On Ubuntu 22.04, the library package is named `libfuse2`. Other distributions
use their own package names; use their package documentation.

If it still fails, report the Ubuntu/distribution version and the exact
terminal error. An error about user namespaces, sandbox initialization,
permissions, or another missing library needs its own diagnosis. Extraction
working does not by itself prove that FUSE 2 was the cause.

The workaround that worked for the reader is to extract the
image and run its `AppRun` entry point. Extract into a fresh directory so it
does not mix with an older application's extracted files:

```sh
mkdir blanc-extracted
cd blanc-extracted
../Blanc-1.23.0.AppImage --appimage-extract
./squashfs-root/AppRun
```

Keep the original AppImage if using this workaround. An extracted launch does
not establish that the normal AppImage updater/restart path works.

An unshipped candidate switches to a static AppImage mounting runtime that
removes the host FUSE 2 library dependency. It still requires Electron's normal
system libraries and access to the kernel mounting facilities. The existing
launcher can also fall back to disabling Chromium's sandbox when its user
namespace probe fails; changing the mounting runtime does not resolve that
separate behavior. See the
[candidate investigation and validation record](linux-appimage-sandbox-2026-09-29.md).

Sources:

- [AppImage FUSE troubleshooting](https://docs.appimage.org/user-guide/troubleshooting/fuse.html)
- [Ubuntu 24.04 libfuse2t64 package](https://packages.ubuntu.com/noble/libfuse2t64)
- [electron-builder's AppImage toolsets](https://www.electron.build/v26/docs/appimage/#toolsets)
