# blanc-bang-icons

The icon server behind `blanc.day/bangs`: `GET blanc.day/bang-icons/<host>`
returns the icon for one host in Blanc's pinned bang list. Design:
`docs/superpowers/specs/2026-10-17-bangs-page-redesign-design.md`.

## What it does

- **Same origin.** Routes carve `/bang-icons/*` out of the blanc.day Pages
  site (like `blanc-ping`'s `/dl/*`), so the site's `img-src 'self'` policy
  stays as it is and a visitor's browser only ever talks to blanc.day.
- **Only bang hosts.** It reads the allowed hosts from
  `https://blanc.day/bang-hosts.json` (written by `npm run site:bangs`, kept in
  memory for ten minutes). Each release's re-pin and site deploy update the
  list; the Worker needs no deploy for it. Anything else, and the reviewed
  hosts in `src/held-back.json`, get a 404 and nothing is fetched.
- **Where icons come from.** The site's own declared icon (sharpest raster
  `apple-touch-icon`/`icon`, at most four tries), else its `/favicon.ico`, else
  `https://icons.duckduckgo.com/ip3/<host>.ico`. DuckDuckGo sees only the
  host, never anything about visitors.
- **Fetch rules** (the app's favicon rules): no cookies or referrer, manual
  redirects (at most 3, each checked: http(s), default ports, no IP literals
  or local names), 5 s per request, 256 KiB of HTML, 100 KiB per image.
- **What it serves.** Only bytes whose magic number is PNG, JPEG, GIF, WebP or
  ICO, typed by that sniff, never SVG. Every reply carries
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src
  'none'; sandbox` and `Cross-Origin-Resource-Policy: same-site`. Hits are kept
  in KV for 30 days (browsers 7 days); misses for 1 day.
- **Visitors.** Nothing is stored about them; Workers Logs is off.

## Set up and deploy (each step needs the owner's go-ahead)

1. The BNFY account is on the Workers Paid plan (the owner upgrades in the
   dashboard if not).
2. Create the store and paste its id into `wrangler.toml`:
   `npx wrangler kv namespace create ICONS`
3. `https://blanc.day/bang-hosts.json` must be live: deploy the site first
   (`npm run site:deploy`, see `site/CLAUDE.md`).
4. Deploy from this folder: `npx wrangler deploy`.
5. Check: `node cloudflare/bang-icons-worker/scripts/check-icons.mjs --popular`
   must pass for all 19 featured hosts before the /bangs redesign ships. Fix a
   gap in `src/find-icon.js`, never by shipping icon files with the site.
6. Owner console items: a billing notification on the account, and a rate
   rule on `blanc.day/bang-icons/*`.

## Pulling an icon

Add the host to `src/held-back.json` (sorted; the unit test checks it is a
real bang host), redeploy, then drop the kept copy:
`npx wrangler kv key delete --binding ICONS "icon:<host>" --remote`.

## Tests

`node --test test/unit/bang-icons-worker.test.js`
