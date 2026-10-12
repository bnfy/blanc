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
| Up to five Gmail accounts in one unified inbox, each with its own colour. | `EverythingMailCore/Models/MailScope.swift` (`case unified`); `MailStore.maximumConnectedAccounts = 5`; account tint dot in `InboxView` (`MailAccountPalette`) | The five-account cap is stated | Verified |
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
