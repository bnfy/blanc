# Blanc Mail pages without Proton Mail, November 24, 2026

The Mail pages stop naming Proton Mail as a supported provider. In the Mail
repository, Proton accounts exist only in owner-only Debug builds:
`native/scripts/release.sh` and `acceptance.sh` build with `--proton=off` and must
pass `verify-no-proton.sh`, so no customer build can contain Proton code, and
`AGENTS.md` keeps Proton off the roadmap until its market gate passes. The
November 12 and November 20 Proton lines are therefore withdrawn. The Mail
survey still asks which accounts people use, including Proton Mail: that is the
demand evidence the market gate asks for, not a claim of support.

| Wording | Source and qualification |
| --- | --- |
| “A mail app for Mac. Bring your Gmail account, or add a Blanc address of your own.” | Qualified preview, replacing the November 20 line that also named Proton Mail. Google Sign-In evidence in the November 12 record. |
| “Connect your Gmail account directly with Google Sign-In.” | Qualified preview. `native/MailMVP/Services/GoogleSignInAuthenticator.swift` in the Mail repo. |
| “Your Gmail account” / “Connect a Google account directly. Mail is stored locally for reading and draft recovery.” | App feature tile, replacing “Gmail and Proton Mail”. Local storage as in the November 12 record. |
| “You can keep your current address. Connect a Google account directly. You can also use a Blanc address on its own.” | Mail FAQ answer (also on Support), Proton clause removed. |
| “A Blanc address is optional. Blanc Mail for Mac also works with Gmail.” | Reservation page aside, Proton clause removed. |
| “A mail app for Mac, coming soon. Bring your Gmail account, or add a Blanc address of your own. Planned at $4.99 a month or $49.99 a year.” | Meta description. Prices from the website commerce catalog. |
