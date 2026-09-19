# Blanc Ambassador pilot social asset

Status: local review asset. Not published.

## Feed asset

- Source: `ambassador-pilot-feed-1080x1350.svg`
- Export: `ambassador-pilot-feed-1080x1350.png`
- Dimensions: 1080×1350
- Intended placements: X, Threads, Instagram feed, Facebook, and Substack

The asset uses the website's paper/ink system, sentence-case title hierarchy,
and a dark agreement panel derived from the local Ambassador page. It contains
no product screenshot, generated browser interface, recycled demo frame, or
accent-colored logo treatment.

## Alt text

> Black-and-white Blanc Ambassador pilot graphic. It reads “Try the browser.
> Tell the truth.” and “A small creator program for people with an actual point
> of view.” A black panel says “Your opinion stays yours. No scripted praise. No
> posting obligation during the trial. Clear criticism is welcome.” The footer
> links to blancbrowser.com/ambassadors.

## Verification

- exact export size: 1080×1350;
- title and subtitle are centered and use sentence case;
- uppercase appears only in small mono utility labels;
- all visible colors are neutral paper, ink, and gray;
- no Blanc mark is used, so no alternate or colored mark treatment exists;
- all program statements match the local `/ambassadors` page;
- visually inspected at original resolution on September 2, 2026;
- checked again at a 270×338 phone-feed equivalent; the agreement copy was
  enlarged and the expendable secondary footer line was removed;
- no public placement is authorized.

## TikTok and Reels

The native vertical unit is now staged separately from the feed card:

- Video: `vertical/blanc-ambassador-pilot-1080x1920.mp4`
- Cover: `vertical/blanc-ambassador-pilot-cover-1080x1920.png`
- Reproducible render: `vertical/render.sh`
- Dimensions: 1080×1920
- Duration: 9.0 seconds
- Video: H.264, 30 fps, `yuv420p`, fast-start enabled
- Audio: none; select suitable native audio per platform

The source is a fresh Playwright recording of the deployed Ambassador page at
`https://blancbrowser.com/ambassadors`, not a crop of the feed card. It moves
from the full-color creator hero to the agreement panel and then the real
application form. The capture is retained at
`output/playwright/ambassador-vertical/ambassador-live-scroll-vertical.webm`.

On-screen sequence, three seconds each:

1. “Creators: Want to test a browser without reading from a script?”
2. “Try Blanc. Question it. Keep your own voice.”
3. “Apply to the Blanc Ambassador pilot.” plus the page URL.

### Vertical verification

- exact 1080×1920 export and 9.0-second duration confirmed with `ffprobe`;
- inspected at 1.5, 4.5, and 7.5 seconds at full size;
- inspected again as three 270×480 phone-size frames;
- every primary message remains visible for three seconds;
- the text panel ends at x=888, leaving 192 px for right-side platform UI;
- no important text or CTA is placed in the bottom control zone;
- the page imagery stays full color while the Blanc typography treatment stays
  black and white;
- the Blanc mark does not appear in the overlay;
- titles and body copy use proper capitalization and punctuation;
- no product UI, endorsement, payment, audience-growth, or acceptance claim is
  added by the overlay;
- not published.
