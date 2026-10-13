# Blanc Mail page claims — October 12, 2026

Claims added to `site/src/pages/mail.astro` when the retired postelmail.com
site's still-true messaging moved to the Mail page. Blanc Mail has not
launched, so every line describes the app as built on the Blanc Mail
repository's `main` (bnfy/Postel), not a public release. Before this page
deploys, recheck each line against the signed Mail build and record the result
in that repository's release acceptance ledger
(`docs/BLANC_MAIL_CLAIMS_REVIEW.md`), and the owner approves the exact page
(`docs/BLANC_MAIL_REBRAND_GATES.md`). Paths below are in the Blanc Mail
repository.

| Wording on the page | Evidence | Limits kept in the copy | Verdict |
| --- | --- | --- | --- |
| Up to five Gmail accounts in one unified inbox, each with its own color. | `EverythingMailCore/Models/MailScope.swift` (`case unified`); `MailStore.maximumConnectedAccounts = 5`; account tint dot in `InboxView` (`MailAccountPalette`) | The five-account cap is stated | Verified |
| One search covers all of them. | `AGENTS.md`, Island section: search covers all mail of the visible accounts | Covers the visible accounts, the same ones the unified inbox shows | Qualified |
| Archiving takes effect at once, with five seconds to undo it. | `MailStore` undo window (5 s); `MailAccountSession` optimistic archive | Archive only, not every action | Verified |
| Snooze a conversation until you need it, or write now and send later. Scheduled mail goes out the next time Blanc Mail is running and online on your Mac. | `MailScheduling.swift`; Scheduled mailbox and Send Now / Edit Schedule in `InboxView` | Scheduling is local: the running-and-online limit is in the copy | Qualified |
| Save templates for the answers you give again and again; they stay on your Mac. | `MailTemplates.swift` (local store) | — | Verified |
| Gmail's vacation responder is in Settings too. | `AutoReplySettingsPane.swift` | — | Verified |
| Hide a conversation or a whole Gmail label from view, then unlock it with Touch ID or your password. It locks again on a timer. Ghost Mode keeps things off your screen; it isn't encryption. | `GhostMode.swift`; `GhostModeSettingsPane.swift`; `LAContext` unlock | Not encryption, stated. "No trace on screen" from the old site is not carried over: counts are hidden only best-effort | Qualified |
| Move a draft to another account without losing a word. | `MailComposeState.swift` (`MailDraftRehomePhase`) | — | Verified |
| If anything interrupts you, your draft picks up right where you left off. | `ROBUSTNESS_SPEC.md` claims inventory (EM-303 / EM-805): local recovery staged before the debounced Gmail save; recovery and relaunch tests in `MailStoreTests` | — | Verified |
| Messages are sanitized before they're shown, and scripts in them never run. | `SafeHTMLMessageView.swift` (`allowsContentJavaScript = false`); `MailHTMLSanitizerTests` (ADR-005) | — | Verified |
| Malformed mail still renders rather than leaving a blank pane. | EM-912 hostility corpus in `MailRenderingFixtureTests`; `MailBodyPresenter` | — | Verified |
| If a send fails and Gmail's answer is unclear, Blanc Mail never retries it on its own. | EM-307: `GmailAPIClient` retries only `GET` requests | — | Verified |
| Blanc Mail adds no read receipts and no open or click tracking to the mail you send. | EM-902: no `Disposition-Notification-To` in production sources | Behaviour verified; the automated assertion is still pending EM-902 | Qualified |
| Section heading: "Careful in what it sends, generous in what it accepts." | Settings groups "What Blanc sends" / "What Blanc accepts"; `AGENTS.md` robustness principle | Framing for the three tiles beneath it, not a separate claim | Verified |

## Not carried over from postelmail.com

- **"Remote content blocked by default", "nothing watches you", "senders can't see when you read":** no longer true. Remote content loads automatically on a fresh install (EM-900); the page's existing tile already says it can be turned off. `BLANC_MAIL_CLAIMS_REVIEW.md` forbids "blocked by default".
- **"Unlimited Gmail accounts":** no longer true; the cap is five.
- **"If it isn't the best mail app on your Mac, delete it":** unqualified superiority, which `docs/marketing-claims.md` bans.
- **Needs checking before it can appear:** "No content scanning, no 'smart' features trained on your correspondence" (true by inspection, but absolute); licence covers "every Mac you use" (production Polar settings pending); Google Workspace support; "your first account syncs in about a minute"; a published SHA-256 for each download; support reply times; the Outlook, Spark and Shortwave storage comparison (needs current first-party sources).
- **Postel-only:** the Postel name and Jon Postel story, Paddle pricing and trial, newsletter and launch-email signup, and postelmail.com links.

## Redesign: screenshots and new copy (October 12, 2026; owner approval pending)

**Layout only.** The redesign (spec
`docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md`) moved every
sentence above without rewording it. The rows below are new.

**Where the screenshots come from.** Every screenshot was captured in demo
mode with the Mail repository's `native/scripts/capture-public-shots.sh`, from
a signed Debug build of Mail at `e9e01780`, merged to `main` as `edb50879`
(bnfy/blanc-mail#128; `main` differs from it only in two docs files). Each
carries a "Preview build" caption. Text inside a screenshot is a claim, so each is listed too.
Their 1100px copies are display images built by
`site/scripts/build-display-images.mjs` (`test/unit/site-mail-screens.test.js`).

| Wording or image | Evidence | Limits kept | Verdict |
| --- | --- | --- | --- |
| Hero: the main window (scene `main`), with *Northlight Journal*, a fictional photo newsletter, open in the reader | Signed demo build at `e9e01780`; demo corpus only; every sender, link and rule uses a reserved `.example` domain (`InMemoryMailProviderTests`) | Labelled "Preview build". The photos are inline images bundled with the demo, cropped from the app's Inbox Zero art. A real newsletter's remote images load by default and can be turned off in Settings › Privacy | Verified as captured |
| "Every account together": the Island searching "trip" (scene `island`) | Same build; the Island search lists mailboxes, conversations and "Search all mail" | Shows one demo account. It does not depict the five-account claim, which still rests on the copy row above | Qualified |
| "An empty inbox, kept that way." | Section heading over Inbox Zero and Rules | Framing, not a separate claim | Verified |
| When your inbox is empty, Blanc Mail clears the list and reader for a quiet Sunrise view and one line: "Nothing here needs you right now." | `MailInboxZero.swift:32-39`, `MailRootView.swift:799-810`, `MailInboxZeroView.swift:47-51`; `MailInboxZeroTests` | Inbox only: not categories, searches or other mailboxes. The sidebar stays | Verified |
| Small chips show when your next snoozed conversation returns and when a set you put aside is due, and one click opens it. | `MailInboxZeroView.swift:78-107`, `MailInboxZero.swift:58-74`, `MailStore.swift:4460-4464` | At most one of each; no chips when nothing is scheduled | Verified |
| Turn on "Change wallpapers with the time of day" in Settings › Appearance and the art follows your Mac's clock, from dawn to night. | `SunriseWallpaper.swift:11-23`, `MailPreferences.swift:157-159`, `AppearanceSettingsPane.swift` | Off by default (still Sunrise art); four phases; the clock, not Dark Mode | Verified |
| Inbox Zero images, dawn and night (scenes `zero`, `zero-night`) | Signed-in capture fixture; checklist 6.3–6.6 passed | The night image shows the time-of-day art, which the note explains | Verified as captured |
| Rules that read like sentences: Your Gmail filters, written out in plain words. | `MailRules.swift:3`, `MailRuleSentenceText.swift` | Gmail filters only, no local rules; needs a connected Gmail account | Verified |
| Rules run in Gmail, so new mail keeps getting sorted even while Blanc Mail is closed, and rules you made in Gmail on the web appear too. | `RulesSettingsPane.swift:7-8, 33, 41`; `GmailFilterService.swift` | New mail only; existing mail only by opt-in. EM-960 live checks are still partial (`RELEASE_ACCEPTANCE.md:76`) | Qualified: recheck live before deploy |
| Rules image (scene `rules`) | Signed-in capture fixture | Match counts are Gmail's estimate, shown on request | Qualified, as above |
| "At home in light and dark." with the light and dark main window (scenes `main`, `dark`) | Same build in each appearance | Captured a minute apart, so one timestamp differs | Verified |

**Deployed.** October 13, 2026: Cloudflare Pages deployment `6cc566ad`
(Production, branch `main`) from `main` at `eca684d9` (#753), served at
https://blanc.day/mail. Deployed on the owner's instruction ("merge 753 when
green, then deploy main"), with the items below still open. They are recorded
as open, not passed.

**Still open after deploy.**

- Recapture every image from the signed release candidate.
- The Rules lines depend on EM-960's live checks (Mail `docs/RELEASE_ACCEPTANCE.md:76`).
- The deploy follows Task 8 of `docs/superpowers/plans/2026-10-12-mail-pages-redesign.md`.

**Shorter hero (owner, October 13, 2026).** The `/mail` hero drops the
"Coming soon for macOS" pill and its lead's second sentence, "Your mail stays
between your Mac and Google." No sentence is reworded. The waitlist's label,
"Get an email when Blanc Mail is ready", stays visible as the hero's status
line, so the page still says Blanc Mail is unreleased (`docs/marketing-claims.md`).
The privacy note under the field appears while an address is typed and is the
field's accessible description either way.

**Tagline.** "A little less inbox." replaces "Email that minds its own business."
in the `/mail` hero, the page title and `public/mail-og.png`. The owner chose
it on October 12, 2026; it pairs with Blanc Browser's "A little less browser."
It is branding, not a product claim. `site/scripts/render-mail-og-card.mjs`
regenerates the share card, which reads “A little less inbox.” over “blanc.day/mail”.
