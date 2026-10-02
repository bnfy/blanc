# Linux AppImage launch troubleshooting

## Audit candidate: sandbox required (not yet released)

The security-readiness candidate refuses Linux launches carrying Chromium
sandbox-disabling switches, including a launcher's automatic `--no-sandbox`
fallback. It prints guidance and shows a native error before any browser
surfaces initialize. Permitted launches call Electron's official
`app.enableSandbox()` before readiness. The generated launcher and Electron
runtime remain upstream builds.

Do not add disabling switches to recover browsing. Report the distribution,
kernel, launch method, and actual error. On a managed machine, ask its
administrator for a supported sandbox configuration; this change does not
modify user-namespace or AppArmor policy on the user's machine. Allowed and
restricted Ubuntu 22.04/24.04, real desktop integration, renderer namespaces,
seccomp, and updater handoff need native candidate evidence before release.

The public versions described below predate this candidate enforcement.

Public Blanc v1.24.0 no longer needs the host FUSE 2 library. Download the
[current AppImage](https://github.com/bnfy/blanc/releases/tag/v1.24.0), make it
executable, and run it from a terminal so its actual error is visible:

```sh
chmod +x ./Blanc-1.24.0.AppImage
./Blanc-1.24.0.AppImage
```

If you previously integrated Blanc into your app menu, integrate the new
AppImage again to replace the old shortcut's arguments.

The static mounting runtime still requires Electron's normal system libraries
and access to the kernel mounting facilities. If launch fails, report the
Ubuntu/distribution version and exact terminal error. Errors about user
namespaces, sandbox initialization, permissions, or other missing libraries
need their own diagnosis. The existing launcher can disable Chromium's sandbox
when its user-namespace probe fails; the mounting-runtime fix does not resolve
that separate behavior. See the
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
v1.24.0 to avoid that host library dependency.

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
