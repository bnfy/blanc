# Finished Reddit feedback changes — owner review

Website/docs branch: `codex/reddit-feedback-site`.
Desktop candidate: `codex/reddit-feedback-onboarding`.
Both are isolated from the existing checkout. Public evidence baseline v1.26.0.
The website incorporates the published homepage refinement `d881ef77`.
Before commit/push, both branches were fast-forwarded to freshly fetched
`ca935fbb`; the intervening main changes do not alter the reviewed candidate UI.

## Review the website copy and interactions

[Local homepage preview](http://127.0.0.1:4330/) — choose **Watch demo**, then
**Finding your tabs**. The opening sequence previews a favicon/title, selects
that tab and opens +N. Pause and Replay retain stable chapter navigation. The demo keeps the live
Newsreader heading treatment, compact bar and macOS 1Password chapter.

[Download and fit](http://127.0.0.1:4330/download) ·
[Security and audit status](http://127.0.0.1:4330/features/security) ·
[About / AI process](http://127.0.0.1:4330/about) ·
[FAQ](http://127.0.0.1:4330/faq) ·
[Named Workspaces](http://127.0.0.1:4330/features/workspaces) ·
[Blocking report intake](http://127.0.0.1:4330/features/ad-blocking).

The main action note reads **“Free browser. Patron adds saved Named Workspaces.”**
Detailed copy states free essentials/ordinary groups, the optional US$30/year or
US$4/month subscription plus tax, active creation gate, existing-workspace
lapse behavior and retained lifetime access. Pricing and entitlement code are
unchanged. Trust copy separates authenticated artifacts from an independent
external audit, which has not been completed. No audit date is promised.

![Finished desktop tab-discovery demo](/private/tmp/blanc-reddit-review/finding-tabs-1440.png)

The standalone Finding your tabs card and extra visible explanation are removed.
The animation demonstrates discovery with three short captions: Preview a tab,
Switch with a click, See all your tabs. Visible text fallback is shown only when JavaScript is unavailable, per the
owner’s correction. A visually hidden tab-discovery description remains
available to screen readers in both the inline demo and enlarged viewer.

![Mobile static explanation](/private/tmp/blanc-reddit-review/tab-explanation-390.png)

## Desktop candidate and preparation documents

The existing Meet the island step now introduces one idea: “Tabs, search and
navigation, all in one place.” Light/dark captures of the actual quiet Island
show its complete ordinary browsing state with native proportions: navigation,
three tab dots, favicon/domain, New Tab, blocker shield, separator, Reload,
Favorite and Close. One platform-specific shortcut sits underneath. The Reading
list sample and explanatory callouts remain removed. Detailed tab discovery
stays in the website demo; the image retains an accessible caption.
Its scope is recorded in `docs/reddit-feedback-2026-10-02/onboarding-candidate.md`
on that branch. It will be delivered through normal desktop gates; it is not released.

![Revised Meet the island step](/private/tmp/blanc-real-island-onboard/meet-the-island-light.png)

[Audit preparation brief](audit-brief.md) ·
[Reddit reply drafts](reddit-reply-drafts.md) ·
[Validation and follow-up record](validation-and-follow-up.md).

The reply drafts remain drafts. Posting requires separate approval and an
explicit posting instruction. Newcomer sessions and actual missed-ad cases
remain open; no blocker fix has been inferred without a reproducible URL.

## Delivery status

After reviewing the local website and onboarding corrections, the owner
requested commit and push on October 2. The reviewed changes are being delivered
as separate website and desktop pull requests. Production deployment, desktop
release, audit commissioning and Reddit posting remain separate actions.
Normal production identity/canonical-page verification is required after any
website deployment; normal desktop release gates still apply to onboarding.
