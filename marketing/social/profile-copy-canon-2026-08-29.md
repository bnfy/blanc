# Blanc social profile copy canon — August 29, 2026

Status: **prepared for approval; no profile field, link, pin, or account
setting changed**.

Formatting is governed by `voice-and-formatting-canon.md`. Existing lowercase
profile copy documented below is preserved as observed live, not treated as a
rule for future writing or a reason to lowercase professional copy.

This copy is designed to convert a first profile visit into a follow. It does
not ask the visitor to decode a feature list. The emotional tension comes
first—browser chrome should not be the loudest thing on the screen—then the
payoff, product proof, and reason to follow.

The current live X, Threads, and Facebook fields were exposed during the
August 29 Brave audit. Where their live wording is already stronger than a
proposed replacement, this document now preserves it. Compare every remaining
field live before changing it.

## Release-backed claim ledger

| Proposed statement | Public v1.9.1 evidence | Qualification | Verdict |
| --- | --- | --- | --- |
| Blanc is a desktop browser. | `v1.9.1:site/src/pages/index.astro` | Do not imply a mobile build. | verified |
| Blanc has no permanent tab strip. | `v1.9.1:site/src/pages/index.astro`; `v1.9.1:site/src/pages/features/island.astro` | The Island remains visible as the browser's compact control surface. | verified |
| Blanc has no built-in AI. | `v1.9.1:site/src/pages/index.astro` FAQ; absence of an AI/agent surface in the shipped chrome | This does not prevent people from visiting AI websites. | verified |
| Blanc is free on macOS, Windows, and Linux. | `v1.9.1:site/src/pages/index.astro`; `docs/release-incidents/2026-08-26-v1.9.1.md` | Optional Patron benefits remain separate. | verified |
| Blanc does not require an account. | `v1.9.1:site/src/pages/index.astro` and the v1.9.1 first-run/release evidence | Optional Profile Sync uses a user-created handle and passphrase; normal browsing does not require it. | verified |
| Followers can follow the build. | Public changelog and continuing signed releases through v1.9.1 | A social editorial promise, not an automatic product feature. Keep publishing real build decisions and evidence. | verified editorial promise |

## Exact platform copy

### X bio — keep the stronger live wording

The live X bio matches the strongest audience-first wording already used on
Threads:

> the desktop web browser for people who keep too much open. tabs stay within reach; the tab strip goes away.

**Keep this bio unchanged.** It identifies the person Blanc is for and the
visible relief before describing the mechanism. The earlier “Different on
purpose…” replacement is superseded and must not be applied.

The website remains in X's separate website field. Do not spend bio characters
repeating the URL.

### Threads bio — keep the stronger live wording

The logged-in August 29 audit exposed the live Threads bio after the earlier
accessibility-text failure. It is already more specific, human, and
benefit-led than the replacement proposed in the first draft:

> the desktop web browser for people who keep too much open. tabs stay within reach; the tab strip goes away.

**Keep this bio unchanged.** It names the intended user, the emotional
tension, and Blanc's visible payoff without sounding like a feature list. The
earlier “Different on purpose…” replacement is superseded and must not be
applied.

The live tracked homepage is already the primary link. Normalize its UTM
parameters only as a separately approved measurement change; do not risk the
bio wording to bundle that edit with profile-copy work.

### Instagram name and bio

Search-facing name field:

> Blanc Browser · desktop browser

Bio:

> Different on purpose.
> A desktop browser that gets out of the way.
> No permanent tab strip. No built-in AI.
> Follow the build ↓

Use the tracked homepage as the first link. Additional social links should not
sit above the product link.

### Facebook About — keep the stronger live wording

The live Facebook About text is already concise, benefit-led, and
release-backed:

> Blanc is the desktop web browser for people who keep too much open. Tabs stay within reach; the tab strip goes away. Built-in ad and tracker blocking.

**Keep this About text unchanged.** The longer replacement proposed earlier
would add claims but weaken the first-visit answer.

The action button should lead to the tracked homepage or download page, not a
generic social destination. Put a real release-backed Island explainer in
Featured once its current public state and crop are rechecked.

### TikTok bio — 73 characters

> different on purpose. desktop browser, less in the way. follow the build.

TikTok currently exposes no dependable website link for this account. Do not
pretend caption URLs are clickable or attribute later direct traffic to a
specific TikTok post. The pinned video must explain the Island on its own.

### Substack profile bio

> Blanc is a desktop web browser that gets out of the way: no permanent tab strip, no built-in AI, and no required account. Different on purpose. Follow the build.

This retains Anthony's required phrase **desktop web browser**. The publication
description can be longer, but the profile bio should remain the first-visit
answer. The subscribe payoff is ongoing build decisions, release notes, and
plainspoken essays—not vague lifestyle content.

## Proposed evergreen tracked profile links

| Platform | URL |
| --- | --- |
| X | `https://blancbrowser.com/?utm_source=x&utm_medium=organic_social&utm_campaign=profile&utm_content=bio` |
| Threads | `https://blancbrowser.com/?utm_source=threads&utm_medium=organic_social&utm_campaign=profile&utm_content=bio` |
| Instagram | `https://blancbrowser.com/?utm_source=instagram&utm_medium=organic_social&utm_campaign=profile&utm_content=bio` |
| Facebook | `https://blancbrowser.com/?utm_source=facebook&utm_medium=organic_social&utm_campaign=profile&utm_content=about` |
| Substack | `https://blancbrowser.com/?utm_source=substack&utm_medium=organic_social&utm_campaign=profile&utm_content=bio` |

These are evergreen profile links. Feature-specific campaign URLs belong in
the post or temporary campaign slot, not as permanent identity copy. TikTok is
excluded until the platform exposes a real website field for the account.

## Conversion test

Record each live field and baseline immediately before any approved edit. At
24 hours and seven days, compare:

1. profile visits;
2. follows or subscribers;
3. profile-visit-to-follow rate;
4. tracked homepage sessions by platform;
5. `download_click` events and aggregate `/dl/<platform>` movement, clearly
   separated where source attribution is unavailable.

Do not call the copy successful from impressions alone. If profile visits rise
without follows, the pinned/Featured explainer is the next conversion surface
to fix. If follows rise without link activity, the social identity is working
but the product action remains weak.

## Action gate

Before any approved edit, reopen the exact profile in the logged-in Brave
session and compare the live field character-for-character. Preserve any
already-better wording. Editing bios, links, action buttons, pins, or Featured
content is a public account change and requires explicit action-time approval.
