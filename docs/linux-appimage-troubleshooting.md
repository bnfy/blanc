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

## v1.27.0: setup-guide buttons

The following behavior from [PR #494](https://github.com/bnfy/blanc/pull/494)
is included in the v1.27.0 source. It is **not included in v1.26.0**; see the
[versioned release notes](press/release-notes/v1.27.0.md) and
[publication record](release-incidents/2026-10-03-v1.27.0.md).

When **Blanc requires Chromium sandboxing** appears, the buttons depend on the
desktop session and whether Blanc was launched with the setup-guide URL:

| Desktop session | Initial refusal | Relaunch with the guide URL |
| --- | --- | --- |
| Wayland | **Open Setup Guide**, **Quit** | **Quit** |
| X11 | **Open Setup Guide**, **Copy Link**, **Quit** | **Copy Link**, **Quit** |

**Open Setup Guide** asks the system's default browser to open this guide, then
Blanc exits with status `1`. If the guide does not open, use the address shown
in the dialog in another browser. If Blanc is itself the default browser, the
relaunch omits Open Setup Guide to avoid repeatedly opening itself. On Wayland
it says **Open this address in another browser.** and offers only Quit.

On X11, **Copy Link** shows **Setup guide link copied**. Keep that confirmation
open while pasting the address into another browser, then choose Quit: the
clipboard contents may disappear when Blanc exits. Copy Link is omitted on
Wayland. **Quit**, or Escape in the refusal dialog, exits with status `1`.
None of these actions enables browsing without Chromium sandboxing or changes
AppArmor or user-namespace settings.

The owner-assisted check at `e8058f6b` passed these Wayland dialog actions in an
Ubuntu 26.04 ARM64 GNOME Parallels VM. It did not establish stock Ubuntu 24.04
launch behavior or isolate AppArmor as the cause of the plain-launch refusal.
See the [candidate evidence and merge-only waiver](release-incidents/2026-10-03-sandbox-dialog-merge-waiver.md).

## Snap packages

Bananify Creative does not publish a Blanc Snap. The `blanc` package in the
Snap Store is community-maintained from
[ogra1/blanc-snap](https://github.com/ogra1/blanc-snap). As of October 3,
2026, its recipe launches Blanc with `--no-sandbox`, so v1.26.0 refuses to
start from it and shows **Blanc requires Chromium sandboxing**. The Store's
stable channel carries v1.25.0, which predates that check; its recipe also
launches with `--no-sandbox`, though the published package itself has not been
inspected. Follow [issue #486](https://github.com/bnfy/blanc/issues/486) for
status.

If you installed the Snap, do not edit its launch command or add switches to
recover browsing. Report package problems to its
[maintainer](https://github.com/ogra1/blanc-snap/issues).

### For packagers

Blanc refuses every switch in `UNSAFE_SANDBOX_SWITCHES`
(`src/main/linux-sandbox-launch.js`), including `--no-sandbox`, regardless of
environment. `$SNAP` or any other variable does not exempt a launch.
Snapcraft suggests disabling the internal sandbox for some Electron web
applications. That advice does not fit a browser that loads arbitrary sites:
Snap confinement separates the whole application from the host, while
Chromium's sandbox separates each web renderer from the rest of the browser.

The candidate Snap configuration keeps strict confinement, declares the
`browser-support` plug with `allow-sandbox: true`, and launches without
sandbox-disabling switches:

```yaml
plugs:
  browser-support:
    interface: browser-support
    allow-sandbox: true

apps:
  blanc:
    # Keep the existing extensions and app plugs.
    command: blanc/blanc
```

snapd denies both connection and automatic connection of that plug by
default, and Snapcraft limits `allow-sandbox` to trusted publishers, so the
Store must approve it. This configuration has not been built, installed, or
launched: no native launch or renderer-sandbox check has run on amd64 or
arm64. Do not ship it as a fix until that evidence exists.

Sources:

- [Snapcraft browser-support interface](https://snapcraft.io/docs/reference/interfaces/browser-support-interface/)
- [snapd browser-support policy](https://github.com/canonical/snapd/blob/master/interfaces/builtin/browser_support.go)
- [Electron process sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)

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
