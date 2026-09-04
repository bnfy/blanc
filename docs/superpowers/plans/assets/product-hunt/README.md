# Product Hunt media provenance

These files are launch media for packaged public Blanc v1.15.0. They contain
no mockup, development-build UI, or behavior from post-release `main`.

- `thumbnail-240x240.png` is a 240×240 Lanczos export of the production
  `site/public/logo.png` mark.
- `island-resting-1270x760.png` is a September 4 native screenshot of the
  installed public v1.15.0 app displaying the live `https://blancbrowser.com/`
  homepage, including the current “A little less browser.” headline.
- `quick-switcher-1270x760.png` shows the same page behind the real Quick
  Switcher, with `blancbrowser.com/features` and two public-site history results.

The September 4 stills replace the Example Domain video-frame exports at the
owner's request. They were captured in a separate window, with webpage zoom
increased for legibility, then cropped to the central 836×500 region of the
1229×768 native capture and scaled with Lanczos to 1270×760. The crop excludes
the operating-system capture indicator, pointer and lower website demo; no
product controls, website text or colors were composited or altered. The
Quick Switcher's dimmed page is the real app scrim. Only public website results
are visible; no other tabs or remote-device identifiers appear. Page zoom was
restored after capture. The app mark thumbnail and both gallery stills remained
unchanged when the launch video was replaced.

Both replacement stills were uploaded to the unpublished Product Hunt draft
at `https://www.producthunt.com/products/blanc-3?launch=blanc-3` on September 4.

The approved launch video is the unlisted 42-second overview at
`https://www.youtube.com/watch?v=xqUFMUcCjT0`. It was recorded on September 4
from installed packaged public v1.15.0 in a dedicated capture profile, using
only the live Blanc site and public GitHub pages. It demonstrates real Quick
Switcher and slash-command use, tab-group assignment and folding, Glance Make
main, the real one-request blocker count and site controls, Explore/Build Named
Workspace switching with `Named Workspaces · Patron` visible, and one legal
Mahjong match. The final 1920×1200, 30 fps H.264 BT.709 file is exactly 42.000
seconds and has no audio stream. Anthony approved the revision with 38 px Inter
secondary labels on September 4.

YouTube reported no copyright issues and published the replacement as
unlisted. Product Hunt saved only the video-field change; its draft player
resolved to `youtube-nocookie.com/embed/xqUFMUcCjT0`, showed the correct title,
and reported 42 seconds. The draft remains unscheduled. YouTube requires phone
verification before this channel can upload the matching custom poster, so no
verification or credential flow was attempted. The cleanest homepage-backed
frame among YouTube's three generated choices was selected instead; the exact
matching poster is retained in the owner's local review output.

The existing [22-second source demo](../island-demo.mp4) was captured on
September 3, 2026 from the installed packaged public v1.15.0 macOS app in an
isolated local profile with telemetry and search suggestions disabled. It
remains the repository README demo. The former unlisted YouTube video was not
deleted. Full provenance and verification are recorded in `../launch-copy.md`
and `../../2026-08-20-growth-counter-offensive.md`.

Before uploading, verify the files rather than trusting filenames:

```bash
sips -g pixelWidth -g pixelHeight \
  docs/superpowers/plans/assets/product-hunt/*.png
```

Expected: the thumbnail is exactly 240×240 and both gallery stills are exactly
1270×760.
