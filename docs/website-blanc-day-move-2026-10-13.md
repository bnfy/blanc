# Moving to blanc.day: live evidence for steps 4 and 5

Status, October 13, 2026: the website, its Workers and the redirects from the
former domains are live on `blanc.day`. Search Console's Change of Address is
running. A few checks are still open; they are listed at the end.

Plan: [`docs/superpowers/specs/2026-10-13-blanc-day-domain-design.md`](superpowers/specs/2026-10-13-blanc-day-domain-design.md).
Blanc Mail's steps 2 and 3 are recorded in its own repository
(`bnfy/blanc-mail`, PR #127: `docs/REMAINING_RELEASE_TASKS.md` and
`docs/OAUTH_VERIFICATION.md`).

| Step | Change | Merged |
| --- | --- | --- |
| Plan | #747 | `0465321` |
| 4. Website and Workers | #748 | `7710f084` |
| 5. Redirect the former hosts | #749 | `5178b746` |
| 6. Browser links (ships with the next release) | #750 | `5f1885a9` |
| 7. Docs and tab-import companions (ship with the next store submission) | #751 | `5dd17cc2` |
| Share cards on blanc.day, then the Sunrise redesign | #752, #755 | `4c20be75`, `e68cb147` |

Unless a line says otherwise, the owner ran each deploy and check from their
Mac. This environment's network proxy cannot reach either domain.

## Step 4: the website and its Workers

**Workers, deployed before the site:**

- `blanc-ping`, version `a9f9e3cf-2810-42f9-9d2b-3752a2e5fcb4`. Routes:
  `blanc.day/dl/*`, `www.blanc.day/dl/*`, `blancbrowser.com/dl/*`,
  `www.blancbrowser.com/dl/*`, plus its `workers.dev` address.
- `blanc-newsletter`: deployed with `https://blanc.day` added to
  `ALLOWED_ORIGINS`. Its version ID was not recorded.
- `blanc-tab-import`, version `cf81a2b6-22ee-4572-8b50-3f50c43dbdb4`, on its
  custom domain `tabs.blancbrowser.com`, deployed after step 5. A
  `create_tab_handoff` call to `https://tabs.blancbrowser.com/mcp` for one
  example tab returned a `launchUrl` starting
  `https://blanc.day/import-tabs/`. The call created a throwaway one-tab
  handoff, which expires unclaimed after 10 minutes.

**Site.** Deployed after the Workers, with canonical tags on
`https://blanc.day/`, which the owner checked after the deploy. After #755 the
site was deployed again from `main` at `e68cb147`, which also carries #753 and
#754. The Production SHA of that second deploy was not checked from here.

**Download links.** A GET to `https://blanc.day/dl/check` and to
`https://blancbrowser.com/dl/check` returns 302 to
`https://github.com/bnfy/blanc/releases/latest`. A HEAD request to `/dl/*`
returns 404, because `blanc-ping` answers GET only, so check these with GET.

**Search Console.**
- The `blanc.day` Domain property is verified.
- `https://blanc.day/sitemap.xml` returns 200 `application/xml` and lists
  `https://blanc.day/…` addresses.
- The sitemap was first submitted on October 12, before this deploy, and
  showed "Couldn't fetch". It was resubmitted on October 13 and now reads
  Success, with 36 discovered pages, which matches the 36 sitemap URLs.
- URL Inspection of `https://blanc.day/` reported "URL is unknown to Google"
  on October 13, as expected for a new property. Google now finds the pages
  through the sitemap and the Change of Address below, so no separate
  indexing request was made.

**Google Analytics.** The "Blanc Website" web stream's URL is
`https://blanc.day`. Its measurement ID, `G-MN8BLY6GE9`, is the one in
`site/src/scripts/site.js` and `cloudflare/ping-worker/src/index.js`, and
Analytics reported data collection active in the past 48 hours.

**Live SEO audit.** `npm --prefix site run audit:seo:live`, run from a
checkout of `main` at `34658f43` (its default origin is blanc.day), passed for
36 sitemap pages and 36 internal HTML destinations at `https://blanc.day`.

## Step 5: the former hosts redirect

**Deploy.** `blancbrowser-redirects` deployed with wrangler 4.149.0, version
`9b7940b5-30c1-4890-a946-6c0d0343f7c1`. Triggers:
- `blancbrowser.com/*` and `www.blancbrowser.com/*` (zone `blancbrowser.com`);
- `www.blanc.day/*` (zone `blanc.day`).

**Checks:**

| Request | Result |
| --- | --- |
| `https://blancbrowser.com/features/island?x=1` | 301 to `https://blanc.day/features/island?x=1` |
| `https://www.blanc.day/mail` | 301 to `https://blanc.day/mail` |
| GET `https://blancbrowser.com/dl/check` | 302 to `https://github.com/bnfy/blanc/releases/latest`, from `blanc-ping`, not the redirect |
| `https://tabs.blancbrowser.com/` | 404 from the relay itself, not redirected |

**Tab-import fragment.**
- In Safari, the owner opened
  `https://blancbrowser.com/import-tabs/#v=1&id=<22 × A>&key=<43 × A>`, a link
  with a valid shape but a fake handoff.
- It landed on `blanc.day/import-tabs`, where the page accepted the handoff and
  Safari asked whether to open Blanc. So the fragment survives the
  redirects, as the store extensions' links require.
- An earlier check with `#test` proved nothing, because the page removes its
  fragment from the address bar by design.

**getbowser.com.**
- The getbowser.com zone's Redirect Rule (hostname `getbowser.com` or
  `www.getbowser.com`, 301, query string preserved) now targets
  `concat("https://blanc.day", http.request.uri.path)` instead of
  blancbrowser.com, so it is one hop.
- `https://getbowser.com/features/island?x=1` returns 301 to
  `https://blanc.day/features/island?x=1`.
- `https://www.getbowser.com/` returns 301 to `https://blanc.day/`.

**Search Console Change of Address**, blancbrowser.com to blanc.day.
- Validation passed: a 301 from the homepage, both sites verified, and
  redirects from the sample pages `/download`, `/features/island`, `/features`
  and `/changelog`.
- It warned about "Duplicate redirect targets" for `https://blancbrowser.com/`.
  The Worker maps every path to the same path, so the duplicate is two
  spellings of the homepage.
- The move was confirmed. Search Console shows "This site is currently
  moving", started October 13, 2026.

## Email and DNS on blanc.day

- **Routing.** Email Routing forwards `support@blanc.day` and `license@blanc.day`
  to the `support@blanc.day` Resend inbox. The catch-all is disabled. A stray
  forwarding destination left from setup was deleted.
- **DMARC.** A `_dmarc.blanc.day` TXT record, `v=DMARC1; p=none;`, was added.
  Check it with `dig +short TXT _dmarc.blanc.day`.

## Still open

- **Confirm Cloudflare Web Analytics** records `blanc.day`.
- **Step 6** reaches users with the next browser release.
- **Step 7** reaches users with the next store submission of the tab-import
  companions and the Codex plugin, with their versions bumped from 0.1.0.
- **In Blanc Mail's repository**, the `license@blanc.day` forwarding and DMARC
  items in `docs/REMAINING_RELEASE_TASKS.md` can now be closed.
