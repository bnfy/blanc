# Unreleased notes: Linux sandbox setup guide

Draft for the next release containing PR #494. These buttons are not in
public v1.26.0. Move the Fixed entry below into the approved versioned
`docs/press/release-notes/v<version>.md` before that release is published; do
not add it to v1.26.0's published notes. Replace the troubleshooting doc's
Upcoming release label with that version when the change ships.

## Fixed

- The Linux sandbox refusal dialog offers **Open Setup Guide** to ask the
  default browser to open the troubleshooting guide. Wayland sessions show
  **Open Setup Guide** and **Quit**; X11 retains **Copy Link** as well. When
  Blanc is relaunched with the guide URL, Open Setup Guide is omitted to avoid
  an opening loop; Wayland shows only **Quit** and the address to open in
  another browser. On X11, keep the copied-link confirmation open until the
  address is pasted, then choose Quit. Quit and Escape still exit without
  opening browsing windows. The sandbox requirement and system security
  settings are unchanged.

## Release preparation

- Include the entry only after confirming that the selected release contains
  [PR #494](https://github.com/bnfy/blanc/pull/494).
- [Candidate evidence](../../release-incidents/2026-10-03-sandbox-dialog-merge-waiver.md)
  covers an owner-assisted Ubuntu 26.04 ARM64 GNOME Wayland Parallels run.
  Physical X11, the shipped x86_64 AppImage on real hardware, and stock Ubuntu
  24.04 remain untested. The candidate waiver applies to merge only.
- The [October 3 follow-up waiver](../../release-incidents/2026-10-02-v1.26.0.md#october-3-stock-ubuntu-2404-follow-up-waiver)
  closes only the outstanding Ubuntu 24.04 check for public v1.26.0. It does
  not waive verification or authorize publication of this upcoming release.
