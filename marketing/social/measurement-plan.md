# Blanc organic-social measurement plan

Last updated: August 29, 2026. Existing first-party measurement paths were last
verified August 28; the evergreen profile URLs below were prepared August 29
and remain unexecuted.

This plan separates reach from conversion for X, Threads, Instagram,
Facebook, TikTok, and Substack. It does not treat aggregate GitHub artifact
downloads as proof that a particular social post converted.

The current one-page operating score is
[`daily-scorecard-2026-08-29.md`](daily-scorecard-2026-08-29.md), with a
machine-readable companion in
[`daily-scorecard-2026-08-29.json`](daily-scorecard-2026-08-29.json).

## Existing first-party measurement

The production site already provides the necessary conversion path:

- `site/src/scripts/site.js` loads GA4 in Consent Mode and records campaign
  acquisition from landing URLs;
- the Quiet Tabs page records `feature_cta_click` with
  `feature=quiet-tabs`;
- the download page records `download_click` with the selected platform;
- `/dl/<platform>` redirects provide a server-side download counter;
- GitHub Releases exposes cumulative artifact download counts.

Full visitor-level analytics remains consent-dependent. Restricted cookieless
measurement, server redirect totals, and GitHub totals are aggregate signals,
not complete person-level attribution.

## Aggregate download baseline

The read-only helper
[`capture-download-baseline.mjs`](capture-download-baseline.mjs) snapshots the
current public release's GitHub asset counters without writing files. The
August 29 baseline is stored in
[`download-baseline-2026-08-29.json`](download-baseline-2026-08-29.json).
Pass that file as the optional second argument to receive an explicit delta:

```sh
node marketing/social/capture-download-baseline.mjs \
  v1.9.1 marketing/social/download-baseline-2026-08-29.json
```

At `2026-08-29T17:02:25Z`, v1.9.1 had 137 package-asset requests: 41 macOS
DMG/ZIP requests, 66 Windows installer requests, and 30 Linux AppImage
requests. It also had 764 updater-metadata and blockmap requests. These are
request counters, not unique people. The macOS ZIP can be fetched by the
updater, and QA, retries, updater handoffs, and non-social traffic are
included. A later delta is aggregate corroboration only; it cannot attribute a
download to social without a matching tracked campaign path.

A 13:09 ET comparison reproduced the baseline exactly: package requests were
still 137, with no movement on macOS, Windows, or Linux. This short zero-delta
window is a measurement checkpoint, not evidence that social caused or failed
to cause a download.

A second read-only checkpoint at `2026-08-29T17:37:59Z` is stored in
[`download-checkpoint-2026-08-29-173759Z.json`](download-checkpoint-2026-08-29-173759Z.json).
Over 36 minutes, total package-asset requests moved from 137 to 138: macOS
remained 41, Windows moved from 66 to 67, and Linux remained 30. Updater
metadata and blockmap requests rose by 5. This is aggregate movement only; the
single Windows request is not a verified person, new user, social referral, or
campaign conversion.

The `/dl/<platform>` Worker holds the stronger daily click counters behind the
authenticated `/stats` endpoint. No local `STATS_TOKEN` or other authorized
read path was present during this audit, so those counters remain unavailable;
do not substitute GitHub asset requests as if they were redirect clicks.

## Quiet Tabs campaign links

Use the feature page, not the generic home page, so a visitor lands on the
exact capability shown in the creative and the feature CTA can be measured.

| Platform | Campaign URL |
| --- | --- |
| X | `https://blancbrowser.com/features/quiet-tabs?utm_source=x&utm_medium=organic_social&utm_campaign=quiet_tabs_aug_2026&utm_content=motion` |
| Threads | `https://blancbrowser.com/features/quiet-tabs?utm_source=threads&utm_medium=organic_social&utm_campaign=quiet_tabs_aug_2026&utm_content=motion` |
| Instagram profile | `https://blancbrowser.com/features/quiet-tabs?utm_source=instagram&utm_medium=organic_social&utm_campaign=quiet_tabs_aug_2026&utm_content=profile` |
| Facebook | `https://blancbrowser.com/features/quiet-tabs?utm_source=facebook&utm_medium=organic_social&utm_campaign=quiet_tabs_aug_2026&utm_content=motion` |
| Substack | `https://blancbrowser.com/features/quiet-tabs?utm_source=substack&utm_medium=organic_social&utm_campaign=quiet_tabs_aug_2026&utm_content=note` |

TikTok currently exposes no website link on Blanc's public profile, and links
in ordinary captions are not a dependable clickable path. Do not fabricate
TikTok click attribution. Measure TikTok views, completion/retention where
available, profile visits, follows, searches, and any later direct traffic as
separate signals.

Changing a profile link or publishing any URL requires explicit approval in
the active Codex thread.

## Live profile-link audit

Read-only evidence captured August 29:

| Platform | Live destination | Attribution state |
| --- | --- | --- |
| X | `https://blancbrowser.com/` after the visible `t.co/TSeuc6OeEV` redirect | Untagged; X profile visits currently blend into direct traffic. |
| Threads | `https://blancbrowser.com/?utm_source=threads&utm_medium=social&utm_content=link_in_bio` | Tracked, but it predates the current `organic_social` / `profile` taxonomy. |
| Instagram | Not reverified; the loaded public profile did not expose the live link field to the accessibility tree or logged-out HTML. | Unknown; do not infer or edit from memory. |
| Facebook | Not reverified; the loaded public Page did not expose the action-button destination to the accessibility tree or logged-out HTML. | Unknown; verify immediately before any approved edit. |
| TikTok | No dependable website field is exposed on Blanc's current public profile. | No clickable-profile attribution path. |
| Substack | `https://blancbrowser.com/` | Untagged; external profile visits currently blend into direct traffic. |

No profile field changed during this audit.

## Proposed evergreen profile links

These remain unexecuted and require approval. Use them for permanent profile
fields; keep feature-specific URLs attached to their matching campaigns.

| Platform | Campaign URL |
| --- | --- |
| X | `https://blancbrowser.com/?utm_source=x&utm_medium=organic_social&utm_campaign=profile&utm_content=bio` |
| Threads | `https://blancbrowser.com/?utm_source=threads&utm_medium=organic_social&utm_campaign=profile&utm_content=bio` |
| Instagram | `https://blancbrowser.com/?utm_source=instagram&utm_medium=organic_social&utm_campaign=profile&utm_content=bio` |
| Facebook | `https://blancbrowser.com/?utm_source=facebook&utm_medium=organic_social&utm_campaign=profile&utm_content=about` |
| Substack | `https://blancbrowser.com/?utm_source=substack&utm_medium=organic_social&utm_campaign=profile&utm_content=bio` |

TikTok remains excluded until a dependable website field is available to the
account.

## Blocker campaign links

Campaign slug: `blocker_homework_aug_2026`. These links are prepared but not
published. X and Threads keep the first post link-free; their URLs are used
only in a relevant follow-up or direct answer. Instagram temporarily uses the
campaign URL as its primary profile link during the measurement window.

| Platform | Campaign URL | Placement |
| --- | --- | --- |
| X | `https://blancbrowser.com/features/ad-blocking?utm_source=x&utm_medium=organic_social&utm_campaign=blocker_homework_aug_2026&utm_content=reply` | Relevant follow-up only |
| Threads | `https://blancbrowser.com/features/ad-blocking?utm_source=threads&utm_medium=organic_social&utm_campaign=blocker_homework_aug_2026&utm_content=reply` | Direct answer only |
| Instagram | `https://blancbrowser.com/features/ad-blocking?utm_source=instagram&utm_medium=organic_social&utm_campaign=blocker_homework_aug_2026&utm_content=profile` | Temporary primary profile link |
| Facebook | `https://blancbrowser.com/features/ad-blocking?utm_source=facebook&utm_medium=organic_social&utm_campaign=blocker_homework_aug_2026&utm_content=feed` | Native post link |
| Substack | `https://blancbrowser.com/features/ad-blocking?utm_source=substack&utm_medium=organic_social&utm_campaign=blocker_homework_aug_2026&utm_content=note` | Linked phrase in Note |

TikTok remains view/profile/follow measured because the account has no
dependable clickable website field.

## Start here profile-trailer links

Campaign slug: `start_here_aug_2026`. These links are prepared but not
published. X and Threads keep their first post link-free. Instagram uses the
campaign URL as its first profile link only during the approved measurement
window. The trailer links to the homepage because it explains Blanc's core
product choice rather than one secondary feature.

| Platform | Campaign URL | Placement |
| --- | --- | --- |
| X | `https://blancbrowser.com/?utm_source=x&utm_medium=organic_social&utm_campaign=start_here_aug_2026&utm_content=pinned_video_reply` | Relevant self-reply only |
| Threads | `https://blancbrowser.com/?utm_source=threads&utm_medium=organic_social&utm_campaign=start_here_aug_2026&utm_content=pinned_video_reply` | Direct answer only |
| Instagram | `https://blancbrowser.com/?utm_source=instagram&utm_medium=organic_social&utm_campaign=start_here_aug_2026&utm_content=profile` | Temporary first profile link |
| Facebook | `https://blancbrowser.com/?utm_source=facebook&utm_medium=organic_social&utm_campaign=start_here_aug_2026&utm_content=featured_reel` | Native Reel caption |
| Substack | `https://blancbrowser.com/?utm_source=substack&utm_medium=organic_social&utm_campaign=start_here_aug_2026&utm_content=note` | Linked phrase in Note |

TikTok remains view/profile/follow measured because the account has no
dependable clickable website field.

## Quick Switcher campaign links

Campaign slug: `quick_switcher_aug_2026`. These links are prepared but not
published. X and Threads keep the first post link-free; their links are used
only in a relevant self-reply or direct answer after the native post earns
interaction. Instagram may temporarily use the campaign link in the profile
during the measurement window.

| Platform | Campaign URL | Placement |
| --- | --- | --- |
| X | `https://blancbrowser.com/features/command-palette?utm_source=x&utm_medium=organic_social&utm_campaign=quick_switcher_aug_2026&utm_content=reply` | Relevant self-reply only |
| Threads | `https://blancbrowser.com/features/command-palette?utm_source=threads&utm_medium=organic_social&utm_campaign=quick_switcher_aug_2026&utm_content=reply` | Direct answer only |
| Instagram | `https://blancbrowser.com/features/command-palette?utm_source=instagram&utm_medium=organic_social&utm_campaign=quick_switcher_aug_2026&utm_content=profile` | Temporary primary profile link |
| Facebook | `https://blancbrowser.com/features/command-palette?utm_source=facebook&utm_medium=organic_social&utm_campaign=quick_switcher_aug_2026&utm_content=reel` | Native Reel caption |
| Substack | `https://blancbrowser.com/features/command-palette?utm_source=substack&utm_medium=organic_social&utm_campaign=quick_switcher_aug_2026&utm_content=note` | Linked phrase in Note |

TikTok remains view/profile/follow measured because the account has no
dependable clickable website field.

## Per-publication record

Record immediately before publishing, after 60–90 minutes, and after 24 hours:

1. follower/subscriber count;
2. post views/reach and video retention where available;
3. likes, meaningful replies/comments, reposts/restacks, saves, and shares;
4. profile visits and follows attributed by the platform where available;
5. GA4 sessions by `source / medium` and campaign;
6. `feature_cta_click` for the campaign feature (`quiet-tabs`, `ad-blocking`,
   or `command-palette`);
7. `download_click` by platform;
8. `/dl/<platform>` and GitHub artifact movement, explicitly labeled as
   aggregate when source attribution is unavailable.

## Interpretation rule

- Reach without profile visits means the hook or targeting worked but the
  account identity did not pull people inward.
- Profile visits without follows means the profile or pinned content did not
  make the value proposition clear enough.
- Feature-page visits without CTA clicks means the product explanation did not
  earn intent.
- CTA clicks without download movement can indicate platform/installer
  friction, consent gaps, or aggregation lag; inspect the path before changing
  the campaign.
- Do not declare a campaign successful from impressions alone.
- For the Quick Switcher campaign, use a campaign decision threshold of at
  least one downstream intent signal within 24 hours: profile activity, a
  follow, a tracked feature-page visit, or a tracked download click. This is
  an internal go/no-go threshold, not a claim about an industry benchmark.
- If a Quick Switcher Reel again reaches mostly non-followers but produces zero
  downstream intent, do not repeat the same creative. Revise the payoff, final
  follow reason, or profile destination before the next distribution cycle.
