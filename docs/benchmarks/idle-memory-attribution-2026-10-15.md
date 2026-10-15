# Idle memory, 1.1.0 → 1.34.0: what grew and what to do about it

October 15, 2026. Follows the two committed benchmark runs:
`bench/memory/results/memory-2026-08-09T17-33-45-039Z.md` (1.1.0, idle 200 MiB, 6
processes) and `memory-2026-10-15T06-03-46-052Z.md` (1.34.0, idle 440 MiB, 7
processes). This document does not change any public memory figure; those stay
pinned by `test/unit/public-truth.test.js` and `docs/marketing-claims.md`.

## Short answer

Nothing here points to a leak (every idle process settles), and the ad blocker
is not the cause. The growth is the sum of five changes, and on macOS the
largest is GPU compositing, not JavaScript.

| What | Arrived | macOS cost (2× scale) | Status |
| --- | --- | ---: | --- |
| Full-window GPU compositing: forced by the resting Island's `backdrop-filter` whenever a website is showing; the Start Page holds the same buffers by itself, for a reason not yet isolated | 1.14.0 | ≈ 40 MiB idle; **79 MiB with a website showing** | Island blur removed in this PR; Start Page cause still open |
| Hidden display-capture helper window (a whole renderer) created at startup | 1.16.0 | 18 MiB | Make it lazy; touches hash-pinned capture files |
| Start Page wallpaper: decoded image plus its GPU texture | 1.21.0 | 17 MiB | Product decision |
| Larger chrome, overlay and Start Page documents (CSS, scripts, fonts, strings) | gradual | ≈ 10 MiB | Not worth chasing one by one |
| Main-process startup garbage measured before the first full GC | gradual | Linux 15 MiB; not seen on macOS | Ad-block part fixed in this PR |

Not causes: the Electron 43 → 44 upgrade (1.8.2 → 1.9.0 is flat), the ad-block
engine (blocking off grew just as much, and the engine sits on the same two
sessions as in 1.1.0), managed uBlock Origin (no startup work while Blanc
Blocker is selected), session preloads, i18n catalogs, Profile Sync and the
1Password broker (all lazy or small).

## Why the benchmark could not answer this itself

`bench/memory/run.js` sums `phys_footprint` over the process tree and throws the
per-process samples away (`sampleTotal()` returns `perPid`; `run.js` keeps only
`totalBytes`). Neither committed JSON can say which process grew.
`bench/memory/idle-attribution.js` (added here) launches packaged bundles exactly
like the harness's idle baseline — seeded profile, warmed template, the same
argv, the same settle rule — and keeps every process's footprint plus the
category breakdown `footprint(1)` prints (IOSurface, IOAccelerator, malloc
zones…). Renderers carry no URL in their argv, so they are labelled by spawn
order, which main.js fixes for each release; an instrumented Linux build mapped
that order to WebContents (`getOSProcessId()`), and it was stable across runs.

## Where the numbers come from

- **Hosted Mac:** GitHub Actions `macos-15` (Apple Silicon, macOS 15.7.9,
  7 GiB), public arm64 DMGs verified against each release's `SHA256SUMS`, run
  by a temporary workflow on the investigation branch (runs 38697657384,
  38701457707, 38705401765, 38707740222, 38707858332, 38710103078 and
  38710271108 in `bnfy/blanc` Actions). Its display
  is not Retina, so most runs add `--force-device-scale-factor=2` to render the
  way an 8 GiB MacBook Air does. Absolute totals are lower than on the owner's
  Mac (macOS 27.2, real Retina panel): 1.1.0 → 1.34.0 grows 171 → 233 MiB at
  1× and 179 → 299 MiB at 2×, against 200 → 440 MiB on the owner's Mac. The
  direction and the split by process reproduce; the magnitudes should be
  confirmed there (see *Reproducing*).
- **Variants:** to test a cause rather than infer it, the job copies the public
  1.34.0 app, changes one file inside `app.asar`, updates the
  `ElectronAsarIntegrity` hash and signs ad hoc. The control goes through the
  same repack and signature, so signing cannot explain a difference.
- **Linux:** public AppImages under Xvfb with the Chromium sandbox on, measuring
  `Private_Dirty` from `smaps_rollup` (the closest analogue to
  `phys_footprint`). Linux has no Core Animation, so it misses the GPU story
  entirely; it is used for the main-process and renderer story.

## Process-level attribution (hosted Mac, 2×, median of 3)

| Process | 1.1.0 | 1.15.0 | 1.16.0 | 1.34.0 | Δ |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPU process | 30 | 70 | 73 | 95 | **+65** |
| Display-capture helper renderer | — | — | 18 | 18 | **+18** |
| Browser (main) | 81 | 84 | 88 | 97 | +16 |
| Start Page renderer | 23 | 26 | 28 | 38 | +15 |
| Chrome strip renderer | 21 | 23 | 23 | 25 | +4 |
| Overlay renderer | 16 | 17 | 17 | 19 | +3 |
| Network service | 8 | 8 | 8 | 8 | 0 |
| **Total** | **179** | **228** | **256** | **299** | **+120** |

All MiB. The one extra process in 1.34.0 is the capture helper.

On Linux (`Private_Dirty`, sampled after 40 s, median of 2–3) the same
processes grew from 116 to 164 MiB: browser 49 → 56, GPU 21 → 26, chrome strip
13 → 20, overlay 9 → 12, Start Page 11 → 27, the new capture helper 9.5, network
service 11 → 12. Sampled at the harness's ~20 s point instead, the totals are
126 and 194 MiB, because of the startup garbage described in cause 5.

### Release bisect (hosted Mac, 2×, median of 2)

| | 1.13.0 | 1.14.0 | 1.20.0 | 1.21.0 | 1.24.0 | 1.27.0 | 1.34.0 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| GPU process | 30 | 68 | 68 | 91 | 97 | 96 | 94 |
| ↳ IOSurface | 10 | 43 | 46 | 47 | 52 | 51 | 54 |
| ↳ IOAccelerator | 1 | 5 | 1 | 22 | 25 | 26 | 21 |
| Start Page renderer | 26 | 28 | 27 | 41 | 37 | 39 | 39 |
| Total | 185 | 222 | 247 | 285 | 289 | 320 | 300 |

1.10.0 through 1.13.0 are flat (185–192 MiB), and at 1× 1.8.2 and 1.9.0
measured 174 and 176 MiB, so the Electron 43 → 44 upgrade in 1.9.0 is not a
cause. The helper arrives in 1.16.0 (a fourth renderer). 1.27.0
and 1.31.0 had browser-process startup spikes that 1.34.0 no longer shows.

## The causes

### 1. Full-window GPU compositing (macOS)

On macOS Chromium hands each layer of a frame to Core Animation as its own
`CALayer`. If any visible quad needs an effect Core Animation cannot express,
such as a backdrop blur, the whole window falls back to being composited into
full-window buffers, which show up as IOSurface in the GPU process (≈ 15.6 MiB
per buffer for a 1280 × 800 window at 2×).

1.14.0 gave the resting Island pill `backdrop-filter: blur(16px)` (copied from
the website nav), and in that release the GPU process jumped from 30 to 68 MiB,
almost all of it IOSurface; it was the release's only compositing change. On
1.34.0 the variants below confirm that the blur forces this path whenever a
website is showing. Behind the
resting pill there is only the strip's flat `--page-bg`: websites are separate
views stacked *above* the chrome document. So the blur draws nothing. Light and
dark screenshots of 1.34.0 with and without it differ only in edge
antialiasing (at most 22/255 on a few hundred pixels around the outline and
glyph edges).

Measured on re-signed 1.34.0 variants:

| Variant | Idle Start Page, 2× | Website active, 2× | Website active, 1× |
| --- | ---: | ---: | ---: |
| Control | 293 | 304 | 259 |
| No Island backdrop blur | 294 | **225** | **224** |
| No Island blur and no Start Page footer blur | 290 | 225 | — |

With a website showing, the Island blur alone holds 79 MiB at 2× (GPU 80 → 20
MiB, IOSurface 48 → 3; the website's renderer 25 → 15 MiB) and 35 MiB at 1×.
That is the cost a user pays while browsing, and it is in the loaded benchmark
rows too.

On the idle Start Page it barely matters: the GPU process keeps about 50 MiB of
IOSurface with or without it. What holds those buffers there is still open.
Each of these was removed in its own variant (2×, four repetitions), and none
lowered the GPU process's IOSurface, which stayed at 50–54 MiB: the Start Page
footer's `backdrop-filter: blur(14px)`, the Sunrise mark's
`filter: drop-shadow(…)`, the wallpaper (it saves 17 MiB, but in IOAccelerator
and the renderer), and the Island's cursor-proximity transform. The 1.13.0 Start Page held 10 MiB, so the cause is
in a Start Page change after that release; the variant job can bisect
`pages.css` and `newtab.html` the same way.

### 2. The display-capture helper window (1.16.0)

`main.js` creates a hidden 100 × 100 `BrowserWindow` in its own session
partition and loads `blanc-chrome://display-capture-helper/` at startup, on
every platform, although it is only used once a page calls `getDisplayMedia`.
A variant that never loads it measured 275 MiB against 293 (−18 MiB, one
process fewer, nothing else moved). On Linux it is 9.5 MiB `Private_Dirty`.

### 3. The Start Page wallpaper (1.21.0)

The Start Page paints a 1586 × 992 wallpaper on every layout: 6 MiB decoded in
the renderer (the 7 MiB untagged region `footprint` shows from 1.21.0 on) plus
its GPU texture. Replacing the four wallpapers with 1 × 1 images measured 280
MiB against 297 (−17: GPU −8, renderer −7).

### 4. Larger UI documents

The chrome strip, overlay and Start Page renderers grew by 4, 3 and about 8
MiB beyond the wallpaper: more CSS (styles.css 58 → 128 KB, pages.css
30 → 133 KB), larger scripts, more fonts and the string catalog. The 382 KB
Dark Reader session preload is parsed in the Start Page renderer but its engine
never runs there. No single item is worth a change.

### 5. Main-process startup garbage (Linux)

On Linux the browser process holds about 88 MiB for the first ~30 s, then a
full GC drops it to 56 MiB (1.1.0: 58 → 49). The benchmark settles at about
20 s, so it records the plateau. About 15 MiB of it was the ad-block snapshot
check, which decoded EasyList and EasyPrivacy to strings and joined a third
copy (3.6 million two-byte characters) on every launch to compute a digest.
The remaining ~5 MiB is the engine-cache buffer read at startup.

On the hosted Mac the same fix did not change the browser process at the 20 s
sample (98 vs 96 MiB). The owner's run does show a ~35 MiB startup transient:
both Blanc rows have one repetition that settled at 41 s, 405–408 MiB against
429–447 MiB for the 21–26 s repetitions. That is consistent with a GC or GPU
settling step after the harness's 20 s minimum, and worth a longer `minMs`
before the next published run.

## What this PR changes

1. **Removes the resting Island's backdrop blur** (`src/renderer/styles.css`).
   No visible change; −79 MiB at 2× (−35 MiB at 1×) on macOS whenever a
   website is the active tab; 1–4 MiB at idle. The visual test that pinned the
   blur now pins its absence, with the reason.
2. **Verifies the bundled blocker lists without building their text**
   (`src/main/adblock-snapshot.js`). Every byte is still hashed against the
   release pins at startup; the text is decoded only when the engine must be
   compiled from source, and that path reads and verifies the files again. On
   a packaged 1.34.0 on Linux: browser process during the first 30 s 86 → 75
   MiB, idle total at the benchmark's settle point ≈ 196 → 181 MiB; both
   settle at the same 56 MiB after the first full GC. No measurable change on
   macOS.
3. **Adds `bench/memory/idle-attribution.js`** with unit tests, so the next
   regression can be attributed to a process in one run.

## Further fixes, ranked by memory saved against risk

| Fix | Saves (macOS 2×) | Risk |
| --- | ---: | --- |
| Done here: drop the Island backdrop blur | 79 MiB browsing, 1–4 idle | Very low: pixel-identical apart from antialiasing |
| Find and remove what keeps the idle Start Page on full-window compositing | ≈ 40 MiB idle | Unknown until isolated; footer blur, drop shadow, wallpaper and proximity are ruled out |
| Create the display-capture helper on the first `getDisplayMedia` request | 18 MiB, every platform | Medium: the broker captures `helperWc` at install and `display-capture-broker*.js` are hash-pinned in `capture-runtime-lock.json`, so it needs fresh capture evidence on all three platforms |
| Lighter Start Page wallpaper (smaller asset, or only when the window is large) | up to 17 MiB | Product decision |
| Raise the harness's minimum settle time, or wait for the first full GC | 15–35 MiB of measured transient | Changes methodology; re-run every browser, never just Blanc |

## Reproducing

On a Mac with the releases mounted or installed side by side:

```sh
node bench/memory/idle-attribution.js \
  --app=/Volumes/Blanc-1.1.0/Blanc.app=1.1.0 \
  --app=/Applications/Blanc.app=1.34.0 --reps=3 --sudo
```

Add `--url=https://example.com/` to measure a window showing a website, and
`--extra-arg=--force-device-scale-factor=2` on a display that is not Retina.
Results land in `bench/memory/results/` (gitignored) as JSON and Markdown.
