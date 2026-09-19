# Meta paid follower test 2 — creative brief

Status: Brief only. No asset has been created, no ad has been created, and no
budget or targeting change is authorized.

Public product baseline: v1.13.0 (`25e682f`).

## Why a second test is justified

The active Facebook Page Visits ad has produced the portfolio's clearest paid
follower signal: three Meta-reported follows from 117 Page visits on $17.86
spend. That is a 2.56% reported visit-to-follow rate and an observational $5.95
per reported follow.

The live Page is only +1 net against today's opening count, so the current ad
is promising but not yet a proven scalable acquisition unit. At the observed
cost, a $13 daily budget implies about 2.2 reported follows per day. Reaching
ten reported follows by spend alone would imply about $59.50 per day before
unfollows. This is a planning inference, not a budget recommendation.

## Test question

Can a clearer user-agency promise convert Facebook mobile-feed viewers into
Page followers more efficiently than the current ad-blocking explanation?

The test changes the promise while preserving the destination and broad
audience. It should not run concurrently with the first ad; complete and record
the first result before starting a clean comparison.

## Creative format

- 1080×1350 static image for Facebook mobile feed.
- Full-color real Blanc v1.13.0 product capture, not generated browser UI.
- Use `site/public/press/blanc-island-product-capture-v2.png` as the candidate
  visual source; the file is present in the public v1.13.0 tag.
- Keep the complete Island visible and legible at a 270×338 preview.
- Use the monochrome paper/ink type system around the full-color screenshot.
- If the Blanc mark appears, it must be black on white or white on black. No
  accent-colored mark, badge, field, glow, or gradient.
- No video-first or Reels crop: 280 of the first ad's 302 reached accounts came
  through Facebook mobile feed, while only 18 came through Reels.

## On-image message

Headline:

> Use the browser. Skip another account.

Subtext:

> Blanc has no required account and no built-in AI assistant competing with
> the page.

Footer:

> Follow Blanc Browser.

The headline is an ordinary user payoff, not a claim that Blanc has no optional
account-backed integrations. The subtext carries the exact release-backed
qualification.

## Proposed ad copy

> You already have enough accounts. Blanc does not require another one, and it
> does not put a built-in AI assistant over the pages you open.
>
> Follow Blanc Browser to see how an independent, open-source desktop browser
> can make different choices.

CTA: `Visit Profile`

## Claim audit

| Claim | v1.13.0 evidence | Verdict and qualification |
| --- | --- | --- |
| Blanc does not require an account | `site/src/pages/press.astro` and `site/src/pages/download.astro` | Verified. Profile Sync and the optional 1Password integration can involve separate credentials, but a Blanc account is not required to use the browser. |
| Blanc has no built-in AI assistant | `docs/marketing-claims.md`, `site/src/pages/features.astro`, and `site/src/pages/press.astro` | Verified. Do not broaden this into a claim that websites cannot provide AI. |
| Blanc is an independent, open-source desktop browser | `site/src/pages/ambassadors.astro`, `site/src/pages/faq.astro`, `LICENSE`, and the v1.13.0 release record | Verified. MIT applies to Blanc-owned material subject to trademark and third-party carve-outs. “Independent” describes Bananify's ownership and no-investor model, not anonymity or a privacy guarantee. |

## Measurement design

Record before launch:

- current Page followers;
- the first ad's final spend, Page visits, attributed follows, and net Page
  change;
- the v1.13.0 GitHub package-request total as aggregate context only.

Check test 2 after approximately $5, $10, and the full approved budget:

- Meta-reported Page visits and follows;
- cost per reported follow;
- live net Page follower change;
- reactions and comments only as diagnostic signals;
- aggregate package-request movement without social attribution.

Test 2 beats the current result only if its reported visit-to-follow rate
exceeds 2.56%, its cost per reported follow is below $5.95, and the live Page
count moves in the same direction. If Meta reports follows while net audience
stays flat or falls, classify the result as ambiguous rather than a win.

Stop the test if it reaches 100 Page visits with zero reported follows, or if a
material comment reveals that the account/AI wording is being misread. Do not
increase spend until a net-positive result is verified.

## Approval sequence

1. Review and approve this message direction.
2. Create and inspect the 1080×1350 asset at full and phone-feed sizes.
3. Wait for the current ad's final result.
4. Request separate action-time approval for the new ad, budget, duration, and
   audience.

This brief authorizes none of those later actions.
