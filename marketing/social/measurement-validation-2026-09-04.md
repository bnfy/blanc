# Blanc live measurement validation — September 4, 2026

Observed in Brave at approximately 17:30–17:35 EDT using Google Tag Assistant and the authenticated Blanc Browser GA4 property. This is labeled internal QA, not growth or paid acquisition. No paid ad was clicked and no ad, Analytics filter, tag configuration, security policy or site code was changed.

## What is now verified

- The deployed homepage and download page load GA4 destination `G-MN8BLY6GE9` via the on-page configuration. Tag Assistant also identifies Google tag `GT-W6X7BMF9`. A missing direct `AW-997979750` tag is therefore not evidence that GA4 is absent.
- The fresh homepage presents the consent dialog with analytics storage denied. Choosing Allow in the QA session produces a Granted update. After testing, No thanks was selected; a fresh reload's Config event confirms analytics storage Denied with no grant update. The diagnostic session was finished and Tag Assistant explicitly reports no actively debugging domains / Not Connected.
- One deliberate Mac Apple Silicon download-link click produced one `download_click` command and an outgoing hit to `https://analytics.google.com/g/collect`. Its fields are `source_page=download`, `cta_position=platform-card`, `platform=mac-arm64`, measurement id `G-MN8BLY6GE9`, debug flag enabled, and consent code `G1-1`. This proves deployed click-event emission for this tested path, not completed installation or paid attribution.
- The outgoing hit is marked `tt=internal`. The authenticated GA4 Data filters screen confirms an **Active / Exclude** Internal Traffic filter with an exact `traffic_type=internal` match. The filter was inspected and closed without saving. This session is intended to be excluded from processing; missing QA events in Realtime/DebugView are not proof of tag failure.

The test's landing URL used `utm_source=blanc_qa`, `utm_medium=diagnostic`, `utm_campaign=measurement_validation_20260904` plus Tag Assistant's debug signal. Exclude this QA session from growth claims even if it appears in any diagnostic report. Do not store client identifiers or unrelated visitor data in the ledger.

## Concrete issues and limits

Tag Assistant's Console records the deployed security policy blocking requests to:

| Directive | Blocked endpoint |
| --- | --- |
| connect-src | `https://stats.g.doubleclick.net/g/collect` |
| connect-src | `https://www.google.com/g/collect` |
| img-src | `https://www.googletagmanager.com/td` |
| img-src | `https://www.googletagmanager.com/a` |

These observations match omissions in `site/public/_headers`. The primary observed GA4 hit destination, `analytics.google.com`, is allowed. Google's [official CSP guide](https://developers.google.com/tag-platform/security/guides/csp), read live in Brave (page updated July 30, 2026), distinguishes core Analytics origins from origins needed when Google Ads or advertising features are used. The blocked Google/DoubleClick requests warrant a linked-Ads measurement review; they do **not** establish that all GA4 collection is broken or explain the historical click/session difference by themselves. Do not blindly copy the full Google Ads allowlist or add an extra Ads tag to clear warnings.

The on-page consent table exposes analytics storage but shows no explicit values for `ad_storage`, `ad_user_data` or `ad_personalization`. Record this as an implementation detail requiring review against the intended measurement behavior, not a proven consent violation or a proven attribution failure. Do not grant ad consent merely to improve reported conversions.

The Mac asset navigation reached `release-assets.githubusercontent.com`, where this Brave diagnostic session displayed **ERR_BLOCKED_BY_CLIENT**. No file completion or installation was verified. This is a bounded failure in the testing environment; it does not prove that ordinary customers or all Brave users cannot download Blanc. The `/dl/mac-arm64` redirect may have incremented an aggregate request counter; reserve this one QA attempt from any interpretation of customer acquisition. No download retry or blocker bypass was performed.

## Next action and budget decision

Keep Google $10/day, Meta $13/day through its September 9 end, and ChatGPT paused. The deployed Mac download event now has direct evidence, but the existing Google Ads import still needs a real, consented, non-internal ad-attributed event and normal processing time before an end-to-end paid attribution claim is justified.

Prepare a narrowly scoped consent/CSP review before any site change: map the configured GA4/Ads purposes to the observed blocked destinations; validate needed endpoints and consent defaults/updates in an isolated preview; preserve ordinary blocking/privacy choices; test denied, granted, persisted and withdrawn consent; prove one download click emits one event. No production allowlist expansion, new primary conversion or bidding change is recommended solely from this session. Confidence is high that these requests are blocked, but the size of their impact on paid reporting is unknown.

On September 12's Google comparison, exclude internal/diagnostic traffic, keep downloads distinct from installations, and do not label historical affected spend as savings. Reassess further optimization using complete post-exclusion days and customer outcomes.

## 17:41 EDT — consent review and local withdrawal fix

Read the current site script, consent component, privacy disclosure, security
headers and download Worker. Before this patch, the site script, consent
component and headers had no differences from public tag v1.15.0. This links
the source finding to the tagged implementation; it does not replace deployed
verification after a future publication.

### Google recommendation

Google's [consent guide](https://developers.google.com/tag-platform/security/guides/consent)
and [CSP guide](https://developers.google.com/tag-platform/security/guides/csp)
were read in Brave September 4 (both dated July 30, 2026). The first calls for
explicit defaults and updates for the consent types in use. The second
identifies Google/DoubleClick endpoints as advertising-related for linked
Analytics deployments; it also lists Tag Manager image requests for Analytics
and diagnostics. Therefore the observed `/td` and `/a` blocks must not be
classified as harmless debug-only requests without more evidence.

For Google campaign 24027915268, retain $10/day, Maximize clicks, the existing
GA4 import and the apk/android exclusions. Current site consent explicitly
sets only analytics_storage; ad_storage, ad_user_data and ad_personalization
are unspecified in this code. Current security policy allows the observed
primary Analytics endpoint and blocks the other listed requests.

Proposed next technical review: define explicit Google ad-purpose consent
states consistent with the existing disclosure, with no automatic grant for
personalized advertising, then validate the minimum required destinations in
an isolated preview. An exact production allowlist change is not yet justified.
This recommendation changes no campaign settings and has **$0 immediate
budget effect**. Attribution coverage may improve after a validated change,
but neither additional downloads/follows nor savings can be estimated from
the current evidence. Preserve privacy choices even if they reduce measured
coverage. No additional tags or Google consent settings were added here.

### Reproduced ChatGPT attribution bug and prepared fix

An offline execution of the existing page script reproduced this sequence:
Allow → click a download link while the page stays open → No thanks. Storage
was cleared, but the link retained its previously appended `oppref`. A later
click could still deliver that reference to the existing Worker, whose current
dispatch condition is a valid reference plus its configured server secret.
No real reference, paid click or network request was used in reproduction.
The number of affected visitors is unknown.

Local patch in `site/src/scripts/site.js` removes the reference from existing
download links immediately on withdrawal. Before decorating any subsequent
download click, it removes stale attribution and adds it back only if current
consent and session storage allow it. Other query parameters, fragments,
external destinations and non-download links are preserved. This patch is
**a review candidate on `codex/blanc-growth-monitoring-consent`, not deployed**;
do not describe production as fixed. The owner subsequently authorized commit
and push of the monitoring work and this fix, without a site deployment.

Verification: six new behavioral checks run the actual complete site script
offline. Four reproduced failures before the fix and all six pass afterward.
They cover fresh consent, withdrawal from multiple used links, changed saved
choice, unavailable storage reads, re-grant after withdrawal, and destination
boundaries. Together with existing public-truth and Worker conversion tests,
23 checks pass. Site build, brand checks, SEO checks for 19 pages and
`git diff --check` pass. No live ad conversions were emitted by these checks.
Live browser verification of the patched build and deployment remain pending.

Integration inventory for this incremental review: Astro browser script plus
existing Cloudflare CAPI-only download handler; existing custom `blanc_download`
event and public pixel identifier in `cloudflare/ping-worker/src/dl.js` remain
unchanged. Authentication stays in the existing `OPENAI_CONVERSIONS_API_KEY`
Worker secret; no secret was read or changed. There is no browser Pixel, so
no new page-view, user-matching or browser/server deduplication path is added.
The existing server event uses a per-request UUID, fixed sanitized Blanc
download URL, opaque consented reference and opt_out=true, without visitor
identity fields. No commerce, signup, lead, trial or subscription event is
added: this patch repairs withdrawal for the already defined download-click
boundary. Desktop telemetry, signup flows and campaign status are untouched.

Before deployment, review the patch against Blanc's privacy, security, consent
and data-handling requirements and the current launch freeze. Publishing is a
separate action; this local fix is not authorization to resume ChatGPT Ads.
