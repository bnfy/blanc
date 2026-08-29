# Blanc balanced growth approval batch — August 29, 2026

Status: **copy and storyboard prepared; no public action authorized**. Live
targets, account identity, duplicate state, metrics, crops, and the final asset
must be checked in the logged-in Brave session immediately before execution.

## Campaign: the blocker should not be homework

This is a new angle and a new creative. It does not reuse Same 12 Tabs, Nico,
Tab Count Confession, Quiet Tabs, or the old Island demo. The tension is the
setup burden people accept before they can browse the way they want. The
payoff is simpler: Blanc begins with ad and tracker blocking already enabled,
and the current site is controlled from the Island shield.

The message is intentionally not “Blanc blocks everything.” The honest limit
travels with the campaign: EasyList and EasyPrivacy provide a strong default,
not a guarantee; a site may need an exception.

## Claim ledger

| Proposed wording | Type | Public-release evidence | Qualification | Verdict |
| --- | --- | --- | --- | --- |
| “Ad and tracker blocking is already part of Blanc.” | Blanc capability | `v1.9.1:src/main/adblock.js`; `v1.9.1:site/src/pages/features/ad-blocking.astro` | Do not imply perfect coverage. | verified |
| “It is enabled by default.” | Blanc default | `v1.9.1:src/main/settings.js` sets `adblockEnabled: true`. | A user can disable it globally or per site. | verified |
| “No extension is required.” | Blanc architecture | `v1.9.1:src/main/adblock.js` attaches the blocker at the session network layer; the v1.9.1 security page documents that it is not an extension. | Do not imply Blanc supports a general extension runtime; it deliberately does not. | verified |
| “The Island shield shows blocking state and a blocked-request count.” | Blanc UI | `v1.9.1:site/src/pages/features/ad-blocking.astro`; shield-state plumbing in `v1.9.1:src/main/main.js`. | The count is page-specific and reports matched requests, not every tracker on the site. | verified |
| “A site can be allowed from the shield.” | Blanc UI | `v1.9.1:site/src/pages/features/ad-blocking.astro`; exception handlers in `v1.9.1:src/main/adblock.js`. | Changing the site setting reloads the page. | verified |
| “Blanc uses EasyList and EasyPrivacy.” | Blanc implementation | v1.9.1 ad-blocking feature page plus the hash-verified bundled snapshot loaded by `v1.9.1:src/main/adblock.js`. | Strong default, not a guarantee. | verified |
| “Free for macOS, Windows, and Linux.” | Availability | `v1.9.1:site/src/pages/download.astro`; `docs/release-incidents/2026-08-26-v1.9.1.md` records the public three-platform gate. | macOS is offered by architecture; platform signing details differ. | verified |

No comparison claim about Chrome, Manifest V3, extension-store policy, or
another browser appears in this batch. Those claims would require a fresh
first-party external source at action time.

## Visual storyboard — approve before rendering

Format: a new 1080×1350 three-slide carousel for Instagram and Facebook, plus
a separate 1080×1920 8–10 second motion proof for TikTok/Reels. Do not stretch
the feed carousel into a vertical video.

All frames use only Blanc paper, ink, and neutral gray. The mark may appear
only black on white or white on black, with clear space and no colored backing.
Titles are sentence case, centered, approximately 500–600 weight. Subtitles
sit close below them at a readable size. Product UI comes from the public
v1.9.1 capture or a real v1.9.1 run—never generated UI.

### Feed carousel

1. **Ad blocking shouldn’t be another setup project.**

   Open Blanc and the blocker is already part of the browser.

2. **See what the page is asking for.**

   A real v1.9.1 Island capture fills the lower two-thirds. A restrained
   animated-looking ring may point to the shield in video adaptations, but the
   static slide must not invent motion or controls. Supporting line: “Open the
   shield to see the site setting and blocked-request count.”

3. **A strong default, with honest limits.**

   EasyList and EasyPrivacy reduce ads and known tracking. Some sites may need
   an exception. Footer: “Blanc is free for macOS, Windows, and Linux.”

### TikTok/Reel motion proof

- **0.0–2.3 s:** “Ad blocking shouldn’t be homework.” The subtitle remains
  visible for the full beat: “Blanc starts with it already in the browser.”
- **2.3–6.8 s:** A real v1.9.1 Island shield and popover. A thin neutral pulse
  highlights only the shield. Text: “See the site setting and request count
  right where you browse.”
- **6.8–9.5 s:** “A strong default, not a promise to block everything.” Small
  supporting line: “EasyList + EasyPrivacy. Per-site exceptions when needed.”
- **9.5–10.5 s:** Monochrome end card: “Download Blanc” and
  `blancbrowser.com`. No follow-begging screen.

The copy must stay visible long enough to read. The visual center stays true
to the artboard; only the narrowest safe-area adjustment may be used for
TikTok’s right-side controls.

## Platform-native copy

### X — text-first position post

> ad blocking shouldn’t be your first browser setup project.
>
> Blanc starts with it already in the browser. the Island shield shows the site setting and blocked-request count—without asking you to install an extension first.
>
> strong default. honest limits.

Attach one new product-proof still, not the full Instagram carousel. Follow-up
reply from Blanc only if the post earns a real question:

> it uses EasyList + EasyPrivacy, and you can let a site through from the shield when something needs an exception.

When the question genuinely needs more detail, link the words “how it works”
to the prepared X campaign URL in `measurement-plan.md`. Keep the first post
link-free.

### Threads — conversation post

> what’s the first thing you install when you set up a browser?
>
> ad blocking felt basic enough that we put it in Blanc before the first page loads.

No link in the first post. If someone asks what Blanc is, answer directly with
the prepared Threads campaign URL rather than dropping it into every reply.

### Instagram — carousel caption

> Ad blocking shouldn’t be another setup project.
>
> Blanc starts with ad and tracker blocking already in the browser. Open the Island shield to see the current site’s setting and blocked-request count—and let the site through if it needs an exception.
>
> It’s a strong default, not magic: Blanc uses EasyList and EasyPrivacy, and no blocker catches everything.
>
> Download Blanc for macOS, Windows, and Linux — link in bio.
>
> #browser #privacy #adblocking #indiesoftware

Temporarily make the prepared Instagram campaign URL the first profile link
for the measurement window, then restore the evergreen profile URL.

### Facebook — explanatory native post

> The first hour with a new browser shouldn’t begin in an extension store.
>
> Blanc has ad and tracker blocking built into the browser and enabled by default. The Island shield shows whether blocking is on for the site you’re viewing and how many requests were blocked. If a site needs an exception, you can change that site’s setting there.
>
> We use EasyList and EasyPrivacy as a strong default—not a promise that every ad or tracker disappears.
>
> Blanc is free for macOS, Windows, and Linux: https://blancbrowser.com/features/ad-blocking?utm_source=facebook&utm_medium=organic_social&utm_campaign=blocker_homework_aug_2026&utm_content=feed

### TikTok — native motion caption

> ad blocking shouldn’t be homework. it’s already part of Blanc. #browser #privacy #techtok

Use TikTok’s native cover text: `blocking, minus the setup`. Do not recycle the
carousel as a slideshow; publish only the separately rendered motion proof.

### Substack — builder Note

> We kept asking why ad blocking begins as browser homework.
>
> In Blanc it starts on, lives at the network layer, and stays visible through the Island shield. You can see the current site’s setting and request count, then make a site-specific exception when needed.
>
> The honest limit matters: EasyList and EasyPrivacy are a strong default, not a guarantee that every ad or tracker disappears.

Link only the words “how Blanc blocking works” to the prepared Substack
campaign URL in `measurement-plan.md`; do not append a second naked download
URL.

## Conversation-first distribution

Do not reuse the August 28 targets automatically. After Brave is unlocked,
find one recent conversation per platform in these lanes:

- a person describing the ritual of setting up a new browser;
- a current browser or privacy product discussing built-in blocking;
- a user asking why blockers sometimes break sites;
- a creator showing an ad-heavy page or extension setup.

At least three of the five non-TikTok replies must be casual or useful without
mentioning Blanc. A product reply is appropriate only when the parent directly
asks for an alternative or describes the exact setup burden. Recheck recency,
full context, existing Blanc replies, and account identity immediately before
drafting the final words.

### Fresh X candidate — rechecked August 29 at 12:15 ET

Target: Ente’s current email-alias thread quoting Brave’s desktop feature:
<https://x.com/enteio/status/2093246224438792365>

Live evidence: posted August 28; 25,193 views, 298 likes, 12 reposts, 131
bookmarks, and only 6 replies. The loaded conversation showed no Blanc reply.
This is relevant to a browser/privacy audience without requiring a Blanc pitch.

Proposed reply:

> every site that says “we’ll only email you when it matters” is exactly why aliases exist

No product or external factual claim. Recheck the full conversation and Blanc
reply state again at action time. Do not like, follow, or reply without explicit
approval.

### Fresh X candidate — rechecked August 29 at 13:07 ET

Target: ASUS's current Vivobook post opening with a "too many tabs" problem:
<https://x.com/ASUS/status/2093730752206901675>

Live evidence: posted at 12:01 PM; 2,595 views, 6 likes, 2 reposts, 1 bookmark,
and 0 replies. The loaded post showed no Blanc reply. This
is unusually fresh, directly adjacent to tab overload, and leaves room for a
casual response that does not interrupt the parent's product pitch.

Proposed reply:

> honestly the tabs multiply faster than the ports do

No product claim. Recheck the full conversation, age, engagement, and Blanc
reply state again at action time. Do not like, follow, or reply without explicit
approval.

### Fresh Threads follow-up — checked August 29 at 13:07 ET

Target: nahiddotai's direct reply to Blanc in a current Claude/Codex
conversation. The parent said that using Codex more than Claude would have
seemed unbelievable six months earlier. Blanc replied that Claude had been
nerfed and OpenAI had been smart about it; nahiddotai answered, “Yikes tru
dat.” The parent was seven hours old with 13 likes and 13 replies. Blanc's
reply had 1 like and this direct response. No Blanc follow-up was visible.

Proposed follow-up:

> same. six months ago this would’ve sounded made up

No product claim. This is a direct response to Blanc, so it takes priority over
cold outreach. Recheck the full conversation and reply state again at action
time. Do not like, follow, or reply without explicit approval.

### Fresh Threads candidate — rechecked August 29 at 12:15 ET

Target: a current tab-overload joke from Chronically Humored:
<https://threads.com/@chronicallyhumored/post/Dclr4oUkf1T>

Live evidence: posted August 28; 1.1K views, 46 likes, 1 reply, and 1 repost.
The loaded conversation showed no Blanc reply. The one existing response makes
the earlier permission-slip draft redundant, so do not use it.

Proposed reply:

> the oldest tab is always something you were definitely going to deal with after lunch

No product claim. Recheck the full conversation and Blanc reply state again at
action time. Do not like, follow, or reply without explicit approval.

### Fresh Facebook candidate — rechecked August 29 at 12:45 ET

Target: Brave Software's current Brave Accounts announcement:
<https://www.facebook.com/BraveSoftware/posts/pfbid0xjnr5jgQqAvhfPnYFvwFU9PVceAvSWeYB5bWntsLhVTw7t8NKVTF89KrSQPVmUiDl>

Live evidence: posted August 28; 2.1K reactions, 115 comments, and 114
shares. New comments were still arriving within the prior 24 minutes. No Blanc
comment was visible in the loaded conversation. The proposed
reply reacts only to Brave's own wording in the parent post and does not compare
products or promote Blanc.

Proposed reply:

> “your password never leaves your device” is the sentence everyone is going to remember here

Recheck the full conversation and Blanc comment state again at action time. Do
not react, follow, or comment without explicit approval.

### Fresh Substack candidate — rechecked August 29 at 12:45 ET

Target: Alexandros in LA's current note about Wikipedia tab spirals:
<https://substack.com/@alexandrosinla/note/c-324540823>

Live evidence: posted August 28; 18 likes, 2 replies, and 1 restack. The loaded
conversation showed no Blanc reply.

Proposed reply:

> Wikipedia tabs are how you look up one date and end up three countries and a dead language away.

No product claim. Recheck the full conversation and Blanc reply state again at
action time. Do not like, restack, follow, or reply without explicit approval.

### Fresh Substack relationship candidate — checked August 29 at 12:47 ET

Target: The Pink Index's first post, “I Have Too Many Tabs Open”:
<https://substack.com/home/post/p-213268472>

Live evidence: published five hours before the check; no visible likes,
comments, or restacks. The author describes curiosity turning into 19 tabs and
forgetting the original task, then explains why slower writing feels more
natural than short-form social content. No Blanc response was visible. This is
a relationship-building opportunity with a new writer, not a reach play.

Proposed reply:

> the part about 19 tabs and forgetting the original task is painfully familiar. writing gives the rabbit holes somewhere to land.

No product claim. Recheck the full post and Blanc reply state again at action
time. Do not like, restack, subscribe, or reply without explicit approval.

### Fresh Substack relationship candidate — checked August 29 at 13:13 ET

Target: Full Life Expedition's “Cognitive Load Is Real”:
<https://fulllifeexpedition.substack.com/p/cognitive-load-is-real>

Live evidence: published August 29; no visible likes, comments, or restacks.
The full article and empty discussion were loaded in Brave, and no Blanc
response was present. The post distinguishes the work itself from the context
people have to carry between systems and screens, using open tabs as a concrete
example. This is a high-fit relationship opportunity, not a reach play.

Proposed reply:

> the distinction between the work and the context you have to carry between screens is so useful. the browser rarely gets blamed for the second part.

No Blanc capability or external factual claim. Recheck the article,
discussion, and Blanc reply state again at action time. Do not like, restack,
subscribe, or reply without explicit approval.

### Instagram target disqualified — checked August 29 at 12:18 ET

Do not comment again on Brave's current Accounts post:
<https://www.instagram.com/bravebrowser/p/DcldJk5Ecsg/>. The post is current,
but Blanc already left a comment 16 hours earlier. A new Instagram outreach
target must be found at action time; publishing the new carousel remains the
approved growth opportunity for that platform.

### Instagram target disqualified — rechecked August 29 at 13:11 ET

Do not comment again on Ross Hayes's “four browser tabs” post:
<https://www.instagram.com/p/DcaeerVm33p/>. Blanc had already left two
comments—one four days earlier and another two days earlier—and had liked the
post. This target is exhausted even though it still appears prominently in
Instagram's native `browser tabs` search.

### Superseded Instagram candidate — checked August 29 at 12:32 ET

Target: Zero Dollar Coach's tab-overload post:
<https://www.instagram.com/p/Dbu6rgjGw4f/>

Live evidence: posted August 7 (three weeks old); 32 likes and 2 visible
comments. The full loaded conversation showed no Blanc comment. The parent is
about 43 open tabs as unfinished decisions, so the response can join the
conversation without pitching a feature.

Proposed comment:

> “little monuments to decisions” is painfully accurate. closing the tab can feel like deleting the thought.

No product claim. Recheck the full conversation and Blanc comment state again
at action time. Do not like, follow, or comment without explicit approval.

This candidate is no longer recommended because a more recent, more directly
relevant Instagram conversation was found below.

### Superseded Instagram candidate — checked August 29 at 12:43 ET

Target: Bigfoot Technology Group's browser-tab memory tip:
<https://www.instagram.com/p/Dcds3GvgElt/>

Live evidence: posted four days before the check; 1 like and no comments. The
full loaded post showed no Blanc comment. The parent recommends bookmarking
tabs instead of keeping them open, creating a natural opening for a useful,
non-promotional observation about the real friction in that advice.

Proposed comment:

> the hard part is knowing whether “bookmark it” means saved for later or never seen again

No product claim. Recheck the full conversation and Blanc comment state again
at action time. Do not like, follow, or comment without explicit approval.

This one-like fallback is no longer recommended because the current indie
founder conversation below is much fresher and has meaningful reach.

### Fresh Instagram candidate — checked August 29 at 13:11 ET

Target: iampascio's current indie-founder expenses joke:
<https://www.instagram.com/p/DclGubHKtyW/>

Live evidence: posted 23 hours before the check; 2.2K likes, 15 comments, and
97 reposts. The loaded conversation showed no Blanc comment. The parent jokes
about buying domains, SaaS subscriptions, caffeine, and Uber Eats while the
MVP remains “releasing soon.” This is an active indie-tech audience and gives
Blanc room to sound like a fellow builder without pitching a browser feature.

Proposed comment:

> the domain portfolio is thriving. the MVP would prefer not to comment

No product claim. Recheck the full conversation, engagement, and Blanc comment
state again at action time. Do not like, follow, or comment without explicit
approval.

### Superseded TikTok candidate — checked August 29 at 12:31 ET

Target: Oblivious Audacity's tab-hoarding video:
<https://www.tiktok.com/@obliviousaudacity/video/7675087804329643278>

Live evidence: posted August 17; 23 likes, 9 comments, and 2 shares. All nine
loaded comments were checked and no Blanc comment was visible. The creator is
actively replying, but the post is still small enough for Blanc's comment to
be seen.

Proposed comment:

> at a certain point they stop being tabs and become emotional support bookmarks

No product claim. Recheck the full conversation and Blanc comment state again
at action time. Do not like, follow, or comment without explicit approval.

This candidate is no longer recommended because the fresher TikTok
conversation below has more active participation and stronger topic fit.

### Fresh TikTok candidate — checked August 29 at 12:44 ET

Target: Amanda Mercedesb's “How many tabs do you have open?” video:
<https://www.tiktok.com/@amandamercedesb/video/7679245261239045406>

Live evidence: posted 16 hours before the check; 8 likes, 16 comments, 1
favorite, and no shares. The loaded comments contained active tab-count
confessions ranging from 248 to 542; no Blanc comment was visible. The parent
asks a direct question, so the reply can join the conversation without a pitch.

Proposed comment:

> open enough that the number stopped feeling like useful information

No product claim. Recheck the full conversation and Blanc comment state again
at action time. Do not like, follow, or comment without explicit approval.

## Measurement

Capture immediately before publication:

Live baseline refreshed read-only in Brave at **13:07 ET on August 29**. It must
still be refreshed immediately before publication.

| Platform | Followers/subscribers | Latest-post reach | Profile/activity baseline | Link/download baseline | Live URL |
| --- | ---: | ---: | ---: | ---: | --- |
| X | 7 followers | Quiet Tabs: 3 views, 0 replies/reposts/likes | Profile-level visits not exposed on the loaded surface | pending first-party link check | [Quiet Tabs](https://x.com/blancbrowser/status/2093547853905871132) |
| Threads | 21 followers | Quiet Tabs: no visible interactions | 12.7K recent views; weekly recap: 12,307 views, 177 replies, and 18 new followers from 23 posts | tracked bio link present; click count not exposed here | [Quiet Tabs](https://www.threads.com/@blancbrowser/post/DcmOQdijpqu) |
| Instagram | 105 followers | Quiet Tabs Reel: 389 views, 98 viewers, 2 interactions, 0 follows; Tab Count Confession static: 1 view, 0 interactions, 0 profile activity | Quiet Tabs reached 96.3% non-followers but produced no profile activity; the static reached one follower only | 0 external-link taps from the static | native post insights |
| Facebook | 9 followers | Quiet Tabs: 1 like; reach not exposed on the loaded profile surface | 101 visits, 11 net follows and 2 unfollows over 28 days | pending first-party link check | Audience dashboard |
| TikTok | 27 followers | Quiet Tabs: 0 likes, 0 comments, 0 favorites, 1 share | 396 video views, 12 profile views, 9 likes, 0 comments, 0 shares, and 12 net followers over 7 days; 97.8% For You traffic | website-link activity not exposed | Studio analytics |
| Substack | 1 subscriber | latest article: no visible engagement on the public profile | 136 publication views over 7 days at the prior publisher checkpoint | pending Traffic-tab check | Publisher home |

Recheck at 60–90 minutes and 24 hours. Record reach, profile visits,
meaningful replies/comments, reposts/shares, saves, link activity, and net
followers. A view is distribution; a profile visit or follow is conversion.
Do not claim social download attribution without a tagged link or first-party
evidence.

## Action gate

No asset is rendered and no public action occurs until Anthony approves the
storyboard and copy. After approval, preview every frame and video frame,
verify the exact v1.9.1 UI, then perform the live six-platform baseline and
duplicate/freshness checks in Brave. Publication and each reply still require
action-time confirmation.

The required authentic source and the stale assets that must not be used are
recorded in `blocker-campaign-production-manifest-2026-08-29.md`.
