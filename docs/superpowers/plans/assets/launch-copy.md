# Blanc v1.15.0 launch copy pack

**Owner:** Anthony publishes and replies from his own accounts. Agents may
fact-check and prepare non-Hacker-News copy, but never post it.

**Freeze:** Re-check the morning-of checklist before publishing. Do not silently
update a single channel when a product fact changes; update the frozen facts and
every affected section together.

**Schedule reset — OWNER DECISION 2026-08-30:** Show HN is Tuesday,
September 8, Reddit is Wednesday, September 9, and Product Hunt is Thursday,
September 10. A bounded backlog-cleanup window now precedes the launch freeze.
This v1.15.0 pack is the current factual reference, not the final launch pack.
**OWNER DECISION 2026-08-31:** more releases are likely before launch week, so
do not refresh launch media for v1.15.0 unless it is selected as the final
launch release. Keep this pack non-publishable and
recapture the demo/gallery assets only after the final launch release is
selected and its required evidence is complete.

**Release lock — REBASELINED 2026-09-02:** This pack describes packaged public
v1.15.0, published from `d0c2304`. It carries the optional macOS 1Password
ambient login hint and Settings account verification while keeping credential
lookup and fill explicit. It also carries WebRTC receive-buffer controls,
Electron 44.1.1, device-local frequently visited Billboard sites, Inter across
every start-page template, Sunrise branding on all platforms, and four macOS
icon choices. The resting Island now uses the compact website-inspired
geometry and material treatment, includes a quiet one-click regular-tab
shortcut beside the slash keycap, and keeps its unified proximity response;
the vertical rail uses Inter. Mahjong now has eight layouts, a deterministic
Daily rotation across all eight, device-local records and streaks, unfinished-
game continuation across tabs, and undoable Shuffle. It resets every profile
once to Sunrise and Billboard, then preserves later user changes. The
authenticated public v1.15.0 Linux launch/render check passed. The adjacent
v1.11.1 -> v1.12.0 macOS in-app updater handoff passed,
including installed-version, strict signature, designated-requirement, and
Gatekeeper checks. The owner also confirmed that the adjacent Windows in-app
updater completed successfully; its exact-publisher/timestamp evidence remains
the tagged native release gate. The adjacent v1.12.0 -> v1.13.0 macOS and
Windows updater handoffs remain follow-ups. The owner confirmed that both
adjacent v1.13.0 -> v1.14.0 updater handoffs completed successfully. This
release's adjacent v1.14.0 -> v1.15.0 macOS updater handoff passed; the Windows
handoff remains required. It may still be superseded if another approved
release replaces it.
Do not publish this pack or use UI or claims from later work on `main`.

## Frozen facts

| Claim | Launch truth |
|---|---|
| Current public release | v1.15.0 |
| Platforms | macOS, Windows, Linux |
| Core price | Free |
| Blanc Patron | US$4/month or $30/year, plus applicable taxes |
| Patron boundary | Creating a Named Workspace requires active Patron. Renaming and removing an existing workspace continue after a lapse |
| Other Patron benefits | Named Workspaces on every platform |
| Source status | Open source under the MIT License (adopted 2026-08-30); modification, redistribution, and third-party builds are permitted. Publishing a build carries the bundled filter lists' CC BY-SA 3.0+ attribution/share-alike terms, and the Blanc name and logo stay reserved as trademarks |
| Telemetry | One packaged-build launch ping: random install ID, random session ID, version, platform, architecture, coarse OS major. Fresh profiles save the presented choice before a ping can send |
| Memory benchmark | One Mac, one session, three runs per browser, six ad-heavy news sites, median whole-process-tree `phys_footprint`: Blanc 1.3 GB; Brave 1.7 GB; Zen 3.2 GB; Chrome 5.6 GB; Vivaldi 5.9 GB. Blanc with blocking off: 4.2 GB |
| Release authentication | macOS signed and notarized; Windows timestamped Authenticode; checksum manifest Sigstore-signed; Windows and Linux CI artifacts have GitHub provenance attestations |
| macOS 1Password boundary | Optional and device-local. A small hint may use bounded structure-only metadata from a visible current-password field, without field values, page text, or a 1Password request. Settings can explicitly verify a saved account identifier. Credential lookup and fill remain user-invoked; Blanc does not fill automatically or store credentials. It is not an extension runtime |
| Repository/build boundary | The v1.15.0 tag is the exact source snapshot associated with the public binaries. Re-check `main` on launch morning before describing repository code as downloadable behavior |

Canonical URLs—copy exactly:

| Channel | URL |
|---|---|
| Show HN | https://github.com/bnfy/blanc |
| Reddit | https://blancbrowser.com |
| Product Hunt | https://blancbrowser.com/?ref=ph |
| AlternativeTo | https://blancbrowser.com |
| BetaList | https://blancbrowser.com/?ref=betalist |

Historical packaged-v1.10.0 demo assets (not launch-ready):

| Form | URL |
|---|---|
| MP4 | https://raw.githubusercontent.com/bnfy/blanc/0cc0c57b31c4b619aa18fe6fa1713002e2060b7d/docs/superpowers/plans/assets/island-demo.mp4 |
| GIF | https://raw.githubusercontent.com/bnfy/blanc/0cc0c57b31c4b619aa18fe6fa1713002e2060b7d/docs/superpowers/plans/assets/island-demo.gif |

These files were captured on August 30 from the installed packaged public
v1.10.0 app in an isolated local profile. Do not recapture them for v1.15.0
unless it is selected as the final launch release;
wait until the final launch release is selected, then recapture from that exact
packaged version. The 20.50-second historical export is 1228×768,
30 fps H.264, and BT.709; the GIF is below 8 MiB. It shows the resting Island,
`⌘L` expansion, a live `git` Quick Switcher filter, a tab-dot switch, The
Verge's live 13-item blocker count and popover, and the final resting hold. The
MP4 is the source for the required public or unlisted YouTube upload before
Product Hunt. A raw MP4 URL does not satisfy Product Hunt's gallery-video
field.

## Show HN — owner writes every public word

Do **not** paste AI-generated or AI-edited copy into Hacker News. The HN
moderator's current presentation guidance explicitly asks makers to write their
own text by hand. This section is a verified fact worksheet, not public prose.

Rules to re-open immediately before posting:

- https://news.ycombinator.com/showhn.html
- https://news.ycombinator.com/newsfaq.html
- https://news.ycombinator.com/item?id=22336638
- https://news.ycombinator.com/showlim

Submission mechanics:

1. Confirm the owner's existing personal HN account is currently allowed to
   submit a Show HN. Do not create a launch-only account or manufacture activity.
2. Write the title and first comment personally, without agent drafting or
   editing. The title must begin `Show HN` and describe the whole browser—not
   announce the incremental v1.15.0 release.
3. Submit `https://github.com/bnfy/blanc`, not the marketing homepage. The repo
   lets readers inspect and run the product; HN says not to submit landing pages
   or fundraisers.
4. A URL submission cannot also carry privileged body text. Submit the link,
   then add the personally written context as a regular first comment.
5. Do not ask anyone to upvote or comment. Stay available to answer questions.

### First-comment worksheet

Write these ideas in Anthony's natural words:

- What Blanc is: a desktop browser whose tab strip and toolbar become one
  floating control surface, the Island.
- Personal origin: why Anthony spent roughly a year making it and which browser
  behavior he wanted to change.
- Decision one: blocking runs at the browser session's network layer, not
  through an extension or `declarativeNetRequest`.
- Decision two: Blanc deliberately has no extension runtime. The removed one
  caused native crashes, required unsandboxed browser chrome, and introduced a
  licensing constraint.
- The honest limitation: Electron. Point to the measured method and raw data;
  do not turn a single-session benchmark into a universal claim.
- What it is not: no mobile version; no extension support.
- Narrow exception to the extension boundary: packaged macOS v1.15.0 may show
  a small local hint for a visible current-password field and can verify a
  saved account identifier in Settings. A matching Login item is requested
  from the installed 1Password app only when the user asks to fill; it is not
  automatic fill, an extension runtime, or a Blanc-owned credential store.
- Money, unprompted: the browser is free. Patron is $4/month or $30/year.
  Creating a Named Workspace requires active Patron; existing workspaces remain
  renameable and removable after a lapse.
- Invite questions, including skeptical ones.
- Useful links: repository, releases, https://blancbrowser.com/faq, and
  https://blancbrowser.com.

### HN response fact cards

These are facts to answer from, not sentences to paste.

**Electron and memory**

- One Mac and one same-session benchmark; six ad-heavy news sites; fresh
  extension-free profiles; three repetitions; median reported.
- Whole-process-tree `phys_footprint`, not summed RSS.
- Blanc 1.3 GB; Brave 1.7 GB; Chrome 5.6 GB.
- With Blanc blocking disabled, the same pages used 4.2 GB.
- Brave is the fairest default-to-default peer because it also blocks by
  default.
- Method and raw run: `bench/memory/`.

**Source and published binaries**

- Whole application source is readable in the submitted repository.
- `npm install && npm start` runs the checked-out source.
- A local build demonstrates that source; it does not prove a published binary
  is byte-for-byte identical.
- MIT License: modification, redistribution, and third-party builds are granted.
- Publishing a build still carries the filter lists' CC BY-SA 3.0+ terms, and the
  Blanc name and logo are reserved trademarks.
- GitHub's terms permit an in-service fork of a public repository.
- Signing, notarization, checksums, Sigstore, and CI provenance authenticate the
  release records; they do not make the build reproducible.

**Telemetry**

- Packaged builds only; one launch ping; opt-out.
- Six fields: install ID, session ID, version, platform, architecture, coarse OS
  major.
- No URLs, searches, history, or page content.
- A fresh profile saves the presented choice before any ping can send.
- The Worker HMACs the install ID before storage.

**Patron**

- $4/month or $30/year, plus applicable taxes.
- Core browsing remains free: blocking, encrypted sync, private tabs, groups,
  quiet tabs, and passkeys.
- Patron adds Named Workspaces on every platform.
- Only workspace creation requires an active subscription; rename and removal
  continue after a lapse.
- Earlier one-time founding supporters keep their benefits permanently.

**No extensions**

- Deliberate product boundary, not a missing roadmap item.
- A previously shipped extension runtime was removed after native crashes,
  unsandboxed-chrome requirements, and a licensing constraint.
- Network blocking is built in, but Blanc is not a fit for somebody who needs a
  particular extension.

## Reddit

Candidate communities are not a posting list. The owner must re-open each
community's live rules on posting day, use a personal account, disclose that he
built Blanc, and never manufacture karma, comments, account history, or
moderator access to clear a gate. Use the clean `https://blancbrowser.com` URL:
several candidate communities prohibit affiliate, referral, invite, shortened,
or redirecting links, and Reddit's HTTP referrer is enough for aggregate source
measurement. Do not cross-post identical text. Revise any eligible draft after
the Show HN objection log.

Current eligibility matrix (re-check immediately before posting):

| Community | Launch status | Hard gate |
|---|---|---|
| r/browsers | Candidate | Re-open the [live rules](https://www.reddit.com/r/browsers/about/rules). Use the clean official URL; no affiliate/referral or invite link, and the post must be a substantive founder post rather than an FAQ/how-to link drop. |
| r/macapps | Conditional | The personal account must already have at least 10 local karma, complete the community's “Read the Rules” approval, be outside the once-per-developer 30-day cooldown, and qualify for the main feed through the current trust or transparency path. A main-feed post must use the open-source `[OS]` title prefix, the correct live pricing flair, founder disclosure, and Problem/Comparison/Pricing format. If the account does not qualify for the main feed, use the current App Pile megathread only if its rules permit it; otherwise skip. See the [live rules](https://www.reddit.com/r/macapps/about/rules), [current trust-path and PCP policy](https://www.reddit.com/r/macapps/comments/1ryaeex/), and [post-approval instructions](https://www.reddit.com/r/macapps/comments/1smg62t/). |
| r/windows | Skip unless already approved | Software promotion requires prior moderator permission plus the green-check user flair, and the [live rules](https://www.reddit.com/r/windows/about/rules) currently say new applicants are not being accepted. Do not apply, modmail, or post unless the owner's account already holds that permission and flair. |
| r/linux | Conditional | The personal account must already satisfy the [live rules](https://www.reddit.com/r/linux/about/rules): no more than 10% of its posts may be the owner's own content, Blanc must be directly relevant to Linux/open source, the owner must make a genuine reply to a related story before posting, use the direct official source, and stay to engage. If the existing participation ratio fails, skip rather than creating activity to qualify. |

**Known pre-launch mention:** a third-party user opened an
[r/browsers discussion about Blanc](https://www.reddit.com/r/browsers/comments/1vj0og9/has_anyone_heard_of_blanc_browser/)
on 2026-08-08 after seeing an Instagram ad. It is not the owner's founder post,
does not complete the Reddit launch task, and its traffic or engagement must not
be attributed to the launch. Its comments are still useful objection evidence:
some readers questioned whether the project was AI/vibe-coded, whether the
repository history was enough to trust, and whether Blanc should be framed as
an Arc replacement. Address those themes with concrete release evidence and
candid product boundaries. On posting day, also decide whether a new founder
post so soon after that discussion would be welcome under the live r/browsers
rules; skip if the answer is ambiguous. Do not revive or commandeer the old
thread as a substitute launch.

### Browser community draft — candidate after same-day rule check

**Title**

> I built a desktop browser that replaces the tab strip with one floating pill

**Body**

> I've been building Blanc for roughly a year. It runs on macOS, Windows and
> Linux, and replaces the tab strip and toolbar with one floating control
> surface called the Island. At rest it holds back/forward, the current group's
> tabs as dots, the domain, and a blocked-request count. Cmd/Ctrl+L expands it
> into the address bar, command palette, and quick switcher.
>
> Ad and tracker blocking runs at the browser session's network layer rather
> than as an extension, so it doesn't use Manifest V3's
> `declarativeNetRequest` rule budget and is active before web navigation begins.
>
> The most divisive choice is that there is no extension runtime. I shipped one
> and removed it after native crashes, an unsandboxed-chrome requirement, and a
> licensing constraint. If a particular extension is essential to you, Blanc
> probably isn't the right browser.
>
> Other candid limitations: it is Electron, and there is no mobile version. The
> code is open source under the MIT License, so it is readable, forkable, and
> yours to build on.
>
> The browser is free. Optional Patron is $4/month or $30/year and adds three
> macOS Dock colorways plus Named Workspaces on every platform. Creating a named
> workspace requires Patron; renaming and removing one you already have keeps
> working after a lapse.
>
> https://blancbrowser.com
>
> Happy to answer the skeptical version of any of this.

### macOS community draft — conditional, rewrite into live PCP format

**Title**

> [OS] I made a minimal macOS browser around one floating command surface

**Body**

> Blanc started with a UI question: how much browser chrome can disappear
> without making navigation slower? The result is the Island, one floating pill
> for navigation, tab dots, the current domain, and the blocked-request count.
> Cmd+L opens that same surface into an address bar, command palette, and quick
> switcher.
>
> It is an Electron/Chromium app, signed and notarized for macOS, with built-in
> EasyList and EasyPrivacy blocking at the network layer. Touch ID WebAuthn can
> create Blanc-owned Secure Enclave passkeys. There is deliberately no Chrome
> extension runtime; I removed the one I had after native crashes and the
> security/licensing compromises it required.
>
> Blanc is free and open source under the MIT License. Optional Patron
> ($4/month or $30/year) adds three Dock colorways and the ability to create
> Named Workspaces. Existing workspaces remain renameable and removable if the
> subscription lapses.
>
> https://blancbrowser.com
>
> I would especially value feedback on whether the Island still exposes enough
> state when several tabs are open.

### Windows community draft — hold; do not post without existing approval

**Title**

> I built a minimal Windows browser with its blocker inside the browser

**Body**

> Blanc is my attempt to replace the traditional tab strip and toolbar with one
> floating surface. The Island keeps navigation, tab dots, the domain, and a
> blocked-request count together; Ctrl+L expands it into the address bar,
> command palette, and quick switcher.
>
> Blocking runs at the browser session's network layer rather than through an
> extension, so it is not constrained by Manifest V3's extension rule caps.
> Blanc deliberately has no extension runtime—the one I previously shipped
> caused native crashes, forced the browser chrome out of its sandbox, and
> introduced a licensing constraint.
>
> The Windows release uses a timestamped Authenticode-signed installer. The app
> is free and the source is open source under the MIT
> License. Optional Patron ($4/month or $30/year) adds Named Workspaces on
> Windows, while existing workspaces remain renameable and removable after a
> lapse.
>
> https://blancbrowser.com
>
> If you try it, I would like to know where the Island feels clearer—or less
> clear—than a conventional toolbar.

### Linux community draft — conditional on existing participation eligibility

**Title**

> I built an AppImage browser with network-level blocking and no extensions

**Body**

> Blanc is a Chromium/Electron desktop browser built around one floating control
> surface instead of a tab strip and toolbar. The Island shows navigation, tab
> dots, the domain, and blocked-request count, then expands on Ctrl+L into the
> address bar, command palette, and quick switcher.
>
> EasyList and EasyPrivacy inputs are bundled and hash-verified with the release;
> the blocker runs at the browser session's network layer and does not download
> filter code at startup. There is no extension runtime. That is deliberate, and
> it also means Blanc is not a fit if your workflow depends on an extension.
>
> Linux ships as an x86_64 AppImage. The application source is public for
> inspection and open source under the MIT
> License. The browser is free; optional Patron ($4/month or $30/year) adds Named
> Workspaces, with rename and removal preserved after a lapse.
>
> https://blancbrowser.com
>
> I am interested in practical AppImage and desktop-integration feedback across
> distributions.

## Product Hunt

**Account gate:** use the owner's personal account and confirm it can reach the
submission form before Thursday, September 10. Product Hunt's current
[posting-access guide](https://help.producthunt.com/en/articles/481909-how-can-i-get-access-to-post)
says company accounts cannot post and newly created personal accounts normally
wait one week; newsletter subscription can grant immediate access.

Product Hunt's current form allows a 260-character description, recommends a
240×240 square thumbnail, requires at least two gallery images for the gallery
to appear, recommends 1270×760 gallery images, and supports gallery video only
through a full YouTube URL. Upload the final demo to YouTube as public or
unlisted—not private—at least 12 hours before the final preview when possible;
Product Hunt warns that new YouTube uploads may need about 12 hours before they
can be integrated. Verify the full URL in the preview, then use **Schedule
Launch** for **Thursday, September 10, 2026**; Product Hunt says its 24-hour PST
period puts scheduled posts live at **12:01 a.m. PST**. Re-check the
[official posting guide](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)
when creating the draft.

Prepared release-backed media:

- Thumbnail: `product-hunt/thumbnail-240x240.png`
- Gallery still 1: `product-hunt/island-resting-1270x760.png`
- Gallery still 2: `product-hunt/quick-switcher-1270x760.png`

The two historical stills satisfy the guide's two-image gallery floor, but they
must be recaptured from the final packaged launch release. Their v1.10.0
provenance is in `product-hunt/README.md`.
The full YouTube URL remains owner-supplied and must not be inferred from a raw
MP4 URL.

**Name**

> Blanc

**URL**

> https://blancbrowser.com/?ref=ph

**Pricing classification**

> Paid (with a free plan)

This is more candid than `Free`: core browsing is free, but Named Workspace
creation is a paid benefit.

**Tagline** — 51 characters

> A minimal desktop browser with built-in ad blocking

**Description** — 244 characters, within the current 260-character limit

> Blanc is a free desktop browser for macOS, Windows and Linux. Its floating Island replaces the tab strip and toolbar, while ad and tracker blocking runs at the network layer. Optional Patron adds Named Workspaces.

**Suggested topics**

- Web Browsers
- Privacy
- Productivity

Use only topics that exist in the live form and genuinely fit.

**First maker comment**

> Hi Product Hunt—I've been building Blanc for roughly a year around one design
> question: can the browser's controls live in one small surface without hiding
> the state you actually need?
>
> That became the Island. It replaces the tab strip and toolbar with one
> floating pill for navigation, tab dots, the domain, and a live blocked-request
> count, then expands into the address bar, command palette, and quick switcher.
>
> Two technical boundaries shaped the product. Blocking runs at the browser
> session's network layer rather than as an extension, so it does not use
> Manifest V3's extension rule budget. Blanc also has no extension runtime: I
> shipped one, then removed it after native crashes and the sandboxing and
> licensing compromises it required.
>
> Named Workspaces save a window's tabs and groups. The browser is free.
> Optional Patron is $4/month or $30/year and adds workspace
> creation on every platform. Existing
> workspaces remain renameable and removable after a subscription lapses.
>
> It is Electron, open source under the MIT License, and intentionally
> has no mobile or extension support. I would love feedback on the Island and on
> where this narrower browser is—or is not—useful for you.

**Gallery order**

1. Island demo through a verified full YouTube URL.
2. `product-hunt/island-resting-1270x760.png`.
3. `product-hunt/quick-switcher-1270x760.png`.
4. Optional: a packaged-v1.15.0 Named Workspaces capture with a visible
   `Patron` label in its caption. Omit it rather than substituting a mockup,
   development build, or unlabeled paid feature.

## AlternativeTo

**Status:** approved August 25; public signed-out browser check passed August 27.

**Listing:** https://alternativeto.net/software/blanc/

**Official URL:** `https://blancbrowser.com` — keep it clean. AlternativeTo's
[FAQ](https://alternativeto.net/faq/) discourages tracking parameters and
recommends HTTP referrer attribution.

**Pricing classification:** `Free with limited functionality (Freemium)` is the
most precise available category: the browser's main purpose is fully usable for
free, while Named Workspace creation is paid.

**Description**

> Blanc is a minimal desktop browser for macOS, Windows and Linux. It replaces
> the traditional tab strip and toolbar with a single floating control surface
> called the Island, which expands into a command palette and quick switcher.
>
> Ad and tracker blocking is built into the browser at the network layer rather
> than provided by an extension, so it is not limited by Manifest V3's extension
> rule caps. There is no extension runtime. Other features include tab groups,
> quiet background tabs that release memory, private tabs, end-to-end encrypted
> sync, and Touch ID passkeys on macOS.
>
> Blanc is free and open source under the MIT License. The bundled filter lists
> retain their CC BY-SA terms, and the Blanc name and logo remain reserved
> trademarks. Optional Patron ($30/year or $4/month) adds the ability to create
> Named Workspaces on every platform.
> Existing workspaces remain renameable and removable after a lapse.

Do not put URLs, email addresses, or phone numbers in the description.

**Alternatives submitted**

- Google Chrome
- Arc
- Brave
- Vivaldi
- Opera
- Zen Browser

## BetaList

**Submission gate:** pending owner payment decision. BetaList's current
[first-party support page](https://betalist.com/support) says all submissions
are paid and there is no free option. Review the live plans, prices, and
timelines in the authenticated form after the pre-launch baseline; do not infer
or freeze a price from an earlier plan. If the owner declines, record the
channel as not submitted rather than calling it fired.

**Name**

> Blanc

**Tagline**

> A minimal desktop browser with built-in ad blocking

**URL**

> https://blancbrowser.com/?ref=betalist

**Description**

> Blanc is a free desktop browser for macOS, Windows and Linux that replaces the
> tab strip and toolbar with one floating pill. Ad and tracker blocking runs at
> the browser session's network layer instead of as an extension, so it does not
> use Manifest V3's extension rule budget. No account is required for ordinary
> browsing. Optional Patron adds Named Workspace creation.

## Reusable replies for Reddit and Product Hunt

Do not paste these into Hacker News. Answer the exact question asked; do not
drop a full defense where one sentence would do.

### “Why Electron?”

> Fair question. The measurable concern is memory, so I published the harness
> and raw run instead of making a blanket efficiency claim. On one Mac, with six
> ad-heavy sites and three runs per browser, whole-process-tree
> `phys_footprint` medians were Blanc 1.3 GB, Brave 1.7 GB, and Chrome 5.6 GB.
> With Blanc's blocker off, it used 4.2 GB. That is one controlled session—not a
> universal promise—and the method is here: https://blancbrowser.com/faq

### “Is it open source?”

> Yes, under the MIT License. The whole application is readable in the public
> repo, the checked-out source runs locally, and you may modify it, redistribute
> it, and publish your own builds. Two conditions ride along: the bundled
> EasyList and EasyPrivacy filter lists are redistributed under CC BY-SA 3.0 or
> later, which requires attribution to The EasyList authors and carries
> share-alike terms on the redistributed lists and Blanc's derived filter data;
> and the Blanc name and logo are trademarks a
> copyright licence does not convey, so publish under your own mark. A local
> build demonstrates the checked-out source; it does not prove a published binary
> is byte-for-byte identical.

### “What telemetry does it send?”

> Packaged builds send one launch ping, and it can be turned off. The six fields
> are a random install ID, random session ID, version, platform, architecture,
> and coarse OS major. There are no URLs, searches, history, or page contents. A
> fresh profile saves the presented choice before a ping can send. The complete
> description is at https://blancbrowser.com/faq.

### “What is actually paid?”

> Patron is optional at $4/month or $30/year. Core browsing—including blocking,
> encrypted sync, private tabs, tab groups, quiet tabs, and passkeys—is free.
> Patron adds Named Workspace creation on every platform. Existing workspaces
> remain renameable and removable after a lapse.

### “Why no extensions?”

> It is a deliberate boundary. I shipped an extension runtime and removed it
> after native crashes, an unsandboxed-chrome requirement, and a licensing
> constraint. Blocking is built into the browser at the network layer, but if a
> particular extension is essential, Blanc genuinely is not the right browser.
> On macOS there is one narrow exception: an explicit Fill gesture can ask the
> installed 1Password app for a matching Login item. It is opt-in, never fills
> automatically, and does not add a general extension runtime.

## Morning-of fact check

- [ ] `package.json` and the latest public release both still say v1.15.0.
- [ ] The README still links the v1.15.0 tag as the exact source snapshot for
  the current public binaries, and any newer `main` work is excluded from copy.
- [ ] The latest `launch-freeze-start` row records the final `origin/main`
  anchor, launch release tag, and release SHA; since that dynamic anchor,
  `origin/main` contains only launch evidence/copy/guard changes and no
  product/runtime, dependency, packaging, release-workflow, or feature-spec
  merge.
- [ ] The macOS, Windows, and Linux downloads linked from the site resolve.
- [ ] Pricing still reads $4/month and $30/year in Polar and on the site.
- [ ] Named Workspace creation still requires Patron; rename/removal still work
  after a lapse.
- [ ] The telemetry payload remains exactly six fields.
- [ ] `npm run test:unit` passes, including
  `test/unit/public-truth.test.js`.
- [ ] The Island demo has been recaptured from the final packaged launch
  release, resolves from immutable URLs without authentication, and no launch
  post references the retired v1.9.1 or historical v1.10.0 pair.
- [ ] The Product Hunt thumbnail is 240×240 and both final-release gallery
  stills are 1270×760; the stills render without private data or UI newer than
  the selected launch release.
- [ ] The owner's personal Product Hunt account can reach the submission form.
- [ ] Product Hunt's full YouTube URL is not private, has had processing time,
  and appears in the preview with both stills before **Schedule Launch**.
- [ ] Product Hunt's live form displays **September 10, 2026** before scheduling;
      if an earlier channel slipped, every downstream date moved with it.
- [ ] Each Reddit community's live rules and the eligibility matrix permit the
      planned post format; every ineligible candidate is explicitly skipped.
- [ ] The HN account is eligible under the current Show HN restriction.
- [ ] Anthony writes the HN title, first comment, and replies himself without
  agent drafting or editing.
- [ ] No channel asks for upvotes, comments, likes, or coordinated engagement.
