# Creator outreach drafts — September 3, 2026

Status: Staged only. No message in this file has been sent. Every invitation
requires action-time approval immediately before it is sent.

Public product baseline: v1.13.0 (`25e682f`).

## Smartphones sans Google (`@Sans_Google`) — X

### Why this creator qualifies

- 6,151 followers at the September 3 review.
- A WebLibre open-source privacy-browser post reached 4,521 views, 58 likes,
  seven reposts, and 38 bookmarks within about three hours.
- A Signal surveillance post reached 17,659 views, 268 likes, 41 reposts, and
  135 bookmarks within about six hours.
- The Replies feed shows current, direct responses to readers.
- The audience fit is unusually strong around open source, privacy, user
  agency, and digital sovereignty.

### Important positioning boundary

Blanc uses Chromium through Electron. Do not call Blanc “de-Googled,” imply
that it replaces every Google dependency, or hide that architectural tradeoff.
The invitation should make that limitation explicit and ask for criticism,
not endorsement.

### Proposed French invitation

> Bonjour — nous suivons votre travail sur les alternatives aux GAFAM et la
> façon dont vous expliquez leurs compromis sans transformer chaque
> recommandation en slogan.
>
> Nous construisons Blanc, un navigateur de bureau indépendant et open source,
> basé sur Chromium via Electron. Il n’exige pas de compte, n’intègre pas
> d’assistant IA, et sa mesure d’usage est facultative. Nous ouvrons un petit
> programme pilote pour des créateurs capables de tester le produit en toute
> indépendance, y compris de critiquer notre choix de Chromium.
>
> Il n’y a aucune obligation de publier pendant l’essai et nous ne demandons
> pas de commentaire préparé. Si cela vous intéresse, voici les détails :
> https://blancbrowser.com/ambassadors?utm_source=x&utm_medium=creator_outreach&utm_campaign=ambassador_pilot&utm_content=sans_google

## Ram Maheshwari (`@rammcodes`) — X

### Why this creator qualifies

- 4,318 X followers at the September 3 review; profile reports more than
  500,000 followers across platforms.
- A current open-source workflow-capture post reached 9,316 views, 148 likes,
  18 reposts, and 243 bookmarks within about seven hours.
- A current OpenWhispr post reached 271 views and six likes within about 36
  minutes.
- He replied the same day to a maker who publicly credited one of his features
  with driving 800 users per day, demonstrating active creator interaction.

### Proposed invitation

> Hi Ram — your recent OpenWhispr and workflow-capture posts stood out because
> you showed what the tools actually change for the user.
>
> We’re building Blanc, an open-source desktop browser that replaces the
> permanent tab strip and toolbar with one Island and does not bundle an AI
> assistant. We’re opening a small creator pilot built around an honest trial,
> not scripted praise. There is no obligation to post during the trial.
>
> If you’re interested, we would value your independent reaction:
> https://blancbrowser.com/ambassadors?utm_source=x&utm_medium=creator_outreach&utm_campaign=ambassador_pilot&utm_content=ram_maheshwari

## Pranav Mailarpawar (`@pranvtwt`) — X

### Why this creator qualifies

- 18.5K X followers and open direct messages at the September 3 review.
- His pinned independent-project update has 267,713 views, 1,720 likes, 67
  reposts, and 1,749 bookmarks.
- He is actively publishing about open-source, browser-side tools and the
  organic creator attention his products receive.
- His Replies feed shows responses to other makers and audience members within
  the same hour.

### Proposed invitation

> Hi Pranav — seeing people make their own reels about ihatepdf.cv caught our
> attention. You’ve built products people actually want to explain, which is
> exactly the kind of independent voice we’re looking for.
>
> We’re building Blanc, an open-source desktop browser that puts tabs inside
> one Island instead of a permanent tab strip and toolbar. We’re opening a
> small creator pilot built around an honest product trial—not scripted praise.
> There is no obligation to post during the trial.
>
> If it sounds interesting, we’d value your independent reaction:
> https://blancbrowser.com/ambassadors?utm_source=x&utm_medium=creator_outreach&utm_campaign=ambassador_pilot&utm_content=pranav_mailarpawar

## Claim audit

| Draft claim | v1.13.0 evidence | Verdict and qualification |
| --- | --- | --- |
| Blanc is an independent, open-source desktop browser | `v1.13.0:site/src/pages/ambassadors.astro`, `v1.13.0:site/src/pages/faq.astro`, `v1.13.0:LICENSE`, and the v1.13.0 release record | Verified. “Independent” describes Bananify’s ownership and no-investor model; it is not a privacy guarantee. |
| Blanc uses Chromium through Electron | `v1.13.0:site/src/pages/faq.astro` and `v1.13.0:package.json` | Verified. This qualification must stay in the Sans Google invitation. |
| Blanc does not require an account | `v1.13.0:site/src/pages/press.astro` and `v1.13.0:site/src/pages/download.astro` | Verified. Optional Profile Sync and 1Password account interactions do not make a Blanc account mandatory. |
| Usage measurement is optional | `v1.13.0:site/src/pages/privacy.astro` and `v1.13.0:site/src/pages/faq.astro` | Verified with qualification: the fresh-install choice is presented on, can be turned off before continuing, and can be changed later. Do not claim zero telemetry. |
| Blanc ships no AI assistant | `docs/marketing-claims.md`, `v1.13.0:site/src/pages/features.astro`, and `v1.13.0:site/src/pages/press.astro` | Verified. Do not broaden this into a claim that no website or external service can provide AI. |
| Blanc replaces the permanent tab strip and toolbar with the Island | `v1.13.0:site/src/pages/ambassadors.astro`, `v1.13.0:site/src/pages/features/island.astro`, and `v1.13.0:src/main/main.js` | Verified. Do not claim that Blanc semantically understands or automatically organizes work. |
| The pilot asks for an honest trial and does not require a post during the trial | `v1.13.0:site/src/pages/ambassadors.astro` | Verified program term. Any later deliverable, compensation, reuse right, or disclosure plan requires separate written approval. |

## Approval boundary

Opening a message composer is read-only preparation. Typing or sending any
invitation is representational communication and requires a fresh action-time
confirmation. Following, liking, reposting, or commenting is not bundled into
that approval.
