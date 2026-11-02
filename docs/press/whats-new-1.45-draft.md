# What's New 1.45 and Shared Spaces launch copy: draft

Status: **superseded.** The owner-approved What's New 1.45 page in
`site/src/data/whats-new.json` (#1252) went live before v1.45.0 published, and
the "Claims to change" list below was carried out in the v1.45.0 records PR.
Kept as history; don't reuse its proposed text.

Original status: draft for the owner's review; not approved and not for deployment.
Prepared with Shared Spaces PR E on October 27, 2026. Nothing here describes
Shared Spaces as shipped. Public copy changes only after 1.45.0 publishes with
its release evidence (`docs/marketing-claims.md`), except the What's New page,
which builds as the one upcoming page (undated, `noindex`) and must be live
before `npm run release` starts.

## Why this isn't in `site/src/data/whats-new.json` yet

- `validateWhatsNew` rejects `todo` media outside the dev preview, so a draft
  page fails `test/unit/whats-new-site-data.test.js` and `site:build`.
- Only one page may build ahead of its release. Until 1.44's records land in
  `releases.json`, the 1.44 page holds that place. (1.44.0 was never
  published, and the validator looks for `1.44.0` specifically, so the 1.44
  records need their own fix first; see the PR body.)
- CLAUDE.md drafts the page after the prep PR, with
  `npm run site:whats-new -- --release 1.45`, from `v1.45.0.md`, and ships it
  in a website-only PR.

The two bold-named Added bullets in `docs/press/release-notes/unreleased.md`
already produce a valid two-highlight draft through `draftPage()` (checked
against the current data: ids `shared-spaces` and
`recently-closed-on-every-device`, no id clashes). The script copies each
bullet whole. The tighter page text below is proposed in place of that.

## Proposed highlights

```json
{
  "release": "1.45",
  "highlights": [
    {
      "id": "shared-spaces",
      "tile": "Shared Spaces",
      "title": "Keep your Spaces the same on every computer",
      "body": "Choose Spaces to share, and their open tabs, tab names, groups and pinned tabs match on each computer that has it turned on. A change on one appears on the others, end-to-end encrypted like the rest of Sync. The page you're looking at never changes under you: a change from another device waits until you leave that tab.",
      "steps": [
        "With Sync on, open Settings, then Sync.",
        "Under What syncs, turn on Spaces and groups, choose your Spaces and press Turn on. Do the same on each computer."
      ],
      "note": "It's off by default and belongs to the Personal profile. Private tabs, internal pages and local files never sync. Up to 25 Spaces can be shared; a deleted Space stops counting at once, and only its emptied record stays in sync storage for 30 days.",
      "media": {
        "kind": "todo",
        "todo": "Capture 1 below. Owner sign-off on it and on this text.",
        "candidates": []
      }
    },
    {
      "id": "recently-closed-on-every-device",
      "tile": "Recently closed, synced",
      "title": "Bring back a tab closed on another computer",
      "body": "A tab you close in a shared Space closes on your other computers too, and their Recently closed lists it with the name of the computer it was closed on, so you can bring it back from any of them.",
      "note": "Closed tabs still use sync storage for 30 days.",
      "media": {
        "kind": "todo",
        "todo": "Capture 2 below. Owner sign-off on it and on this text.",
        "candidates": []
      }
    }
  ]
}
```

Neither highlight has a `learnMore`, on purpose. The page goes live
before the release, while `/features/workspaces` still says Spaces never sync
and `/features/sync` says nothing merges; both change only after 1.45.0 ships
(see the claims inventory). `/features/reopen-closed-tabs` says closed-tab
snapshots "never go to disk or sync", which reads as a contradiction of the
second highlight even though the synced entry carries only the address and
title. Add `/features/workspaces` and `/features/reopen-closed-tabs` in the
post-release records, once those pages describe Shared Spaces.

## Captures needed

Take them from the merged packaged build on a Mac, at 1440 × 900 and Retina
density (never upscaled), with a disposable Sync account and the
`Blanc-Shared-Validation`-style isolated profile, never the owner's own:

1. **Shared Spaces (main).** Settings → Sync with **Spaces and groups** on
   under What syncs, and the **Choose Spaces to sync** sheet open over it:
   two or three named Spaces with their tab counts and the "N of 25 shared
   Spaces" line. Show neutral sites only.
2. **Recently closed, synced.** The ⌘L panel's Recently closed band on a
   second device, with an entry reading "· Closed on <device name>" (name
   the device something neutral, such as "Studio Mac").
3. **Optional, for the feature pages later:** the same Space open on a Mac
   and on Windows, as two real captures side by side (not a mock-up), and the
   Spaces menu showing its shared-Spaces count.

Each capture needs alt text that names what's on screen, as on the 1.44 page.

## Claims to change when 1.45.0 ships

None of these change before the release (`docs/marketing-claims.md`), except
the privacy page and FAQ, which must say what Shared Spaces carries by the
time the release publishes (website-only PR, deployed with the What's New
page).

**Public website**

- `site/src/pages/features/workspaces.astro:45` ("Your spaces stay on this
  device…") and `:50–51` (the "Saved on this device…" note: "device-local and
  profile-scoped. They do not sync across devices…"); the same text in
  `site/src/components/guides/workspaces.astro:72` and `:87–92`. New text:
  chosen Spaces can sync when turned on for each device; Spaces still never
  move tabs between local profiles.
- `site/src/pages/features/sync.astro:8`, `:12` (meta and og descriptions),
  `:22`, `:24`, `:27` ("…nothing merges or rearranges" applies to open tabs
  only, since shared Spaces do merge); `site/src/components/guides/sync.astro:16`
  and `:27–30`.
- `site/src/pages/privacy.astro:65`: add what Shared Spaces syncs (eligible
  tab addresses and titles, tab names, groups, order, pins), what it excludes,
  the last-shareable-page rule, dormant local copies, 30-day closed-tab
  markers and the 20 MiB per-account allowance
  (`docs/reviews/2026-10-26-sync-sqlite-cost-retention.md:222–227`).
- `site/src/data/support-questions.json`: a new Shared Spaces FAQ entry.
- `site/src/pages/features/reopen-closed-tabs.astro:44` and
  `site/src/components/guides/reopen-closed-tabs.astro:87` ("closed-tab
  snapshots never go to disk or sync"): say that a tab closed in a shared
  Space reaches your other devices' Recently closed as its address and title,
  while the snapshot itself still never syncs.
- `site/src/pages/features/security.astro:42`,
  `site/src/components/guides/security.astro:61`,
  `site/src/components/guides/foundations.astro:29`: add Spaces to the list of
  what Sync encrypts.
- Optional: `site/src/pages/index.astro:129`, `site/src/pages/features.astro:274`.
- At release: `site/src/data/roadmap.json` `updated`,
  `site/src/data/release-feature-names.json`, `releases.json`.

**Tests and ledgers that pin today's wording**

- `test/unit/public-truth.test.js:23–24` asserts `device-local and
  profile-scoped` and `do not sync across devices` in the Spaces guide; `:34`
  forbids "Blanc Spaces are cloud-synced" phrasing.
- `test/unit/website-feature-evidence.test.js:26`: exact-wording claims in
  `docs/website-revamp-claims-v1.27.json` (workspaces `website-115-144/145`;
  sync `website-115-243/245/248/250`; privacy `trust-125-318`; foundations
  `trust-125-378`; security `reddit-462/463`; and their `feature-retained-*`
  copies). `:204` pins `site-133-workspaces-08` and
  `site-133-guide-workspaces-06` in `docs/website-v1.33-claims.json`. `:60`
  needs a new v1.45 ledger registered (`:63`) for new guide paragraphs; `:400`
  pins `v137-026` (the sync page h1); `:278` and `:322` apply if the homepage or
  features bento change (register the ledger at `:281–282`).
- `test/unit/website-revamp-trust.test.js:28`: editing an existing FAQ answer
  needs a dated before/after JSON in its list (`:38–44`); a new entry passes.
- `docs/marketing-claims.md:255–264` ("spaces are not synced") and the
  `groupsAndSpaces` qualification in
  `docs/website-cinematic-homepage-claims-v1.34.json:96`.

**Internal records**

- `spec/features.md` F57 (`:1705`): add the shipped line;
  `spec/parity-matrix.md:54`: F57 PARTIAL → SHIPPED (it still says "gated on
  Worker deployment").
- `docs/security-assessment.md:94–99`: the PR D review's "remain blocked"
  line, with the release evidence.
- `docs/press/fact-sheet.md:37` and `:120–121`: add Shared Spaces to Sync.
- `cloudflare/sync-worker/README.md:12` ("M16 deployment is on hold…"),
  `:135–137` and `:204–206`: record the production deployment once the owner
  records its approval.
