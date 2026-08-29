# Island or rail campaign brief

Status: brief only; no asset generated and nothing approved for publication.

Public release checked: `v1.9.1`.

## The tension

The ordinary browser debate treats horizontal tabs and vertical tabs as a
permanent identity. Blanc offers a different default: keep the page in front
with the Island, then turn on a persistent vertical rail when a session needs
an overview.

This is a choice story, not an anti-vertical-tabs story.

## Claim ledger

| Proposed wording | Type | Evidence | Verdict / qualification |
| --- | --- | --- | --- |
| “Blanc defaults to the Island.” | Blanc capability | `v1.9.1:site/src/pages/features/vertical-tabs.astro`; `v1.9.1:src/main/main.js` | Verified. |
| “Turn on a resizable vertical tab rail when you want a persistent overview.” | Blanc capability | `v1.9.1:site/src/pages/features/vertical-tabs.astro`; `v1.9.1:src/main/main.js` | Verified. Do not call the rail automatic or adaptive. |
| “Switching layouts does not reload the page.” | Blanc capability | `v1.9.1:site/src/pages/features/vertical-tabs.astro`; current-release demo required before publication | Verified in release copy; prove it visibly in the final asset. |
| “Navigation and commands stay in the Island in either layout.” | Blanc capability | `v1.9.1:site/src/pages/features/vertical-tabs.astro` | Verified. |
| “The rail setting stays on the device rather than syncing.” | Blanc capability | `v1.9.1:site/src/pages/features/vertical-tabs.astro` | Verified; probably unnecessary in short social copy. |

## Native demo concept

Length: 8–10 seconds. Capture from a clean public `v1.9.1` build with no
personal accounts, filenames, notifications, or browsing data.

1. Begin on the Island layout with a clearly recognizable, non-personal page.
2. Hold long enough to show that the page has the room.
3. Use View → Tab Layout → Vertical Tabs.
4. Show the rail appearing while the same page remains loaded.
5. Resize the rail once so the behavior is unmistakable.
6. Switch back to the Island layout.
7. End on a monochrome title card: `island by default. rail when you want it.`

The Blanc mark may appear only as black on white or white on black, with no
accent-colored backing. Keep the Island fully visible and crop-safe in every
frame.

## Platform-native copy candidates

### X

> horizontal or vertical is the wrong permanent choice.
>
> Blanc defaults to the Island. turn on a vertical rail when the session wants
> a list. turn it off when the page wants the room.

### Threads

> some sessions want a list. some want the page.
>
> which layout are you today: Island or rail?

The Threads version should lead with the question and let the profile/demo do
the selling. Do not add a download link to the initial post.

### TikTok / Reels

On-screen sequence:

1. `some sessions want the page.`
2. `some sessions want the list.`
3. `choose when.`

Caption:

> island by default. vertical rail when you want it. which one are you today?
> #browser #productivity #tech

### Substack Note

> We do not think horizontal versus vertical needs to be a permanent browser
> identity. Blanc starts with the Island so the page keeps the room. When a
> session needs a persistent overview, you can turn on a resizable vertical
> rail without reloading the page—and turn it off again just as quickly.

## Pre-publication gates

- Verify the exact build is public `v1.9.1` or later and record its version.
- Perform the layout switch in that build; do not animate a mock transition.
- Confirm the page does not reload in the captured take.
- Inspect every frame, thumbnail, and end card for the monochrome mark rule.
- Use a newly recorded take, not any prior Same 12 Tabs or Island demo footage.
- Recheck `docs/marketing-claims.md`, `docs/brand-usage.md`, and the content
  ledger immediately before approval.

