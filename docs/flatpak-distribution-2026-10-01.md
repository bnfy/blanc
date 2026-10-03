# Flatpak compatibility and distribution decision — October 1, 2026

Status: distribution deferred. AppImage remains supported. This branch adds
application compatibility, not an available Flatpak package or a Flathub submission.
Wallpaper delivery is independent and its optional time-of-day setting is free.

## Application changes

Linux detects the read-only `/.flatpak-info` marker, rather than trusting
`FLATPAK_ID`. Flatpak owns updates: both ordinary and staging updater policies
are disabled, without installing update listeners or downloading files. Manual
checks explain where to update and that client automation depends on software-app
settings. The marker’s validated Application name supplies the desktop filename;
the cross-platform `build.appId` is unchanged. The old Bowser profile copy is
skipped inside Flatpak. Normal Flatpak XDG directories must provide separate data;
no AppImage profile discovery or migration is added.

The existing file dialogs/download saves and Linux PipeWire screen-sharing
broker are reused. Wayland uses portal screen selection; X11 keeps the explicit source picker
and still requires package acceptance. Failure does not silently select a host source. No new filesystem, D-Bus,
or host-spawn permission is requested by this application change.

## Conditions before packaging resumes

A human must independently author the manifest, packaging inputs, submission
and review correspondence, and disclose the extent of AI-generated application
material. This document is implementation research, not submission copy.
[Flathub’s policy](https://docs.flathub.org/docs/for-app-authors/requirements#generative-ai-policy)
prohibits agent-authored manifests and submission interactions.

Routine successful updates must merge and publish without owner maintenance.
[Flathub requires approval for automerge](https://docs.flathub.org/docs/for-app-authors/maintenance#automatically-merging-updates).
If approval is denied or recurring manual maintenance is required, leave
Flatpak deferred. Do not assign that work to the owner.

Target x86_64 and pin an approved standard [Zypak wrapper](https://github.com/refi64/zypak)
with official, unmodified Electron. Install before testing Zypak. Verify renderer
isolation separately from the outer sandbox. Pin wrapper re-exec behavior and
verify normal relaunches stay within Flatpak. Do not reuse the AppImage launcher
or its unsandboxed fallback. Use narrow portal permissions; never grant the whole
home directory to fix integration.

The human-maintained update tooling must accept only verified published stable
Blanc releases, authenticate the release manifest and checksums using the existing
pinned Sigstore identity, regenerate deterministic dependency inputs, build offline,
and run packaged blocker/compliance payload and fuse checks. Permission, runtime,
wrapper, packaging or dependency-input changes must halt automatic publication for
review. Failed checks must report a failure and prevent publishing.

## Pending package evidence

No Flatpak manifest, initial maintainer, automerge approval, installed package,
GNOME/KDE session, or private update repository is supplied by this change.
Therefore all package-level acceptance remains pending:

- Offline build and authenticated stable-release inputs; blocker/compliance payloads
  and fuses; observed renderer isolation under Zypak.
- GNOME and KDE desktop launch/identity; HTTP/HTTPS and tab-handoff links;
  file uploads, save/download portals and screen sharing; microphone/camera
  permissions; Patron activation and Sync with OS-backed credential storage.
- Two successive private package updates preserving user data and normal relaunches,
  with zero Blanc updater downloads, plus a deliberately failed check that blocks
  publication and a permission/runtime/packaging change that stops automerge.

These are not passes or waived gates. Do not advertise Flathub availability or
automatic client updates until the exact shipped package and client behavior are
verified. Protected PR checks do not replace affected-machine acceptance or release gates.
