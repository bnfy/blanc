# Blanc profile and pinned-content conversion plan

Status: **prepared for approval; no live bio, link, pin, Featured item, post,
or account setting changed**.

Public product baseline: `v1.9.1`.

September 4 reconciliation: this is a historical proposal, not current live
profile evidence. The latest Brave check shows an existing Facebook Featured
post (Same 12 Tabs), so the older empty-Featured assumption below is superseded.
Reinspect each field before proposing edits, refresh claims against the current
public release, and wait for the selected final launch release before new
release-bound media capture. Profile changes and new posts still require
separate review under the approved September 4 monitoring plan.

Read-only capture preflight:
[`start-here-trailer-preflight.mjs`](start-here-trailer-preflight.mjs).

## Why this exists

Blanc currently has evidence of discovery without conversion. The August 28
Instagram Quiet Tabs Reel reached 389 views from 98 viewers, 96.3% of its
views came from non-followers, and it produced two likes but no profile
activity or follows. Threads has 12.7K recent views with 21 followers. X's
newest visible posts have only 3–14 views and no engagement. A profile visit
therefore cannot be treated as a passive page view: the first visible copy and
content need to explain who Blanc is for, what feels better, and why following
the account will be worthwhile. A later August 29 read-only check showed the X
Quiet Tabs post at 8 views with no replies, reposts, or likes; that small view
increase did not produce a visible downstream action.

## Live-field decisions

| Platform | Current evidence | Decision before any edit |
| --- | --- | --- |
| X | Live bio: “the desktop web browser for people who keep too much open. tabs stay within reach; the tab strip goes away.” The visible website field resolves through `t.co/TSeuc6OeEV` to the untagged `https://blancbrowser.com/` homepage. | Keep the bio. If approved, replace only the website destination with the prepared evergreen X URL so future visits are attributable. |
| Threads | The same benefit-led live bio is present. Its live homepage link is `https://blancbrowser.com/?utm_source=threads&utm_medium=social&utm_content=link_in_bio`. | Keep the bio. The link already distinguishes Threads traffic; normalize it to the evergreen profile taxonomy only if separately approved. Do not lose the existing attribution while editing. |
| Instagram | The latest Reel reached non-followers but produced no profile activity. The public profile was revisited in visible Brave, but the live name, bio, link order, and pins were not exposed through the browser accessibility tree or logged-out page metadata. | Do not edit from memory. Compare character-for-character with `profile-copy-canon-2026-08-29.md`, preserve anything already better, and keep the product link first. |
| Facebook | Live About: “Blanc is the desktop web browser for people who keep too much open. Tabs stay within reach; the tab strip goes away. Built-in ad and tracker blocking.” Featured is empty. The action-button destination still was not exposed by the read-only public-page check. | Keep the About text. Verify the action-button destination immediately before any approved change; the conversion work belongs in Featured and the destination, not a longer paragraph. |
| TikTok | For You distribution and profile-to-follow conversion have worked, but no dependable website field is exposed. | Keep the bio concise and make the pinned trailer self-contained. Do not pretend caption URLs are clickable. |
| Substack | One subscriber at the August 29 13:07 ET live check and 136 seven-day views at the prior publisher checkpoint. The public profile links to the publication and exposes `https://blancbrowser.com/` without campaign parameters. | Keep the profile benefit-led. If approved, replace only the external website URL with the prepared evergreen Substack URL, and make the ongoing build—not generic lifestyle writing—the subscribe reason. |

## The missing first-visit asset

Do not pin an old post merely because it exists. Same 12 Tabs earned no
profile visits on X, the Nico cut has been retired, and Quiet Tabs explains one
secondary capability rather than Blanc's core difference. The missing asset is
a short **Start here** product trailer created specifically for profile
conversion. It uses new footage and a new script; it is not a repost or crop of
an existing campaign.

### Claim ledger

| Proposed wording | Public v1.9.1 evidence | Qualification | Verdict |
| --- | --- | --- | --- |
| “Blanc is for people who keep too much open.” | Editorial audience positioning already live on X, Threads, and Facebook | This is positioning, not a behavioral or wellbeing promise. | verified editorial statement |
| “Blanc replaces the permanent tab strip with the Island.” | `v1.9.1:site/src/pages/index.astro`; `v1.9.1:site/src/pages/features/island.astro`; shipped chrome in `v1.9.1` | The Island remains a visible compact control surface; do not imply all browser chrome disappears. | verified |
| “Tabs stay within reach.” | Tabs remain available through the Island and expanded panel in the public build | Do not promise semantic recall, automatic organization, or exact task memory. | verified user benefit |
| “Free for macOS, Windows, and Linux.” | `v1.9.1:site/src/pages/download.astro`; `docs/release-incidents/2026-08-26-v1.9.1.md` | Optional Patron benefits remain separate. | verified |
| “Follow the build.” | Blanc continues publishing signed releases and a public changelog | This is an editorial commitment. It requires continuing to publish real build decisions and proof. | verified editorial statement |

### Vertical storyboard — 1080×1920, 13–15 seconds

All frames are monochrome. Use only a real installed `v1.9.1` capture from a
temporary clean profile. Keep the full Island visible with top margin. Titles
are sentence case and slightly heavier than the explanatory line. Every
reading card stays visible for at least three seconds.

1. **0:00–0:03.2 — tension**

   Headline: “Keep a lot open?”

   Subtext: “Your browser doesn’t need to put all of it around the page.”

2. **0:03.2–0:09.5 — real product proof**

   Show one normal page in Blanc, the resting Island, then expand it and switch
   to another real tab. Use no generated or redrawn UI.

   Caption: “The permanent tab strip goes away. Your tabs stay within reach.”

3. **0:09.5–0:12.2 — payoff**

   Headline: “More page. Less browser in the way.”

   Subtext: “That’s the choice Blanc is built around.”

4. **0:12.2–0:15.0 — follow and product action**

   White field, approved black Blanc mark.

   Headline: “Follow the build.”

   Subtext: “Blanc is free for macOS, Windows, and Linux.”

   Footer: `blancbrowser.com`

The mark must be black on white or white on black with no accent backing.

## Platform-native executions

These are separate native executions of the same new footage, not one upload
copied everywhere. X and Threads use a shorter 1080×1350 interaction cut;
Instagram, Facebook, and TikTok use the full vertical proof; Substack uses a
still plus the proof clip.

### X

> keep a lot open?
>
> Blanc gets the permanent tab strip out of the way while your tabs stay within reach. more page. less browser around it.
>
> follow @blancbrowser to watch the build.

Keep the first post link-free. Use the prepared tracked URL only in a relevant
self-reply after the post earns a real question or meaningful interaction.

### Threads

> how much of your browser do you actually want visible while you’re using the page?
>
> Blanc puts the permanent tab strip away and keeps your tabs within reach through the Island. more page; less browser in the way.

Do not put a link in the first post. The profile already carries the site.

### Instagram

> Keep a lot open? Your browser doesn’t have to put all of it around the page.
>
> Blanc replaces the permanent tab strip with the Island, keeping your tabs within reach while the page stays in front.
>
> Follow @blancbrowser to watch the build. Download Blanc from the link in bio.
>
> #browser #indiedev #productivity

Use a native cover reading `Keep a lot open?` in sentence case. Temporarily
use the prepared campaign URL as the first profile link only if that separate
profile-link change is approved.

### Facebook

> Keep a lot open? Your browser doesn’t have to place all of it around the page.
>
> Blanc replaces the permanent tab strip with one Island. Open it when you need your tabs; return to the page when you don’t.
>
> Follow the independent build. Blanc is free for macOS, Windows, and Linux: [campaign-tracked URL]

### TikTok

> keep a lot open? your browser doesn’t have to put all of it around the page. follow @blancbrowser to watch the build. #browser #tech #productivity

Use native cover text `Keep a lot open?`. The video must carry the complete
product explanation because the current account has no dependable website
field.

### Substack

Publish a Note with a still from the real resting Island and the short proof
clip:

> A browser can keep tabs within reach without turning the whole row into permanent furniture.
>
> That is the choice behind Blanc’s Island: open it when you need the controls, then let the page stay in front.
>
> Follow the build—or see [why Blanc is different] at the campaign-tracked URL.

Link only the words “why Blanc is different.” Do not append a second naked
URL.

## Platform placement after publication

Every placement remains approval-gated and must be rechecked against the live
profile immediately before action.

- **X:** Pin the Start here trailer as the single durable first-visit answer.
  Do not pin Same 12 Tabs merely because it is the clearest existing static;
  its measured post produced no profile visits.
- **Threads:** Pin the Start here trailer. Keep the Quick Switcher proof
  available as a second pinned explainer only if the live platform supports
  another slot and the post produces a downstream intent signal.
- **Instagram:** Pin the Start here trailer. Use the remaining available slots
  only for distinct jobs: one proof of everyday retrieval (Quick Switcher) and
  one proof of resource relief (Quiet Tabs), after the exact live pin limit and
  post state are verified.
- **Facebook:** Put the Start here trailer in Featured. Add the strongest
  current product proof only if it explains a different benefit; do not fill
  Featured with several versions of the Island story.
- **TikTok:** Pin the Start here trailer so the core product is understandable
  without a website link. Keep other pinned videos only when they add a
  different concrete payoff and still represent the public release.
- **Substack:** Feature “Your open tabs are not a personal failure” as the
  audience-tension essay after verifying the current feature controls. Add a
  Quick Switcher Note or article only if it gives a distinct release-backed
  product answer rather than repeating the same argument.

## Approval bundle

One approval can authorize the non-public capture and rendering of the Start
here trailer. It does **not** authorize uploading, publishing, pinning,
Featuring, editing profile fields, or changing profile links. Those actions
require a fresh live-field check and action-time approval.

The recommended execution sequence is:

1. approve the Start here storyboard;
2. run `node marketing/social/start-here-trailer-preflight.mjs`;
3. capture the new real `v1.9.1` interaction and render platform-safe cuts;
4. inspect every frame, crop, logo treatment, and embedded claim;
5. approve publication per platform;
6. record the live audience/profile baseline;
7. publish natively, then approve pin/Featured changes at action time;
8. measure at 60–90 minutes, 24 hours, and seven days.

## Pass/fail measurement

Track profile visits, follows/subscribers, tracked homepage sessions,
`download_click`, and aggregate download movement where source attribution is
unavailable. Reach alone does not pass.

The trailer earns its profile placement only if it produces at least one
downstream intent signal within 24 hours on a platform: profile activity, a
follow/subscriber, a tracked site visit, or a tracked download click. This is
an internal campaign decision threshold, not an industry benchmark. If it
receives discovery but no downstream intent, revise the first-visit promise or
destination before expanding its placement.

## Action gate

No live profile field, link, pin, Featured item, post, or account setting may
change without explicit approval in the active thread. Immediately before any
public action, verify the current account identity, live field, post URL,
product version, duplicate state, and platform control in visible Brave.
