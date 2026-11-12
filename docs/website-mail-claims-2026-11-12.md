# Blanc Mail page claims — November 12, 2026

Lines added to `site/src/pages/mail.astro`, `site/src/pages/mail/survey.astro`,
`site/src/components/MailSurveyForm.astro` and
`site/src/components/MailWaitlistForm.astro` for the Proton announcement and
the anonymous feature survey
(`docs/superpowers/specs/2026-11-12-mail-feature-survey-design.md`). Blanc Mail
has not launched, so every product line describes the app as built on the
Blanc Mail repository's `main` (bnfy/blanc-mail), not a public release, in the
page's existing coming-soon framing. The owner approved the exact Proton
wording on November 12, 2026. Paths below are in the Blanc Mail repository.
Before this page deploys, recheck each Proton line against the signed Mail
build, as the October 12 ledger requires for its lines.

## Proton announcement

| Wording on the page | Evidence | Limits kept in the copy | Verdict |
| --- | --- | --- | --- |
| Gmail and Proton Mail | Tile title; Proton accounts merged in Proton P1–P5 and Sets (#144–#146, #150–#152, #156–#158, #160, #161; November 11–12, 2026) | Names the two providers 1.0 supports, nothing more | Qualified |
| Connect a Google account directly, or a Proton account through Proton Mail Bridge on your Mac. Mail is stored locally for reading and draft recovery. | `ProtonMailKit` connects over IMAP and SMTP to Proton Mail Bridge on the Mac (P0 #141); Google Sign-In for Gmail; recovery store for drafts (Proton drafts stay on the Mac by the owner's November 11 decision) | Bridge is named as the way in; no Proton feature list is promised. The owner's real-Bridge checklists are only partly run | Qualified |
| Blanc Mail is a native Gmail and Proton Mail app for macOS, coming soon from the makers of Blanc Browser. | As above; meta description | "Coming soon"; no date | Qualified |
| Blanc Mail brings a careful, native experience for Gmail and Proton Mail to your Mac. | As above | — | Qualified |
| Native app for Gmail and Proton Mail | Pricing card feature line; as above | — | Qualified |
| plus a Google account, or a Proton account with Proton Mail Bridge. | Requirements line; Proton needs Bridge running on the Mac (`ProtonMailKit`) | Bridge is required for Proton | Qualified |

Unchanged on purpose: "Up to five Gmail accounts in one unified inbox" and the
lines about Gmail filters, labels and the vacation responder, which describe
Gmail features.

## Survey (questions and labels, not product claims)

The survey describes no shipped capability: its options are phrased as wishes
and never say which features are built. Its lines are recorded here as labels.

| Wording | Where | Kind |
| --- | --- | --- |
| Help shape Blanc Mail: tell us what you’d want, anonymously. | `mail.astro`, below the first waitlist form, while the survey is open | Link |
| While you’re here, you can tell us what you’d want in Blanc Mail. | `MailWaitlistForm.astro`, shown after a successful sign-up while the survey is open | Invitation |
| Take the one-minute survey | Same | Link |
| Help shape Blanc Mail | `MailSurveyInvite.astro`, the corner card on `mail.astro` while the survey is open | Label |
| Which accounts would you use? | Same; its four chips (Gmail, Proton Mail, Both, Something else) open the survey with that answer preselected | Question |
| Suggest something else | `MailSurveyInvite.astro`; opens the survey at its free-text question | Link |
| What would you want? | `survey.astro` heading | Label |
| Blanc Mail isn’t released yet. Tell us what matters to you, anonymously; it takes about a minute. We keep only your answers and the day you sent them, and delete them once we’ve decided what goes into Blanc Mail 1.0. | `survey.astro` intro | Privacy statement; matches the privacy page's `#mail-survey` section and `cloudflare/mail-survey-worker` in this repository |
| This survey has closed. Thank you to everyone who answered. | `survey.astro` when closed; the form's 410 reply | Label |
| The four questions, their options and "Please don’t include personal details." | `MailSurveyForm.astro` | Questions; ids match `cloudflare/mail-survey-worker/src/survey.js` |
