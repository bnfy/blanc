# Substack article draft — Your browser's business model is part of the browser

Status: **draft only**. This file does not authorize publication, a Substack
Note, a reply, a like, a restack, a subscription, or any other public action.

Public Blanc baseline: **v1.10.0**.

## Publication copy

# Your browser's business model is part of the browser

## Privacy settings matter. The incentives behind them matter first.

A browser sits between you and much of your life online. It handles the pages
you open, the searches you make, the accounts you sign into, and the files you
download. That makes its privacy settings important. It also makes the question
behind those settings important:

**Who pays for the browser, and what does that make the browser accountable
to?**

We usually discuss browser privacy one toggle at a time. History sync. Search
suggestions. Usage statistics. Personalized ads. Each toggle deserves scrutiny,
but the toggles are downstream of a larger choice. A company decides what the
browser is for, which relationships support it, and which measurements the
business needs long before anyone writes the label in Settings.

Privacy is not only a collection of features. It is also an incentive problem.

## The business model is not a conspiracy theory

Google's current privacy policy identifies Chrome as one of its platforms. It
also says the information Google collects depends on the services and settings
someone uses. Chrome history is included when a user syncs it with a Google
Account—not simply because every Chrome user has opened the browser.

Google is equally specific about some address-bar behavior. When Chrome's
“Improve search suggestions” setting is enabled, text typed in the address bar
is sent to the default search engine with the request's IP address and cookies.
If Google is the default engine and another browsing-improvement setting is
enabled, the current page URL can also be sent to improve those suggestions.
Google documents controls for these behaviors and says it suppresses text that
looks sensitive.

These details matter because they replace an easy accusation with a more useful
question. The claim is not that Chrome secretly sells every person's browsing
history. Google's own documentation does not support that statement.

The structural fact is simpler: Alphabet reported $294.7 billion in Google
advertising revenue in 2025, out of $402.8 billion in total revenue—about 73%.
Chrome exists inside a company whose largest source of revenue is advertising.
That does not prove a hidden data flow. It does mean that search, identity,
measurement, advertising, and the browser live inside the same economic system.

That relationship is worth examining even when the controls are real and the
documentation is public. A privacy setting can limit a particular flow. It
cannot change what the parent business is built to optimize.

## What Blanc is choosing instead

Blanc is built by Bananify, a small independent software studio. We have no
venture funding, no investors setting an exit timetable, and no advertising
business. Blanc is not funded by selling ads or turning browsing activity into
an audience product.

The browser is free. People who want to support the work can become Blanc
Patrons. Patron adds named workspaces and a few cosmetic benefits, while the
things that make Blanc a browser remain free.

That model does not make Blanc automatically virtuous, private in every
possible sense, or exempt from scrutiny. It simply gives the product a different
answer to the accountability question. We need to make a browser people choose
to keep using, and some of those people need to decide the work is worth
supporting directly.

There is no advertising audience to grow on the other side of the product.

## The honest privacy story includes what Blanc sends

“Independent” should not become a shortcut for “trust us.” The stronger promise
is specificity.

Blanc does have a usage ping. On a fresh install, the “Help improve Blanc”
choice is presented on, but Blanc asks before the first ping and you can turn it
off before continuing or later in Settings. When enabled, a packaged build
sends one event at launch containing a random installation ID, a random
per-launch session ID, the Blanc version, operating-system family and coarse
major version, and processor architecture.

It does not contain a URL, browsing history, a search, page content, a Blanc
account, a name, an email address, or precise location. The installation ID can
be reset in Settings. Turning the setting off stops future events.

Search suggestions are also presented on during first run and can be turned off
before continuing or later. When enabled, Blanc sends eligible text prefixes to
the selected search provider. Those requests are bounded and cookie-free, do
not run in private tabs, and exclude pasted text, URLs, local paths, and several
patterns that look like credentials or payment-card numbers. Pressing Enter to
search still sends the completed query to the selected search provider, as it
would in other browsers.

Profile Sync takes a stricter default: it is off until a person enables it.
Eligible sync content is encrypted on the device, and the current server stores
ciphertext it cannot read or index. Sharing a bounded snapshot of open tabs is
a separate per-device choice.

Those are not slogans. They are boundaries a reader can evaluate, criticize,
and check against the public privacy policy.

## Local-first is a direction, not a magic spell

Most of Blanc's browser records—history, favorites, settings, permissions,
downloads metadata, cookies, and the regular session used to restore tabs—stay
on the device unless an optional feature explicitly says otherwise.

That does not make browsing anonymous. Websites still receive the requests you
make. Your search provider still receives searches. Your network and internet
provider can still observe traffic available to them. Private tabs keep certain
records out of Blanc's own history, session restore, recently closed list, and
sync; they do not disguise you from the rest of the internet.

Blanc also uses outside infrastructure where it solves a real operational
problem. GitHub distributes releases. Cloudflare hosts the site and limited
workers. The website uses restricted, cookieless Google Analytics measurement
by default and asks before enabling full analytics and ad-conversion
measurement. Each relationship creates a data flow that should be named and
bounded, not hand-waved away.

The goal is not to claim purity. It is to keep browsing activity from becoming
the business.

## A better browser question

When a browser says it values privacy, look beyond the most reassuring toggle.
Ask:

- Who funds the product?
- What information leaves the device by default?
- Which choices appear before the first request?
- Can the data flow be described precisely?
- Does turning a feature off actually stop future events?
- Is browsing activity an input to the product, or an input to the business?

No browser gets to answer those questions once and declare the matter settled.
Defaults change. Services change. Business pressures change. An independent
browser should be judged by the same standard it applies to the largest ones.

Blanc's answer is not “nothing ever leaves your computer.” That would be false.
Our answer is that the browser's business model should not depend on making your
browsing more valuable to advertisers—and that every exception to local-first
behavior should be specific enough for you to make an informed choice.

That is a smaller promise than “perfect privacy.” It is also one we can be held
accountable for.

---

Blanc is a free desktop browser for macOS, Windows, and Linux, built
independently by Bananify. Learn more at [blancbrowser.com](https://blancbrowser.com/).

## Sources for publication

- [Alphabet 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) — 2025 Google advertising and total revenue. Accessed August 30, 2026.
- [Google Privacy Policy](https://policies.google.com/privacy) — Chrome's place among Google platforms, settings-dependent collection, and synced Chrome history. Effective May 26, 2026; accessed August 30, 2026.
- [How Chrome keeps your URL and search data private](https://support.google.com/chrome/answer/13730681?hl=en) — documented address-bar suggestion data flows and controls. Accessed August 30, 2026.
- [Blanc privacy policy](https://blancbrowser.com/privacy) — local records, usage ping, search suggestions, Profile Sync, website measurement, and external services. Public v1.10.0 policy; accessed August 30, 2026.
- [About Blanc](https://blancbrowser.com/about) — ownership, funding model, free browser, and Blanc Patron. Public v1.10.0 site; accessed August 30, 2026.

## Suggested Substack Note teaser

Privacy settings live inside business models.

Alphabet made about 73% of its 2025 revenue from advertising. That does not
mean Chrome secretly sells everyone's history. It does mean the browser exists
inside an advertising economy—and that is part of the product context.

Blanc has a different model, but “independent” is not a substitute for details.
The honest version includes exactly what Blanc sends, what stays local, and
which defaults still deserve scrutiny.

New essay: **Your browser's business model is part of the browser.**

## Claim ledger

| Draft claim | Type | Evidence | Qualification | Verdict |
| --- | --- | --- | --- | --- |
| Chrome is a Google platform. | external fact | Google Privacy Policy, effective May 26, 2026 | Does not establish a particular Chrome data flow by itself. | verified |
| Synced Chrome history may be collected with a Google Account. | external fact | Google Privacy Policy | Must retain the sync/account condition. | verified and qualified |
| Certain Chrome address-bar settings send typed text, request metadata, and in one documented configuration the current URL to the default search engine or Google. | external fact | Google Chrome Help | Each flow is settings-dependent; Chrome suppresses certain sensitive-looking text and offers controls. | verified and qualified |
| Alphabet reported $294.691B in Google advertising revenue and $402.836B total revenue in 2025. | external fact | Alphabet 2025 Form 10-K | The 73% figure is calculated from those reported amounts and rounded. | verified |
| Chrome exists inside a company whose largest revenue source is advertising. | fact plus inference | Alphabet 2025 Form 10-K; Google Privacy Policy | This does not prove Chrome sells browsing history or any undisclosed flow. | verified and qualified |
| Blanc is independently built without venture funding, investors, or an advertising business. | Blanc product/business fact | `v1.10.0:site/src/pages/about.astro` | Does not imply Blanc has no network requests. | verified |
| Blanc's enabled launch ping carries a bounded set of device/app fields and no browsing content. | Blanc capability | `v1.10.0:src/main/telemetry.js`; `v1.10.0:site/src/pages/privacy.astro` | Presented on during first run; choice appears before first ping and can be turned off. Do not call it opt-in. | verified and qualified |
| Blanc search suggestions are presented on, can be turned off before continuing, and use bounded cookie-free provider requests with exclusions. | Blanc capability | `v1.10.0:site/src/pages/privacy.astro`; v1.10.0 suggestion implementation | Completed searches still go to the selected provider. | verified and qualified |
| Profile Sync is off by default and server-blind for eligible encrypted data. | Blanc capability | `v1.10.0:site/src/pages/privacy.astro`; `v1.10.0:site/src/pages/features/sync.astro` | Open-tab publication is a separate per-device choice. | verified and qualified |
| Most named Blanc browser records stay local unless an optional feature says otherwise. | Blanc capability | `v1.10.0:site/src/pages/privacy.astro` | Sites, providers, networks, and enabled services still observe their own requests. | verified and qualified |
| Blanc's website runs restricted cookieless GA measurement by default and full analytics only after Allow. | Blanc website fact | `v1.10.0:site/src/pages/privacy.astro` | Restricted pings are still a data flow and must not be described as “no analytics.” | verified and qualified |

## Pre-publication decisions

1. Confirm whether the close should say “Learn more” or make the stronger direct
   download request.
2. Review the concept-only 5:2 header brief in
   [`substack-business-model-header-brief-2026-08-30.md`](substack-business-model-header-brief-2026-08-30.md).
   No asset has been generated; creative approval comes first.
3. Re-open all external first-party sources immediately before publication and
   refresh any statement whose source changed.
4. Publish the article and its Note only through separate action-time approvals.
