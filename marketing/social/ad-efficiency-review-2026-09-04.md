# Blanc ad efficiency review — September 4, 2026

Observed in signed-in Brave approximately 16:15–16:20 EDT. This follows the verified campaign negative-keyword change in `monitoring-check-2026-09-04-1608.md`. No additional ad settings, budgets, site code or public communications changed during this pass.

## Google Ads: measurement exists; attribution remains limited

Campaign: **Blanc Browser | US Search | Downloads**, ID 24027915268, Bananify Creative. Current settings: Enabled, Google Search Network, Maximize clicks, $10/day, account-default Outbound clicks goal. Maximum CPC bid limit is unchecked. AI Max is off. The bid editor was inspected and canceled without saving. The existing `apk` and `android` negatives remain present.

The primary GA4-imported action **Blanc Browser (web) download_click**, conversion type ID 7696757731, imports event `download_click` from the Blanc Browser property. It counts every conversion, has a 90-day click window and data-driven Google-paid-channel attribution. Its status is Awaiting conversions, with last recorded conversion August 19, 2026 at 8:00 AM. Diagnostics explicitly says Consent mode is implemented and modeling is active. An additional generic Outbound Click website action is also primary/account-default; it must not be assumed identical to Blanc downloads or edited across brands without checking its scope.

For August 28–September 3, Google Ads reports 89 clicks, $76.92 and zero conversions. This is neither proof of no real downloads nor a diagnosis of broken tracking. Do not adopt the interface recommendation to maximize conversions merely because the action exists, or increase spend because the campaign is limited by budget. A CPC cap remains a possible future experiment; no exact cap is justified by this review alone.

## Analytics: two measured download clicks, both referrals

Authenticated property: Bananify Creative → Blanc Browser, property 544287080. Traffic acquisition dates explicitly set to August 28–September 3, 2026, with Key events filtered to `download_click` and dimension Session source / medium.

| Source / medium | Sessions | Engaged sessions | Download-click key events |
| --- | ---: | ---: | ---: |
| google / cpc | 6 | 5 | 0 |
| alternativeto.net / referral | 3 | 2 | 2 |
| (direct) / (none) | 3 | 2 | 0 |
| google / organic | 2 | 0 | 0 |
| (not set) | 279 | 0 | 0 |

The six measured paid sessions versus 89 ad clicks warrants investigating measurement coverage and attribution, not treating the difference as confirmed waste. Clicks and sessions differ; consent, blocking, repeat clicks and collection coverage can affect the comparison. These mechanisms were not quantified here. Two recorded referral download events establish that the event has collected some recent activity; they do not verify every current browser path or a completed installation.

The source code sends website analytics and the optional desktop usage mirror to the same measurement ID, `G-MN8BLY6GE9` (`site/src/scripts/site.js` and `cloudflare/ping-worker/src/index.js`). Consequently, do not report the property-wide 293 sessions or the 279 unassigned sessions as website visitors or paid-traffic failures. Do not attribute every unassigned event to app telemetry without an event-level check. The site code defines a download click handler, but a local code inspection is not proof of deployed event delivery. Existing product decisions preserve consent and blocker behavior; do not proxy analytics or weaken privacy choices to increase reported conversions.

[Open the acquisition report](https://analytics.google.com/analytics/web/?authuser=1#/a3960195p544287080/reports/explorer?params=_r.explorerCard..selmet%3D%5B%22sessions%22%5D%26_r.explorerCard..seldim%3D%5B%22sessionSourceMedium%22%5D%26_u.dateOption%3Dlast7Days%26_u.comparisonOption%3Ddisabled%26_r.explorerCard..columnFilters%3D%7B%22conversionEvent%22:%22download_click%22%7D&r=lifecycle-traffic-acquisition-v2). This link uses a relative last-seven-days range; set the exact historical dates to reproduce this review later.

## Meta: delivery is Facebook-only in the observed breakdown

Active September 2 shield-toggle promotion: $13/day, seven-day duration, goal Get more Page visits and followers, US, minimum age 18, Advantage+ audience on. Fresh performance panel: $32.37 over three displayed days, 218 Page visits, 604 views, 455 viewers, 143 engagements, 139 link clicks, five attributed Facebook follows and two reactions. Displayed payment total was $32.36; calculations here use the performance panel's $32.37. Cost per attributed follow is $6.47, not cost per net new follower or download.

Placement audience counts: Facebook mobile app feed 417, Facebook Reels 35, Facebook mobile web feed 3, Uncategorized 1. They total 456 versus 455 overall viewers, so do not force them into an exact unique-person allocation. They show neither spend nor follows by placement, and provide no verified Instagram/Threads delivery. Thus they do not support cutting Reels, narrowing ages, or claiming cross-channel growth. No Meta settings changed.

View ad opens a static preview with Like/Comment/Share labels, not an inspectable live comment thread. It does not complete ad-comment coverage. Existing Facebook inbox/comments evidence remains bounded as recorded in the preceding checkpoint.

## Operating decisions and next measurements

1. Retain the Google `apk`/`android` exclusions and $10/day budget; measure complete post-change days before another bid or budget change. Historical affected spend is $8.32, not achieved savings.
2. Retain Meta's existing seven-day test and $13/day budget without extension or increase. Record incremental spend and attributed follows at scheduled checks; evaluate the full test and profile-to-follow performance before continuing paid delivery beyond the current duration.
3. Preserve ChatGPT Ads' previously verified paused state. This pass did not requery or reactivate it. Verify deployment/event delivery and the reason for the pause before any restart proposal.
4. Keep web acquisition distinct from desktop usage. Next tracking checks should examine paid landing-page attribution, GA4 Google Ads linking/auto-tagging and web-only event coverage, without manufacturing an ad click or real conversion for testing. A clearly labeled, consented QA event needs to be excluded from growth claims.
5. AlternativeTo is the only measured download source in this seven-day report. Preserve that listing and include its referrals in the scorecard; three sessions is too small to forecast a scalable result.

## 16:26 EDT follow-up — account linking and exact tag warning

Live Google Ads account settings confirm Auto-tagging Yes, no account tracking-template options, and Auto-apply off. The linked-products table confirms Blanc Browser property 544287080 was linked July 24, 2026, with app/web metrics On and audience import Off. No link, audience, consent, or account setting changed. Google's [linking documentation](https://support.google.com/google-ads/answer/6333536?hl=en_US) describes using linked Analytics key events to create Google Ads conversions; the live Blanc action already uses that route.

A separate account-level Google tag, **AW-997979750 (Bananify Creative)**, shows Urgent. Its coverage table lists 264 pages: 263 tagged and one not tagged. The untagged landing page is **blancbrowser.com/**; the displayed tagged pages are primarily Aston & West. This is a specific missing-direct-Ads-tag warning, not evidence that Blanc's GA4 tag is absent. The source search finds the GA4 measurement ID but no AW-997979750 configuration in the site. Do not treat the account warning as proof of the cause of zero imported conversions. Do not install an additional ad tag, change cross-domain settings, enable audience sharing, or duplicate the download conversion simply to clear it.

Concrete next tracking decision: verify consented website event collection and the existing GA4 import end to end, and establish whether direct Google Ads measurement is actually needed. Any direct-tag implementation must preserve consent choices, prevent duplicate conversion counting, distinguish download clicks from installs, and be reviewed as a site change. Current evidence supports retaining the existing imported action while investigating coverage, not replacing it with a second primary download action.

## 16:26 EDT follow-up — Instagram comment coverage

Business Suite's Ad replies filter explicitly reports No conversations from ads. That filter covers ads encouraging direct messages; it is not evidence that every public ad comment is clear.

All four visible Instagram comment threads were opened. The August 24 friendly exchange already includes Blanc's reply and a final reaction. The August 2 post has an already-replied competitor exchange plus older opinions about competing browsers and creative. The August 4 memory question has an existing Blanc reply; do not reuse its historical benchmark percentages as current claims without the required release/evidence check. The July 12 reel contains an older hostile allegation and a comment with no readable body. No new question requiring a routine answer was found; no reply, deletion, hiding, or new outreach was performed. Opening threads marked their unread indicators as read.

The older creative criticism reinforces the existing plan to use authentic release-backed demonstrations. It does not warrant reviving old hostile exchanges or reposting outdated benchmark claims. The live public comment thread for the active Facebook promotion remains distinct from the static ad preview and has not been exhaustively verified.

## 17:24–17:28 EDT implementation follow-up

Fresh Meta View results: $32.80, 225 Page visits, 623 views, 465 viewers, 146 link clicks and five attributed follows ($6.56 each). Increment from 16:20: $0.43 and zero additional reported follows; this short interval does not justify an efficiency conclusion. Expanded Details confirms September 9 end date and owning ad account 208039240841695, correcting the earlier navigation-link account inference. Preserve $13/day and the existing duration.

The original shield-toggle post's live public thread explicitly says No comments yet; Content Library independently reports zero comments. This resolves the prior missing live-comment check for this promotion. Its separate post-level three follows and two Instagram views are not the promotion's attributed follow count or evidence of paid Instagram delivery.

ChatGPT account readiness and paused campaign were freshly verified. Trailing seven days returned only the August 28 row (152 impressions, two clicks, $5.87); prior seven returned the August 27 row (12,875 impressions, 119 clicks, $360.48), each without more pages. Current evidence is too small for a new CPC/CTR recommendation. The reason for the pause remains unknown from the campaign and searched records; do not resume. No ad settings changed.

The existing monitor now carries the Google September 12 comparison of September 5–11 versus August 28–September 3 and the Meta completion review. Local download-event/consent wiring was inspected; consented deployed event delivery and paid-attribution import remain an explicit pending gate. No duplicate primary event, direct Ads tag or synthetic customer conversion was introduced. See [implementation checkpoint](monitoring-check-2026-09-04-1724.md) for exact identities and limits.

## 17:35 EDT — deployed event verified; remaining attribution limits narrowed

[Live Tag Assistant validation](measurement-validation-2026-09-04.md) now confirms the deployed GA4 tag, consent behavior and one Mac `download_click` with expected fields. The test hit was internal and the existing Active/Exclude filter excludes that traffic from processing, explaining why this QA session cannot verify customer reporting/import. The security policy blocked specific Google/DoubleClick and Tag Manager requests; inspect purpose and consent before any narrow policy change. The allowed primary GA4 destination emitted the expected click hit, so do not call all tracking broken. A Brave client block prevented verifying asset download completion. No paid click, new customer conversion, site deployment or ad change was made; all budgets/statuses remain as above.
