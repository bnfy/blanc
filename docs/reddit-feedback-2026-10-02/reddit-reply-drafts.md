# Reddit reply drafts — owner review required

Status: drafts only. No replies posted, scheduled or sent. Review the exact
final text and relevant live site before approving. Posting requires a separate
explicit instruction. Capability baseline: public v1.26.0; no future website or
onboarding change is described as already deployed.

## Tab discovery

Target: [dot-discovery feedback](https://www.reddit.com/r/browsers/comments/1wv7o41/comment/pdaiiyp/).

> That was useful feedback: the opening demo didn’t make the dots clear. In
> Blanc, hovering a dot reveals its favicon and title. Click it, or focus it
> and press Enter, to bring that tab forward. When +N appears, it opens the full tab
> list. Cmd+L on Mac or Ctrl+L on Windows/Linux also lets you find a tab by name.
> We’re preparing a clearer demo and setup explanation of those steps.

## Trust, AI and independent audit

Target: [trust questions](https://www.reddit.com/r/browsers/comments/1wv7o41/comment/pdbor32/).

> Blanc uses official, unmodified Electron. AI assists implementation and
> security review; I remain accountable for decisions and release approval.
> No independent external security audit has been completed. I’m preparing a
> scope and funding proposal, without promising a date.
>
> Public v1.26.0 has a signed/notarized Mac app, a timestamped Authenticode
> Windows installer and a Sigstore-authenticated checksum manifest for the
> AppImage and other artifacts. These authenticate the publisher and bytes;
> they don’t replace an independent security audit. The
> [release record](https://github.com/bnfy/blanc/blob/8e48359fae44865857a5bd3a8a955af96af71650/docs/release-incidents/2026-10-02-v1.26.0.md)
> states the checks and owner waivers. Sync v1’s locator authorization and
> concurrency limits remain open in the maintainer assessment.

## Missed ads

Target: [blocking feedback](https://www.reddit.com/r/browsers/comments/1wv7o41/comment/pda3f95/).

> Could you share the specific page URL, Blanc version, operating system,
> whether blocking is enabled globally and for that site, and where the ad
> appears? A screenshot is optional. If the example contains private
> information, email support@blancbrowser.com instead. I’ll use the example
> to distinguish a filter gap, integration bug or unsupported ad format, and
> record reproduction and verification evidence before closing it.

After the website PR merges, the issue-form link can be added to this draft:
https://github.com/bnfy/blanc/issues/new?template=ad_blocking.yml.

## Optional Patron clarification

Target: [subscription confusion](https://www.reddit.com/r/browsers/comments/1wv7o41/comment/pdem7ks/).

> Browsing essentials and ordinary tab groups are free. Blanc Patron is the
> optional subscription, US$30/year or US$4/month plus applicable tax. It adds
> creation of saved Named Workspaces. If it lapses, existing workspaces remain
> openable, switchable, automatically updated, renameable and removable;
> earlier one-time supporters retain lifetime access.
