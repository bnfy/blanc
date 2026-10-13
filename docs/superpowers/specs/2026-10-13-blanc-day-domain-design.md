# Moving Blanc to blanc.day

October 13, 2026. The owner registered `blanc.day` as Blanc's umbrella domain:
with Blanc Mail joining Blanc Browser, `blancbrowser.com` no longer names
everything Blanc makes. This spec covers both repositories, this one (the
website, the browser and its Workers) and `bnfy/Postel` (Blanc Mail and its
services), because the order across them matters.

## Why now

Two one-way doors close soon, and both are on the Mail side:

- **Blanc Mail's first public build.** Postel's main already builds the
  Sparkle feed (`blancbrowser.com/mail/appcast.xml`), the `PM1-` validator
  (`blancbrowser.com/mail/api/v1/license/validate`) and the archive host
  (`downloads.blancbrowser.com`) into the app. Once a public build ships, those
  hosts must answer for as long as that build is installed.
- **Google's verification of the Gmail scopes.** Postel #124 set the consent
  screen's homepage, privacy and terms links to `blancbrowser.com/mail` and
  authorized `blancbrowser.com`. The project is in Testing and no review has
  started. Changing a verified app's branding sends it back to review, and
  four of its scopes are restricted, so that review should happen once, on
  the final domain.

The browser has no such deadline: shipped builds only link to the site, and a
permanent redirect covers every one of them.

## What depends on blancbrowser.com today

About 230 files in this repository and 37 in Postel name it. They fall into
five groups, and each group gets a different treatment.

### 1. Live services that installed software calls directly

These must keep answering on their current host, without a redirect.

| Host | Called by | Why it can't move |
| --- | --- | --- |
| `tabs.blancbrowser.com` | Shipped browsers (`TAB_IMPORT_RELAY_ORIGIN` in `src/main/tab-import-handoff.js`); the published Chrome, Firefox and Safari tab-import extensions (host permission and `connect-src`); the Codex plugin's MCP endpoint and its domain challenge | The browser claims a handoff with `redirect: 'error'`, the extensions' CSP allows only this origin, and the Firefox add-on ID is `tab-import@blancbrowser.com` |

`updates.blancbrowser.com` is the newsletter's Resend sending domain (DNS
records only); it is in group 4.

Sync and telemetry already run on `*.bnfy-441.workers.dev`, and browser
updates come from GitHub Releases, so neither is affected.

### 2. Pages, Workers and assets the website serves

The Pages project (`blancbrowser`) and the Workers routed on the zone:

- **The site.** `site/astro.config.mjs` (`site:`), and a second copy of the
  origin in `BaseLayout.astro`, `sitemap.xml.js`, `lib/rss.mjs`,
  `lib/website-routes.mjs` and `[...legacy].astro`; `public/robots.txt`,
  `public/.well-known/security.txt`; `scripts/verify-seo.mjs`,
  `scripts/audit-live-seo.mjs`, `scripts/render-og-cards.mjs` (the domain is
  drawn into the cards).
- **`ping-worker`** routes `blancbrowser.com/dl/*` and `www.…/dl/*` (counted
  download redirects).
- **`newsletter-worker`** accepts form posts only from the origins in
  `ALLOWED_ORIGINS`, which lists `https://blancbrowser.com` and no other
  production origin. Its HTML responses link back to the site.
- **`tab-import-worker`** builds landing links from
  `LANDING_ORIGIN = 'https://blancbrowser.com'` (`/import-tabs/#…`).
- **Blanc Mail's Worker** (`blanc-mail-services`, in Postel) routes
  `blancbrowser.com/mail/api/*` and `/mail/appcast.xml`.
- **`getbowser.com`** 301s to `blancbrowser.com`.

### 3. Links and copy built into software

- **The browser:** `about-panel.js`, Settings › Help (How Blanc works, Privacy
  policy, Release notes, Data and recipients), the start page's onboarding
  privacy link, and two update-error messages ("reinstall from
  blancbrowser.com") in all five languages. `bananify-services.js` treats
  `blancbrowser.com` and its subdomains as Bananify's services.
- **The tab-import extensions:** `LANDING_ORIGIN` in both `handoff.mjs` files;
  the Codex plugin's homepage, privacy, terms and support metadata.
- **Blanc Mail** (Postel, unreleased): `Info.plist` (`SUFeedURL`),
  `MailLicense.swift` (validator), About, Compose, the licence sheet, the root
  view and General settings (pricing, terms, privacy, support links),
  `Localizable.xcstrings` (copy naming the server), `MailServiceURLTests`,
  `native/scripts/release.sh` (archive URL).

### 4. Contact addresses and senders

`support@blancbrowser.com` (footer, privacy, terms, Mail pages, `SUPPORT.md`,
`SECURITY.md`, `security.txt`, issue templates, the Codex plugin, the
newsletter's ambassador inbox); `license@blancbrowser.com` (Mail's licence
emails, `LICENSE_EMAIL_FROM`); `release-notes@updates.blancbrowser.com`
(newsletter).

### 5. Records of past work

Release incidents, dated claim ledgers (`docs/website-*-v1.*.json`),
`site/src/data/releases.json` release notes, marketing posts already published,
grant applications, and Postel's shutdown spec and plan. **These keep
blancbrowser.com**: they describe what was true when they were written.

## Target

- **`https://blanc.day` is the canonical origin** for the whole website, path
  for path: `blanc.day/`, `blanc.day/mail`, `blanc.day/features/…`,
  `blanc.day/changelog`. `www.blanc.day` 301s to the apex.
- **`blancbrowser.com` and `www.blancbrowser.com` 301 to the same path on
  `blanc.day`**, query string kept, permanently. `getbowser.com` 301s straight
  to `blanc.day` (one hop, not two).
- **`tabs.blancbrowser.com` stays exactly as it is** and is excluded from the
  redirect.
- **Blanc Mail moves to `blanc.day` before its first public build:** feed
  `https://blanc.day/mail/appcast.xml`, validator
  `https://blanc.day/mail/api/v1/license/validate`, archives
  `https://downloads.blanc.day/mail/BlancMail-<version>.zip`, licence emails from
  `license@blanc.day`, consent-screen links on `blanc.day/mail`.
  `postelmail-redirects` targets `blanc.day` directly.
- **`support@blanc.day` is the published address.** `support@blancbrowser.com`
  keeps forwarding for good.
- **Identifiers keep their names**, like `build.appId` and Postel's bundle ID:
  the Pages project `blancbrowser`, Worker names, `tab-import@blancbrowser.com`,
  and the `@blancbrowser` social handles and Substack.
- **Both old domains stay registered and auto-renewing.**

## The order

Live steps are the owner's; each is listed with how to check it.

1. **Stand up blanc.day, unannounced** (owner, live). Add the zone to
   Cloudflare. Attach `blanc.day` and `www.blanc.day` to the Pages project
   `blancbrowser` as custom domains. Turn on Email Routing for
   `support@blanc.day`. Add a Search Console Domain property (DNS TXT). Attach
   `downloads.blanc.day` to the R2 bucket behind the Mail archives. Verify
   `blanc.day` in Resend.
   *Check:* `blanc.day/` and `blanc.day/mail` serve the current site (its
   canonical tags still name blancbrowser.com, so nothing is indexed twice);
   mail to `support@blanc.day` arrives.
2. **Blanc Mail to blanc.day** (Postel PR, then owner deploys).
   - The app's feed, validator, archive and page URLs, its copy and
     `MailServiceURLTests`, plus `release.sh`.
   - `services/mail-worker`: routes on the `blanc.day` zone, `LICENSE_EMAIL_FROM`,
     and the links in its emails.
   - `services/postelmail-redirects`: targets.
   - The licensing contract, release docs, rebrand gates, `AGENTS.md` and
     `CLAUDE.md`.
   Deploy the Mail Worker, then `postelmail-redirects`.
   *Check:* the Task 9 and Task 12 curls of Postel's shutdown plan, with
   `blanc.day` in place of `blancbrowser.com`.
3. **Google branding** (owner, live): authorize `blanc.day`, set the homepage,
   privacy and terms links to `blanc.day/mail`, `/mail/privacy` and
   `/mail/terms`. Keep the older authorized domains until a signed build's
   consent screen shows the new links, as `OAUTH_VERIFICATION.md` already
   requires. **Don't submit for verification before this step.**
4. **The website's code to blanc.day** (this repository, website PR; deploy
   follows the owner's site hold).
   - One site origin, read from `astro.config.mjs` everywhere, so the next
     move is one line. Update robots, `security.txt`, the SEO scripts and the
     OG cards.
   - The privacy policy and terms name blanc.day (with "formerly
     blancbrowser.com") and get a new effective date. Contact addresses become
     `support@blanc.day`.
   - Workers:
     - `ping-worker` adds the `blanc.day/dl/*` routes.
     - `newsletter-worker` adds `https://blanc.day` to `ALLOWED_ORIGINS`
       (keeping the old origin) and links back to blanc.day.
     - `tab-import-worker`'s `LANDING_ORIGIN` becomes blanc.day.
   Deploy the Workers before the site, so forms and download counts work the
   moment the site's canonical changes.
   *Check:* `npm run site:build` (which runs `check:seo`), the site and
   Worker unit tests, and after deploy `npm --prefix site run audit:seo:live`
   with `SITE_ORIGIN=https://blanc.day`.
5. **Redirect the old domain** (owner, live). Add a Cloudflare redirect rule on
   the `blancbrowser.com` zone: hostname `blancbrowser.com` or
   `www.blancbrowser.com` → `https://blanc.day` + path, query kept, 301. Point
   `getbowser.com`'s rule at `blanc.day`. Then run Search Console's Change of
   Address, update the Google Analytics stream URL, and confirm Cloudflare Web
   Analytics records `blanc.day`.
   *Check:*
   - Redirect rules run before Workers on the same zone, so the old `/dl/*` and
     `/mail/*` routes are bypassed: confirm `blancbrowser.com/dl/<target>` lands
     on `blanc.day/dl/<target>` and counts once.
   - `tabs.blancbrowser.com` still answers directly.
   - A link built by a store extension, `blancbrowser.com/import-tabs/#v=1&…`,
     reaches `blanc.day/import-tabs/` with its fragment and opens Blanc.
     Browsers carry a fragment across a redirect that has none.
6. **The browser's next release** (this repository, desktop PR).
   - In-app links point at blanc.day.
   - The two update-error messages change in every language in the same PR
     (`copy:ack`).
   - `bananify-services.js` also treats `blanc.day` and its subdomains as
     Bananify's.
   - The tests and test-hook fixtures that name the site.
   Existing installs keep working through step 5's redirect.
7. **Docs and the tab-import extensions' next store submission.**
   - Docs: `CLAUDE.md`, `site/CLAUDE.md`, `release-verification.md`,
     `README.md`, `SUPPORT.md`, `SECURITY.md`, `TRADEMARKS.md`, the issue
     templates, and the press kit and fact sheet.
   - The extensions' `LANDING_ORIGIN` and the plugin's metadata change only
     with a store update. Their host permission, CSP and add-on ID keep
     `tabs.blancbrowser.com` and `tab-import@blancbrowser.com`.

Steps 2 and 3 are the urgent ones. Steps 4 to 7 can follow at the website's
and the browser's own pace, but the redirect (5) waits until 4 is deployed.

## Decisions for the owner

- **D1: Path for path now; the umbrella homepage later.** *Recommended:* move
  the site as it is. Turning `blanc.day/` into a page about both products
  (with the browser at `/browser`) is a design and SEO change of its own, and
  doing both at once makes either harder to judge. *Alternative:* redesign the
  homepage in step 4.
- **D2: Leave the tab relay on `tabs.blancbrowser.com`.** *Recommended:* keep
  it for good. Moving it means a browser release, store re-review of three
  extensions and a new plugin domain challenge, and users would never see the
  difference. *Alternative:* add `tabs.blanc.day` for new builds and serve both.
- **D3: The newsletter's sender.** *Recommended:* keep
  `release-notes@updates.blancbrowser.com` for now. Its sending reputation is
  established, and Mail's licence emails can warm `blanc.day` first. Move it
  later, after a few weeks of clean sending from blanc.day.
- **D4: 301 or 308 for the old domain.** *Recommended:* 301. Nothing shipped
  POSTs to blancbrowser.com (Mail's beta builds POST to postelmail.com, which
  step 2 points straight at blanc.day), and search engines treat both as
  permanent.

## Out of scope

- Renaming identifiers listed under Target.
- Changing records of past work (group 5).
- Social handles, Substack, Product Hunt and other third-party profiles: the
  owner updates their links after step 5.
- Launch material: the launch copy pack and growth plan are already marked
  not publishable and must be refreshed before any further channel. That
  refresh now also changes the domain.
