# r/blancbrowser setup — owner review

Status: drafts only, written October 17, 2026. Nothing has been posted or
changed on Reddit. Every step on Reddit is the owner's: Claude's browser tools
can't open reddit.com. Approve the exact text below before any of it goes up.
Capability baseline: public v1.36.0 (`docs/marketing-claims.md`).

## What the community is for

Most feature requests and engagement from real Blanc users already come from
Reddit, spread across other people's threads. r/blancbrowser, reserved by the
owner months ago, becomes their home base: help, feature requests, bug reports
and release notes in one place, run from the owner's own account.

## Settings checklist

Mod Tools → General settings unless noted.

- **Community type:** Public. If the reserved community is still private or
  restricted, switch it once the text below is in.
- **Mature (18+):** off.
- **Post types:** text, images and links on.
- **Post flair:** turn on **Require post flair** after adding the flairs below.
- **Icon:** the Sunrise app icon, `assets/sunrise-app-icon.png`.
- **Banner:** leave empty for now. A banner is new creative and needs its own
  approval.
- **Moderator:** the owner's personal account, the one that already posts as
  Blanc's developer.

## Title and description

**Title:**

> Blanc Browser

**Description** (Reddit allows 500 characters; this is 233):

> The community for Blanc, a free, open-source desktop browser for macOS,
> Windows and Linux with built-in ad and tracker blocking. Ask for help,
> request features, report bugs and hear about new releases. Moderated by
> Blanc's developer.

## Sidebar

Paste into a text widget (Mod Tools → Community appearance → Sidebar widgets),
or into the old Reddit sidebar.

> **Blanc** is a free, open-source desktop browser for macOS, Windows and
> Linux.
>
> **The Island replaces the tab strip and toolbar.** It's one compact bar
> above the page. Open it with a click, or with ⌘L on a Mac (Ctrl+L on Windows
> and Linux), to switch tabs, search and run commands.
>
> **Ad and tracker blocking is built in and on by default**, using the
> EasyList and EasyPrivacy filter lists. You can also choose the full uBlock
> Origin instead on Apple Silicon and Intel Macs, Windows x64 and Linux x64.
>
> - [Download Blanc](https://blanc.day/download)
> - [What's new](https://blanc.day/changelog)
> - [Feature roadmap](https://blanc.day/roadmap)
> - [Support](https://blanc.day/support)
> - [Source code](https://github.com/bnfy/blanc)
>
> **Found a security problem?** Don't post it here. Email
> support@blanc.day with **Security** in the subject.

## Rules

Mod Tools → Rules. Each rule has a title (100 characters at most), a
description (500 at most) and a report reason (100 at most).

1. **Keep it about Blanc**
   - Description: Posts should be about using, fixing or improving Blanc.
     Talk about other browsers is welcome when it's about Blanc too.
   - Report reason: Not about Blanc

2. **Be kind**
   - Description: Disagree with ideas, not people. No harassment, slurs or
     personal attacks.
   - Report reason: Unkind or abusive

3. **Give details in bug reports**
   - Description: Say which Blanc version you're on (Blanc → About Blanc on a
     Mac, Help → About Blanc on Windows and Linux), your operating system, and
     what you expected to happen. If it happens on a particular site, include
     the page address.
   - Report reason: Bug report without details

4. **Report security problems privately**
   - Description: Don't post a security problem that hasn't been fixed yet.
     Email support@blanc.day with Security in the subject instead, so it can be
     fixed before anyone can misuse it.
   - Report reason: Public report of an unfixed security problem

5. **Keep private things private**
   - Description: Never post passwords, your Sync passphrase or recovery code,
     or anyone's personal information, including in screenshots.
   - Report reason: Shares private information

6. **No spam, referral links or unofficial downloads**
   - Description: No ads, referral or affiliate links, or unrelated
     self-promotion. Only link to Blanc downloads on blanc.day or Blanc's
     GitHub releases.
   - Report reason: Spam or unofficial download

## Post flairs

Mod Tools → Post flair. Reddit allows 64 characters each.

| Flair | Who can use it |
|---|---|
| Feature request | everyone |
| Bug | everyone |
| Help | everyone |
| Show your setup | everyone |
| Release | moderators only |

## AutoModerator

Mod Tools → Automations → AutoModerator (on old Reddit, the wiki page
`config/automoderator`). Paste the whole block.

```yaml
---
# Bug posts: ask for the details needed to track the problem down.
type: submission
flair_text: "Bug"
comment: |
    Thanks for reporting this. To help track it down, please add:

    - your Blanc version (**Blanc → About Blanc** on a Mac, **Help → About Blanc** on Windows and Linux)
    - your operating system and its version
    - the page address, if it happens on a particular site
    - what you expected, and what happened instead

    Found a security problem? Please don't post it here. Email support@blanc.day with **Security** in the subject.
comment_stickied: true
---
# Posts that may report a security problem wait for a moderator.
type: submission
title+body (includes): ["vulnerability", "exploit", "CVE-", "security hole", "security bug"]
action: filter
action_reason: "Possible security report: check before approving"
---
# Comments that may report a security problem wait for a moderator.
type: comment
body (includes): ["vulnerability", "exploit", "CVE-", "security hole", "security bug"]
action: filter
action_reason: "Possible security report: check before approving"
---
# Posts linking a download that isn't from blanc.day or Blanc's GitHub wait for a moderator.
type: submission
url+body (includes, regex): ['https?://\S+\.(dmg|exe|msi|appimage)\b']
~url+body (includes): ["blanc.day/", "github.com/bnfy/blanc/"]
action: filter
action_reason: "Download link not from blanc.day or GitHub"
---
# Comments linking a download that isn't from blanc.day or Blanc's GitHub wait for a moderator.
type: comment
body (includes, regex): ['https?://\S+\.(dmg|exe|msi|appimage)\b']
~body (includes): ["blanc.day/", "github.com/bnfy/blanc/"]
action: filter
action_reason: "Download link not from blanc.day or GitHub"
---
```

Filtered posts and comments wait in Mod Queue until you approve or remove
them. A post or comment with both an official and an unofficial download link
isn't held, because the official link exempts it.

## Pinned welcome post

Flair: Release. Post it, then choose **Pin post** (or **Sticky**).

**Title:**

> Welcome to r/blancbrowser

**Body:**

> Hi, I'm the developer of Blanc, and this is its official community.
>
> Blanc is a free, open-source desktop browser for macOS, Windows and Linux.
> Instead of a row of tabs and a toolbar, it gives you the Island: one compact
> bar above the page. Open it with a click, or with ⌘L on a Mac (Ctrl+L on
> Windows and Linux), to switch tabs, search and run commands. Ad and tracker
> blocking is built in and on by default.
>
> Most of the feature requests I get come from Reddit, and some of them are
> now in Blanc. Kagi and your own search address in Settings, added in 1.34,
> started as a request in a Reddit thread. This is the place for the next ones.
>
> **What to post here**
>
> - **Feature requests:** say what you'd like Blanc to do and why. Check the
>   [Feature roadmap](https://blanc.day/roadmap) first; it may already be
>   planned.
> - **Bugs:** include your Blanc version (Blanc → About Blanc on a Mac,
>   Help → About Blanc on Windows and Linux), your operating system, and the
>   page address if it happens on a particular site.
> - **Help:** questions about setting Blanc up or getting something to work.
> - **Show your setup:** your Start Page, groups, Spaces or anything else.
>
> I'll post the notes for every new version here, and I read everything.
>
> **Before you ask:** Blanc doesn't install Chrome Web Store extensions. That's
> a deliberate decision, not a missing feature. Blocking is built in, and on
> Apple Silicon and Intel Macs, Windows x64 and Linux x64 you can switch to the
> full uBlock Origin: click the shield in the Island, choose it, and restart
> Blanc.
>
> **Please keep two things off this subreddit:** security problems (email
> support@blanc.day with Security in the subject), and passwords, Sync
> passphrases or recovery codes, even in screenshots.
>
> [Download Blanc](https://blanc.day/download) ·
> [What's new](https://blanc.day/changelog) ·
> [Source code](https://github.com/bnfy/blanc)

## First post: Blanc 1.36.0

Flair: Release.

**Title:**

> Blanc 1.36.0: bangs, adding a device to Sync with a code, and a tidier ⌘L panel

**Body:**

> Blanc 1.36.0 is out. On a Mac or Windows PC, Blanc offers the update itself:
> choose **Restart Now**. You can also download it from
> [blanc.day](https://blanc.day/download).
>
> **Bangs.** In the ⌘L or Ctrl+L panel, type an exclamation mark and a site's
> code before your search, like `!yt lofi`, and Blanc opens that site's
> results directly, whichever search engine you use. A code on its own, like
> `!yt`, opens the site. Type `!` alone to see the bangs you used recently and
> popular ones. The list is Kagi's open bang list, more than 10,000 bangs. It
> ships inside Blanc, so Blanc never looks bangs up online. Add your own, or
> turn bangs off, in Settings → General. [Browse the bangs](https://blanc.day/bangs).
>
> **Add a device to Sync with a code.** On a device that already syncs, go to
> Settings → Sync and choose **Add another device**. It shows a code that works
> for ten minutes. On the new device, choose **Add this device to my sync** and
> enter the code. Your sync name and passphrase still work too.
>
> **Name your devices.** Right-click a device under **Other devices** in the
> ⌘L panel and choose **Rename Device…**, so you can tell your computers
> apart.
>
> **Invite a Friend.** **Help → Invite a Friend…**, or `/invite` in the ⌘L
> panel, opens a new email in your mail app with a short invite and a link to
> download Blanc. You choose who it goes to and send it yourself; Blanc sends
> nothing. On Linux it needs a mail app set up for now. Without one, nothing
> happens; a fix is on the way.
>
> **A tidier ⌘L panel.** Recently closed tabs sit in a band you can unfold
> and drag among your groups. Tabs from your other devices moved into an
> **Other devices** drawer, and the footer is one line.
>
> **Group names keep the capitals you type**, and right-clicking a group's
> header lets you rename, ungroup or close it.
>
> **Fixed:** open tabs could stop syncing to your other devices while one
> tab's title kept changing, such as a timer or an unread count.
>
> [Full release notes](https://blanc.day/changelog#v1-36-0)

## Newsletter line

For the next release-notes email:

> Blanc now has its own community on Reddit, r/blancbrowser. Ask questions,
> request features and read the notes for each new version there:
> https://www.reddit.com/r/blancbrowser/

## Website link

A separate website-only PR adds Reddit to the footer's **Follow Blanc** row
and to the homepage's structured data. Merge it only after r/blancbrowser is
public, so the link never leads to a private community.

## Claims check

Every falsifiable claim in the text above, checked against public v1.36.0.

| Claim | About | Evidence | Qualification | Verdict |
|---|---|---|---|---|
| Free | Blanc | `site/src/pages/download.astro` ("Every feature is free"); Patron unlocks nothing | — | verified |
| Open source | Blanc | `LICENSE` (MIT); CLAUDE.md open-source baseline | Third-party parts keep their own terms; never say the whole repository is MIT | verified |
| Desktop browser for macOS, Windows and Linux | Blanc | v1.36.0 release assets; download page | — | verified |
| The Island replaces the tab strip and toolbar; one compact bar above the page | Blanc | `docs/marketing-claims.md` → Island | Says "above the page", not that it floats over the page | verified |
| ⌘L / Ctrl+L opens it to switch tabs, search and run commands | Blanc | `docs/marketing-claims.md` → Island, Quick Switcher | — | verified |
| Ad and tracker blocking built in and on by default, using EasyList and EasyPrivacy | Blanc | `src/main/adblock.js`; `adblock/sources/` | — | verified |
| Full uBlock Origin on Apple Silicon and Intel Macs, Windows x64, Linux x64; choose it from the Island shield and restart | Blanc | `docs/marketing-claims.md` → Optional uBlock Origin | Not Rosetta; not a general extension store | verified |
| Blanc doesn't install Chrome Web Store extensions; deliberate | Blanc | CLAUDE.md platform direction (Oct 5, 2026) | — | verified |
| Kagi and your own search address, added in 1.34, started as a Reddit request | Blanc | #815 shipped in v1.34.0, from a Reddit request | — | verified |
| Security reports go to support@blanc.day with Security in the subject | Blanc | `SECURITY.md` | — | verified |
| Version is under Blanc → About Blanc (Mac), Help → About Blanc (Windows, Linux) | Blanc | `src/main/main.js` menus; `menu.app.about` | — | verified |
| On a Mac or Windows PC, Blanc offers the update itself; choose Restart Now | Blanc | `src/main/updater.js` at v1.36.0; `update.ready.restart`; v1.35.0 → v1.36.0 handoffs confirmed on macOS and Windows | Linux isn't claimed: no Linux updater handoff is recorded | verified |
| Bangs: `!yt lofi`, a code alone opens the site, `!` lists recent and popular, more than 10,000, bundled, no online lookup, add your own or turn off in Settings → General | Blanc | v1.36.0 release notes; `docs/marketing-claims.md` → Bangs | Never claim a bang avoids every search engine; never imply Kagi endorses Blanc. The post claims neither | verified |
| Add a device to Sync with a code that works for ten minutes; name and passphrase still work | Blanc | v1.36.0 release notes | — | verified |
| Rename Device… under Other devices | Blanc | v1.36.0 release notes | Names show only on devices running 1.36.0 | verified |
| Invite a Friend opens a new email; Blanc sends nothing | Blanc | v1.36.0 release notes; `docs/marketing-claims.md` → Invite a Friend | On Linux without a mail app nothing happens; the copy fallback isn't claimed | qualified |
| "A fix is on the way" for Linux Invite | Blanc | #903 merged October 17, 2026; not in a release | Future work, worded as such | aspirational, labeled |
| Recently closed band, Other devices drawer, one-line footer | Blanc | v1.36.0 release notes | — | verified |
| Group names keep capitals; header menu renames, ungroups, closes | Blanc | v1.36.0 release notes | — | verified |
| Fixed: tab sync stalling behind a changing tab title | Blanc | v1.36.0 release notes | — | verified |

## Calls I made

These are Claude's choices, not the owner's. Check them while reading.

- Six rules rather than five: "Keep private things private" is its own rule
  because Sync recovery codes and passphrases are easy to leak in a
  screenshot.
- The **Release** flair is for moderators only, so release posts stay
  official.
- Two AutoModerator filters hold possible security reports and unofficial
  download links for a moderator to approve, rather than removing them.
- Links are plain `blanc.day` addresses with no `?ref=` tag. Reddit's referrer
  already shows up in analytics, as in the launch plan.
- No banner yet, because it would be new creative.
- The welcome post says "I'm the developer of Blanc" and doesn't use the
  owner's name, in line with keeping personal details out of marketing copy.
