# Blanc v1.9.1 launch copy pack

**Owner:** Anthony publishes and replies from his own accounts. Agents may
fact-check and prepare non-Hacker-News copy, but never post it.

**Freeze:** Re-check the morning-of checklist before publishing. Do not silently
update a single channel when a product fact changes; update the frozen facts and
every affected section together.

**Release lock — REBASELINED 2026-08-27:** This pack describes packaged public
v1.9.1, published from `09ae98c`. It carries the revised Island-dot
presentation and optional macOS 1Password login fill, and fixes startup Profile
Sync retractions plus favicon compatibility. Do not publish until the v1.9.1
48-hour soak and all three follow-up platform checks are recorded. Do not use
UI or claims from later work on `main`.

## Frozen facts

| Claim | Launch truth |
|---|---|
| Current public release | v1.9.1 |
| Platforms | macOS, Windows, Linux |
| Core price | Free |
| Blanc Patron | US$4/month or $30/year, plus applicable taxes |
| Patron boundary | Creating a Named Workspace requires active Patron. Renaming and removing an existing workspace continue after a lapse |
| Other Patron benefits | Three extra macOS Dock colorways; Named Workspaces on every platform |
| Source status | Open source under the MIT License (adopted 2026-08-30); modification, redistribution, and third-party builds are permitted. Publishing a build carries the bundled filter lists' CC BY-SA 3.0+ attribution/share-alike terms, and the Blanc name and logo stay reserved as trademarks |
| Telemetry | One packaged-build launch ping: random install ID, random session ID, version, platform, architecture, coarse OS major. Fresh profiles save the presented choice before a ping can send |
| Memory benchmark | One Mac, one session, three runs per browser, six ad-heavy news sites, median whole-process-tree `phys_footprint`: Blanc 1.3 GB; Brave 1.7 GB; Zen 3.2 GB; Chrome 5.6 GB; Vivaldi 5.9 GB. Blanc with blocking off: 4.2 GB |
| Release authentication | macOS signed and notarized; Windows timestamped Authenticode; checksum manifest Sigstore-signed; Windows and Linux CI artifacts have GitHub provenance attestations |
| macOS 1Password boundary | Optional, device-local, and explicitly invoked; reads matching Login items through the installed 1Password app. It does not fill automatically, store credentials, or provide a general extension runtime |
| Repository/build boundary | The v1.9.1 tag is the exact source snapshot associated with the public binaries. Re-check `main` on launch morning before describing repository code as downloadable behavior |

Canonical URLs—copy exactly:

| Channel | URL |
|---|---|
| Show HN | https://github.com/bnfy/blanc |
| Reddit | https://blancbrowser.com/?ref=reddit |
| Product Hunt | https://blancbrowser.com/?ref=ph |
| AlternativeTo | https://blancbrowser.com |
| BetaList | https://blancbrowser.com/?ref=betalist |

Final demo assets—use these exact immutable URLs:

| Form | URL |
|---|---|
| MP4 | https://raw.githubusercontent.com/bnfy/blanc/9890d9e5b5adbe368e0138e0175fd4327200b68d/docs/superpowers/plans/assets/island-demo.mp4 |
| GIF | https://raw.githubusercontent.com/bnfy/blanc/9890d9e5b5adbe368e0138e0175fd4327200b68d/docs/superpowers/plans/assets/island-demo.gif |

The MP4 is the source for the required public or unlisted YouTube upload before
Product Hunt. A raw MP4 URL does not satisfy Product Hunt's gallery-video field.

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
   announce the incremental v1.9.1 release.
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
- Narrow exception to the extension boundary: packaged macOS v1.9.1 can fill a
  matching Login item from the installed 1Password app only when the user asks;
  it is not an extension runtime or a Blanc-owned credential store.
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
- Patron adds three macOS Dock colorways and Named Workspaces on every platform.
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

Candidate communities are not a posting list. Re-check each community's current
self-promotion, flair, account-history, and link rules on posting day. Post only
where the rules allow it, from the owner's personal account, and do not
cross-post identical text. Revise these drafts after the Show HN objection log.

### Browser community draft

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
> https://blancbrowser.com/?ref=reddit
>
> Happy to answer the skeptical version of any of this.

### macOS community draft

**Title**

> I made a minimal macOS browser around one floating command surface

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
> https://blancbrowser.com/?ref=reddit
>
> I would especially value feedback on whether the Island still exposes enough
> state when several tabs are open.

### Windows community draft

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
> https://blancbrowser.com/?ref=reddit
>
> If you try it, I would like to know where the Island feels clearer—or less
> clear—than a conventional toolbar.

### Linux community draft

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
> https://blancbrowser.com/?ref=reddit
>
> I am interested in practical AppImage and desktop-integration feedback across
> distributions.

## Product Hunt

Product Hunt's current form allows a 260-character description, recommends a
240×240 square thumbnail, requires at least two gallery images for the gallery
to appear, recommends 1270×760 gallery images, and supports gallery video only
through a full YouTube URL. Upload the final demo to YouTube as public or
unlisted—not private—and verify the full URL before scheduling. Re-check the
[official posting guide](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)
when creating the draft.

**Name**

> Blanc

**URL**

> https://blancbrowser.com/?ref=ph

**Pricing classification**

> Paid (with a free plan)

This is more candid than `Free`: core browsing is free, but Named Workspace
creation and cosmetic colorways are paid benefits.

**Tagline** — 51 characters

> A minimal desktop browser with built-in ad blocking

**Description** — 244 characters, within the current 260-character limit

> Blanc is a free desktop browser for macOS, Windows and Linux. Its floating Island replaces the tab strip and toolbar, while ad and tracker blocking runs at the network layer. Optional Patron adds Named Workspaces and three macOS Dock colorways.

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
> creation on every platform plus three macOS Dock colorways. Existing
> workspaces remain renameable and removable after a subscription lapses.
>
> It is Electron, open source under the MIT License, and intentionally
> has no mobile or extension support. I would love feedback on the Island and on
> where this narrower browser is—or is not—useful for you.

**Gallery order**

1. Island demo through a verified full YouTube URL.
2. 1270×760 Island resting-state image.
3. 1270×760 expanded command palette/quick-switcher image.
4. 1270×760 Named Workspaces image with a visible `Patron` label in its caption.

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
> Blanc is free. The source is publicly available on GitHub but is not released
> under an open-source licence. Optional Patron ($30/year or $4/month) adds three
> macOS Dock colorways and the ability to create Named Workspaces on every
> platform. Existing workspaces remain renameable and removable after a lapse.

Do not put URLs, email addresses, or phone numbers in the description.

**Alternatives submitted**

- Google Chrome
- Arc
- Brave
- Vivaldi
- Opera
- Zen Browser

## BetaList

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
> browsing. Optional Patron adds Named Workspace creation and three macOS Dock
> colorways.

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
> Patron adds three macOS Dock colorways and Named Workspace creation on every
> platform. Existing workspaces remain renameable and removable after a lapse.

### “Why no extensions?”

> It is a deliberate boundary. I shipped an extension runtime and removed it
> after native crashes, an unsandboxed-chrome requirement, and a licensing
> constraint. Blocking is built into the browser at the network layer, but if a
> particular extension is essential, Blanc genuinely is not the right browser.
> On macOS there is one narrow exception: an explicit Fill gesture can ask the
> installed 1Password app for a matching Login item. It is opt-in, never fills
> automatically, and does not add a general extension runtime.

## Morning-of fact check

- [ ] `package.json` and the latest public release both still say v1.9.1.
- [ ] The README still links the v1.9.1 tag as the exact source snapshot for
  the current public binaries, and any newer `main` work is excluded from copy.
- [ ] The macOS, Windows, and Linux downloads linked from the site resolve.
- [ ] Pricing still reads $4/month and $30/year in Polar and on the site.
- [ ] Named Workspace creation still requires Patron; rename/removal still work
  after a lapse.
- [ ] The telemetry payload remains exactly six fields.
- [ ] `npm run test:unit` passes, including
  `test/unit/public-truth.test.js`.
- [ ] Both immutable final Island demo URLs above work without authentication.
- [ ] Product Hunt's full YouTube URL is not private and appears in the preview.
- [ ] Each Reddit community's live rules permit the planned post format.
- [ ] The HN account is eligible under the current Show HN restriction.
- [ ] Anthony writes the HN title, first comment, and replies himself without
  agent drafting or editing.
- [ ] No channel asks for upvotes, comments, likes, or coordinated engagement.
