# Blanc on Substack

Status: **plan, approved October 13, 2026.** It does not authorize any change
to the Substack profile, or any Note, post, reply, like, restack or
subscription. Every public action still needs the owner's yes on that exact
text at the time it goes out.

Publication: [blancbrowser.substack.com](https://blancbrowser.substack.com/)
· profile [@blancbrowser](https://substack.com/@blancbrowser).
This plan replaces the browser-only editorial lane of August 30
([`../substack-privacy-editorial-lane-2026-08-30.md`](../substack-privacy-editorial-lane-2026-08-30.md)).
Its essay ideas live on in the queue below.

## Where it stands (October 13, 2026)

- Two posts (August 23 and 27) and a handful of Notes, the last on October 1.
  Four subscribers.
- The profile and publication are named "Blanc Browser", the bio describes a
  browser only, and the About page is Substack's default text.

## What the publication is for

Blanc is becoming a family of apps: Blanc Browser today, and Blanc Mail, a
native Gmail app for Mac, coming soon. The publication speaks for **Blanc**,
not one product, so no piece should assume the reader only cares about a
browser.

The owner chose a mix of release stories and essays, with Notes in between.

### What we write about

1. **Releases and launches.** The story behind each public release of each
   app: what changed, why, and what it still doesn't do. Not a copy of the
   changelog, and not a replacement for the website's release-notes email.
2. **Who your software works for.** How apps make money, what they send home,
   privacy in specifics rather than slogans, and software that doesn't demand
   attention. These essays should hold for email as much as for browsers.
3. **How we build.** Design decisions and honest tradeoffs, including the ones
   that cost us something.
4. **Notes.** Tips for both apps, questions for readers, short takes from the
   essays.

### Rhythm

| What | How often |
| --- | --- |
| Release post | A few days after each public release |
| Essay | About every two weeks |
| Notes | About three a week |

## How a piece goes out

1. Claude proposes the topic and writes the draft in this folder, with a fact
   check of every claim (see Guardrails).
2. The owner tweaks and approves the exact text.
3. Claude makes the header image, enters the post in Substack as a draft,
   and publishes or schedules it only after the owner's yes for that post.
4. The published URL goes into the
   [content ledger](../content-ledger.md), and the draft file is marked
   published.

Header images are made after the text is approved, so art isn't redrawn for
copy that changes. Substack takes a 5:2 header; earlier art is in
[`../../article-assets/`](../../article-assets/).

## Guardrails

- **Facts come from the current public release.** Follow
  [`docs/marketing-claims.md`](../../../docs/marketing-claims.md): every
  claim about Blanc Browser is checked against the public release tag (v1.32.0
  as of this plan) and keeps its limits. Claims about other companies need a
  current first-party source.
- **Blanc Mail has not launched.** Until it ships, Mail copy uses only claims
  already checked in
  [`docs/website-mail-claims-2026-10-12.md`](../../../docs/website-mail-claims-2026-10-12.md),
  says plainly that Mail is coming soon, and follows Mail's own launch gates.
  Never call Blanc Mail open source; only Blanc Browser is.
- **1Password fill on Windows and Linux stays unannounced.**
- **Name the feature first.** Say what it is and what it does, then why it
  matters, then its limits. Assume the reader is new to Blanc.
- **The studio, not a person.** Attribute to Bananify; no personal names or
  home city.
- **No Launch Week channels.** Substack is an ongoing channel; this plan
  doesn't revive Show HN or re-run Product Hunt or Reddit.
- **Links carry a `?ref=`** of the form `substack-<piece>`, for example
  `?ref=substack-v132`, so website visits can be traced back to a post.

## Measures

Read monthly, not daily: subscriber count (excluding our own account),
profile followers, website visits and download clicks carrying a
`substack-` ref, and Mail waitlist sign-ups once Mail posts begin. At four
subscribers, single posts prove little; look for a trend over the month.

## First month

| # | Piece | Type | Target | File | Status |
| --- | --- | --- | --- | --- | --- |
| 0 | Profile and publication refresh | Profile | This week | [`profile-2026-10-13.md`](profile-2026-10-13.md) | Draft for review |
| 1 | Leaving Arc? Bring your Spaces with you. (v1.32) | Release | This week | [`v1.32-release-post.md`](v1.32-release-post.md) | Draft for review |
| 2 | Week-one Notes | Notes | This week | [`notes-week-1.md`](notes-week-1.md) | Draft for review |
| 3 | Your software's business model is part of the software | Essay | Week of Oct 19 | Refresh of [`../substack-article-business-model-draft-2026-08-30.md`](../substack-article-business-model-draft-2026-08-30.md) | To write |
| 4 | v1.33 release post (Italian) | Release | After v1.33.0 ships | — | Waits for the release |
| 5 | Why we're making an email app | Mail, pre-launch | Before the Mail launch | — | Timing set by the owner |
| 6 | Two apps, two answers: why the browser stays on Electron and Mail is native | Essay | Week of Nov 2 | — | To write |
| 7 | Blanc Mail launch post | Mail launch | Launch day | — | Waits for the launch |

### Backlog

- Blanc sends a usage ping. Here's exactly what it says. (Browser first; add
  Mail once it ships.)
- How we measured browser memory without fooling ourselves (the pinned
  benchmark, with both of its qualifications).
- Why Blanc Browser went open source.
- Private tabs and being anonymous are different promises.
- Blocking shouldn't start with installing a stranger.
