# Blocker campaign production manifest — August 29, 2026

Status: **source audit complete; no campaign asset rendered**.

This manifest exists because a file in the current worktree is not proof of the
public v1.9.1 interface. It identifies the only acceptable capture source and
explicitly rejects the tempting stale assets.

## Authoritative capture source

- Installed packaged app: `/Applications/Blanc.app`
- Verified bundle version: `1.9.1` (`CFBundleShortVersionString` and
  `CFBundleVersion`)
- Public release boundary: tag `v1.9.1`
- Capture profile: a new temporary user-data directory containing no personal
  browsing data, accounts, favorites, history, or saved workspaces
- Capture state: the actual packaged Island shield and full site-control
  popover, with the complete Island and popover visible plus clear margin on
  every edge

The approved production run must use the installed packaged app, not a dev
instance and not a reconstruction from working-tree HTML.

## Verified deterministic request fixture

Read-only preflight:

```sh
node marketing/social/blocker-campaign-preflight.mjs
```

The preflight does not launch Blanc, make requests, render creative, or write
files. It verifies the installed app version, the Ghostery matcher version from
the v1.9.1 lockfile, every pinned source hash, the combined snapshot hash, three
candidate blocked requests, and one ordinary unblocked control.

Verified August 29:

- Installed Blanc: `1.9.1`
- `@ghostery/adblocker`: `2.18.2`, matching the v1.9.1 lockfile
- Snapshot date: `2026-07-09`
- Combined snapshot SHA-256:
  `35cfb31efe041f8203e047f9339a59995083b7c33f19ee59e562739739240d7e`
- Neutral source page: `https://example.com/`
- `https://ad.doubleclick.net/ddm/clk/blanc-capture-1` matches
  `||ad.doubleclick.net^`
- `https://static.doubleclick.net/instream/ad_status.js?blanc=2` matches
  `||static.doubleclick.net^`
- `https://g.doubleclick.net/pagead/id?blanc=3` matches
  `||g.doubleclick.net^`
- `https://example.com/ordinary.png` does not match

This proves the fixture against the exact release inputs. It does not yet prove
that the packaged UI displays `3`; that final live proof belongs to the
approval-gated clean-profile capture.

## Rejected source assets

### `site/public/feature-ad-blocking.png` in the working tree

Reject. SHA-256:
`ce074e571cfeaed20228e4025a62049ca7320b35eff2142db5194917a16d6599`.
It differs from the v1.9.1 tag, and its generating script and feature-page
markup also differ from the tag. It is not release evidence.

### `site/public/feature-ad-blocking.png` at tag `v1.9.1`

Reject as a social source even though it is release-tagged. SHA-256:
`9ccf89b4bb2933137056c90454a7e7989e2528c3b0ea378bd29b904949161431`.
The card visibly says `Blanc 1.1.0`, carries the older “quieter site” headline,
and clips the bottom of the site-control popover. Cropping the headline and
version away would still leave an incomplete product state. Do not post,
animate, upscale, or crop it into the new campaign.

### Existing press Island captures

Reject for this campaign. They are useful Island explainers but do not show the
site-control shield/popover proof promised by the blocker creative.

## Approved-after-approval capture procedure

1. Launch the packaged v1.9.1 app with a temporary clean profile.
2. Open `https://example.com/` and issue the three preflight-verified synthetic
   subresource requests above. Do not display those request domains in the
   creative, make another company's identity the story, or fabricate a count.
3. Open the real Island shield and capture the actual site-control popover.
4. Confirm that the domain, blocking state, HTTPS line, request count, switch,
   and exception note all match the live state.
5. Capture at native Retina resolution. Keep at least 48 output pixels of clear
   space above the Island and around the full popover after crop.
6. Remove only the neutral test-page backdrop during composition. Do not redraw,
   replace, or regenerate the product UI.
7. Build the 1080×1350 feed carousel and the separate 1080×1920 motion asset
   from that capture. The logo remains black on white or white on black only.
8. Preview every output at full size and at phone-feed size before asking for
   publication approval.

If a deterministic neutral page cannot produce an honest blocked count, stop
and use `0 requests blocked` rather than manufacturing proof.

## Output requirements

- New creative only; no old campaign frame or footage
- Sentence-case headlines with the approved weight and spacing
- Full product UI visible; no cropped Island or popover
- No accent color behind or inside the Blanc mark
- Carousel and vertical motion rendered independently
- Alt text describes only what the final capture actually shows
- Final filenames and SHA-256 hashes recorded here before publication

The storyboard and public copy remain in
`approval-batch-2026-08-29.md`. Rendering is blocked only on Anthony's approval
of that storyboard, not on additional product research.
