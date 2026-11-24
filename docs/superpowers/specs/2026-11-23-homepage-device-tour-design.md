# Homepage hero: a device tour

November 23, 2026. Owner request: "redesign home page hero as carousel that
features our desktop app/iOS app (including iPhone Duo and iPad support)".

## Intent

Until now the first screen showed only the desktop app (the floating Island
window, `2026-10-21-floating-island-homepage-hero-design.md`), although Blanc
for iPhone and iPad has been on the App Store since November 6 (iPad since
1.0.3) and 1.1 shipped with an iPhone Duo screenshot set. The hero should show
Blanc on every device it runs on, without losing the headline-and-Download
first screen.

## Approaches

Three directions were mocked with the real captures and the site's own type
and colors, desktop and phone each:

- **A. One device at a time, with tabs below** (Apple's product-tab pattern).
  Clean on phones, easy to make accessible. **Chosen by the owner.**
- B. A sliding strip of cards with neighbors peeking. Reads as a gallery, but
  shrinks the devices and pushes them down.
- C. All four devices in a row, one lit at a time. Says "everywhere" at a
  glance, but too small on phones without sideways scrolling.

## Design

- The sunrise, headline, lead, Download and platforms line are unchanged. The
  App Store button keeps its rule: it shows on an iPhone or iPad only.
- Below them, a stage the desktop window's shape (16:10; square under 640px)
  holds one slide at a time; under it a one-line caption and, on the iPhone,
  iPad and Duo slides, a "Get it on the App Store" link; then the tabs
  (Desktop, iPhone, iPad, iPhone Duo) and a pause/play button.
- **Desktop:** the floating Island window, unchanged, without its macOS traffic
  lights (owner, mid-build), since the slide stands for macOS, Windows and
  Linux.
- **iPhone:** the 1.1 Start Page capture. **iPad:** the 1.1 Split View capture.
  **iPhone Duo:** the 1.1 unfolded Start Page with the folded phone (Spaces
  menu) standing in front of its corner. Captures are exported unchanged,
  resized only (`scripts/build-device-hero-images.mjs`), and framed in CSS in
  the App Store screenshots' plain dark frame.
- **Motion:** the desktop slide stays 7 s (one whole hide-and-float loop of its
  Island), the others 5 s; the chosen tab's gold bar fills over the wait. It
  waits under the visitor's pointer, with focus inside it, off screen or in a
  hidden tab, and never moves with reduced motion (the pause button is hidden
  then). Choosing a tab, by click or arrow keys, holds the tour until play.
  Slides crossfade; the chosen tab's plate slides to it.
- **Without script:** only the desktop slide shows and the tabs stay hidden.
- On an iPhone or iPad the tour opens on that device; nothing is sent.
- Accessibility: an ARIA tablist with roving focus, Home/End and arrow keys;
  hidden slides are `inert`.

## Claims

The four captions are in `docs/website-homepage-devices-claims.json`, tied to
public v1.52.0 (desktop) and App Store 1.1 (build 202611220258 from
`c03aecfed`). "Can hide" keeps Auto-hide's opt-in qualification.

## Calls left to the builder

Caption wording (kept to one or two lines on a phone), the slide timings, the
Duo arrangement and the square phone stage were the builder's calls. Below
360px the pause button wraps under the tabs. Hidden slides' images load at low
priority. Pressing play starts the tour at once, even with the pointer and
focus still on the button.
