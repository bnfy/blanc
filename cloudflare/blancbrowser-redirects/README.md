# blancbrowser-redirects

Retires the website's former hosts (step 5 of
`docs/superpowers/specs/2026-10-13-blanc-day-domain-design.md`):
`blancbrowser.com`, `www.blancbrowser.com` and `www.blanc.day` answer every
path with a redirect to the same path and query on `https://blanc.day` — 301
for `GET`/`HEAD`, 308 for anything else so a method and body survive.

What it leaves alone:

- `tabs.blancbrowser.com`, the tab-import relay that shipped browsers call with
  redirects refused, is a custom domain of `blanc-tab-import`; these routes
  match exact hosts and never reach it.
- `/dl/*` on either domain is a more specific `blanc-ping` route, so download
  links keep being counted where they land.
- Email on blancbrowser.com (MX records) is DNS, not HTTP.

Deploy after the site is live on blanc.day:

```sh
cd cloudflare/blancbrowser-redirects
npx wrangler@4 deploy
```

Then check:

```sh
curl -sI "https://blancbrowser.com/features/island?x=1" | grep -i -E '^(HTTP|location)'
curl -sI https://www.blanc.day/mail | grep -i -E '^(HTTP|location)'
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://blancbrowser.com/dl/check
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://tabs.blancbrowser.com/
```

The first two answer 301 to the same path on `https://blanc.day` (query kept);
`/dl/check` answers 302 to the GitHub releases page, straight from `blanc-ping`
(an unknown target is not counted); `tabs.blancbrowser.com` must not redirect.
