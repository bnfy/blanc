# Linux AppImage launch troubleshooting

## Public v1.26.0: sandbox required

Blanc v1.26.0 refuses Linux launches carrying Chromium sandbox-disabling
switches, including a launcher's automatic `--no-sandbox` fallback. It prints
guidance and shows a native error before browser surfaces initialize.
Permitted launches call official Electron's `app.enableSandbox()` before
readiness. The generated launcher and Electron runtime remain upstream builds.

Do not add disabling switches to recover browsing. Report the distribution,
kernel, launch method, and actual error. On a managed machine, ask its
administrator for a supported sandbox configuration; Blanc does not modify
user-namespace or AppArmor policy on your machine. Restricted systems may
refuse to launch. Hosted Ubuntu 22.04/24.04 candidate sandbox checks passed;
physical desktop checks were explicitly waived for v1.26.0 and remain
unperformed. See the [release evidence and exact waiver](release-incidents/2026-10-02-v1.26.0.md).

Download the [current AppImage](https://github.com/bnfy/blanc/releases/tag/v1.26.0),
make it executable, and run it from a terminal so its actual error is visible:

```sh
chmod +x ./Blanc-1.26.0.AppImage
./Blanc-1.26.0.AppImage
```

Since v1.24.0, Blanc's static AppImage mounting runtime no longer needs the
host FUSE 2 library. It still requires Electron's normal system libraries,
access to kernel mounting facilities, and a working Chromium sandbox.
If you previously integrated Blanc into your app menu, integrate the new
AppImage again to replace the old shortcut's arguments. Report the exact
terminal error if launch fails; namespace, sandbox, permissions and missing
library errors need their own diagnosis.

Older public v1.24.0/v1.25.0 launchers could disable Chromium's sandbox when
their user-namespace probe failed. The mounting-runtime fix did not resolve
that separate behavior; v1.26.0 refuses such launches. See the
[investigation and validation record](linux-appimage-sandbox-2026-09-29.md) and
[v1.24.0 release evidence](release-incidents/2026-10-01-v1.24.0.md).

## Older AppImages

Public v1.23.0 and earlier can fail with
`dlopen(): error loading libfuse.so.2`. These older AppImages need the FUSE 2
library; FUSE 3 alone does not supply it. On Ubuntu 24.04, the package is
`libfuse2t64`:

```sh
sudo apt install libfuse2t64
./Blanc-1.23.0.AppImage
```

On Ubuntu 22.04, the package is named `libfuse2`. Other distributions use their
own package names; consult their package documentation. Alternatively, download
the current AppImage to avoid that host library dependency; its sandbox
requirements still apply.

Extraction is a workaround for an older image. Use a fresh directory so it
does not mix with another application's extracted files:

```sh
mkdir blanc-extracted
cd blanc-extracted
../Blanc-1.23.0.AppImage --appimage-extract
./squashfs-root/AppRun
```

Keep the original AppImage if using this workaround. An extracted launch does
not establish that the normal AppImage updater/restart path works. Extraction
working also does not by itself prove that FUSE 2 was the cause.

Sources:

- [AppImage FUSE troubleshooting](https://docs.appimage.org/user-guide/troubleshooting/fuse.html)
- [Ubuntu 24.04 libfuse2t64 package](https://packages.ubuntu.com/noble/libfuse2t64)
- [electron-builder's AppImage toolsets](https://www.electron.build/v26/docs/appimage/#toolsets)
