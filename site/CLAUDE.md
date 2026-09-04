# Marketing site (`site/`)

A self-contained **Astro** project (own `package.json` — the Electron app's root
dependency tree is untouched). Pages live in `src/pages/` (`index`, `download`,
`features`, `about`, `privacy`, `terms`, `changelog`, and
`features/{island,ad-blocking,private-tabs,command-palette,tab-groups,sync,security}`),
sharing `src/layouts/BaseLayout.astro` with three explicit page profiles —
island (index: non-solid header, rich OG), standard (solid header), legal
(privacy/terms: `legal-top` header, **no** analytics/consent, **no**
OG/Twitter meta). Don't flatten these differences — they're deliberate. The
footer is one unified component on every page (flush-left stack: brand
breadcrumb, full nav with the current page highlighted via `Astro.url`,
newsletter, legal block, social row — email/Threads/Instagram/TikTok/GitHub). `src/styles/site.css` is the one stylesheet
(bundled + hashed; fonts self-hosted via fontsource — the UI family is `"Inter
Variable"`, the display family is `"Newsreader Variable"` loaded in
`BaseLayout.astro` with its italic imported only by `press.astro`, and this
file is NOT under the root `tokens/` substrate guard).
`src/scripts/site.js` (release-link resolution + consent-gated GA, all pages
except legal) and `src/scripts/demo.js` (the self-playing Island demo, index
only) and `src/scripts/reveal.js` (the one-time homepage rise for the
feature grid and Patron card, index only; adds state only when motion is
welcome) are Astro-processed. Anything needing a **stable URL** — favicons,
`og-image.png`, `logo.png`, `feature-*.png` (OG images), `robots.txt`,
`shots/**` (fetched at runtime by demo.js) — lives in `public/`; never hash or
rename these.

**Build contract:** `astro.config.mjs` pins `build.format: 'file'` (dist emits
`about.html`, `features/island.html` … — the exact pre-Astro URL layout; never
switch to directory format) and disables asset inlining
(`assetsInlineLimit: 0`, `inlineStylesheets: 'never'`) so CSS/JS are always
external hashed files. Internal links are root-relative extensionless
(`/features/island`) matching the canonicals Cloudflare Pages serves.

Commands (root proxies): `npm run site:dev`, `npm run site:build`, and
`npm run site:deploy` (build + `npx wrangler pages deploy site/dist
--project-name=blancbrowser --branch=main` to the Cloudflare Pages project `blancbrowser`,
BNFY account, canonical domain `blancbrowser.com`; `getbowser.com` 301s there).
**Deploy `site/dist`, never `site/`.** CI (`.github/workflows/site.yml`) builds
the site on any change to `site/**`, root `package.json` (a build input — the
JSON-LD `softwareVersion` imports its `version`), or the changelog generator.
The explicit `--branch=main` is mandatory: release worktrees are detached at
`origin/main`, and without it Wrangler labels the upload as a `HEAD` preview
that never reaches the canonical domain. After deployment, confirm Wrangler
reports `Environment: Production`, `Branch: main`, and the expected source SHA.

**Changelog pipeline:** `scripts/generate-site-changelog.mjs` (root, needs an
authenticated `gh`) fetches GitHub releases, scrubs the legacy "Bowser" name,
and writes **`site/src/data/releases.json`** (committed). `src/pages/changelog.astro`
renders it; `src/pages/changelog.xml.js` emits the RSS via `src/lib/rss.mjs`.
Each release parses into ordered **`sections`** (`{heading, blocks}`, blocks
being paragraphs and bullet lists) so a body renders in the order it was
written — an intro paragraph above the bullets it introduces, each heading
keeping its own list. Most releases are GitHub's auto-generated "What's
Changed" notes, whose boilerplate headings are dropped and whose bullets keep
their PR link; a hand-written body (v1.0.0 was the first) also uses `**bold**`,
`` `code` ``, and `[text](url)`. That inline markup becomes **typed spans**
(`text`/`strong`/`code`/`link`) that `components/ReleaseText.astro` maps onto
real elements — never an HTML string, and never `set:html`: bullet text comes
from contributor-supplied PR titles, so Astro's auto-escaping is what keeps
release notes from introducing markup. Inline link hrefs are pinned to
https/mailto. RSS flattens the same spans back to plain text.
`npm run site:changelog` regenerates; `npm run site:changelog:check` is the
freshness guard (release-time/manual — not in CI; needs `gh`). Never hand-edit
`releases.json`. `release-feature-names.json` is the hand-maintained editorial
overlay that gives feature-bearing builds their short, scannable names on the
page; every detected feature release must have at least one, enforced by the
unit suite. A new hand-written release can avoid an overlay entry by starting
each feature bullet with a bold name (`- **Glance.** ...`), which the page
extracts automatically. `release.sh` runs the regenerate step (non-fatal) but no
longer seds any site file — the JSON-LD version and sitemap `lastmod` both
resolve at build time, so the routine post-release redeploy picks them up.

**Newsletter signup:** the footer form (`src/components/NewsletterForm.astro`,
rendered by both `Footer.astro` variants, legal pages included — it's a form,
not analytics) posts `{email, website}` to the `blanc-newsletter` Worker
(`cloudflare/newsletter-worker/` in the repo root; deploy/export/unsubscribe
runbook in its README). `website` is a honeypot; the Worker keeps a filled one
off the list but quarantines the address (`hp:`, 30-day TTL, visible in the
export) since autofill is the one way a human trips it — see the README.
The endpoint constant lives in the component, so a Worker URL change
means a site redeploy. The Worker stores only email + signup timestamp in KV;
no double opt-in yet and unsubscribe is manual (token-gated DELETE) until a
sending provider is chosen. The privacy page's "Newsletter (optional)" section
describes exactly this contract — change them together or not at all.

**Ambassador applications:** `src/pages/ambassadors.astro` posts the compact
application form to `/ambassador-apply` on the same Worker. It sends name,
email, one HTTPS creator-profile URL, a short introduction, and the hidden
honeypot. The form has a real form-encoded POST fallback so script failure can
never put application data into a URL. The Worker validates the request, uses
its `AMBASSADOR_RATE_LIMITER` binding, then asks Resend to deliver it to the
fixed `AMBASSADOR_TO` inbox with the applicant as reply-to.
It never writes applications to KV or enrolls applicants in the newsletter.
The application form, Worker contract, and privacy-page disclosure must change
together. Deploy the Worker and confirm inbox delivery before deploying a site
version that advertises the form.

**Sitemap:** `src/pages/sitemap.xml.js` — an explicit route manifest with
per-route `changefreq`/`priority`, asserted at build time against the real
page list (adding/removing a page without updating the manifest fails the
build; that's the point). Served at `/sitemap.xml` (URL unchanged for Search
Console).

Releases don't deploy the site. After a release: `npm run site:changelog`,
commit `releases.json`, then `npm run site:deploy`. The Windows download page
notes the installer is not yet code-signed; update that copy only when Azure
Trusted Signing actually ships a signed build. The JSON-LD deliberately has
**no `aggregateRating`** — no real user ratings exist yet; fabricating one
violates Google's structured-data policy. `logo.png` (1024², mark at 80%
height), `apple-touch-icon.png` (180², mark at 66%), the favicon family,
`components/BrandMark.astro`, and the two launch cards are generated by the
root `scripts/build-brand-assets.js` (`npm run brand:build`; `brand:check`
guards drift) from the Sunrise motifs — the mark is raster, painted as an ink
silhouette through its alpha; the ≤16px favicons use the rays-only crop, the
app's own small-size rule. Never hand-edit those outputs. `og-image.png`,
`feature-*.png`, and `press/blanc-press-card.png` read `favicon.svg` when
re-rendered via `site/scripts/render-og-cards.mjs` and
`render-press-primary-capture.mjs` (after a build). The demo island shows no
favicon on its blank tab because the app hides that slot on internal pages. Utility scripts in `site/scripts/`: `verify-parity.mjs` +
`shoot-pages.mjs` (conversion-era comparators against the `site-pre-astro` git
tag) and `compress-images.mjs` (re-runnable lossless image optimization —
jpegtran + oxipng via Homebrew, with a pixel/ICC/cICP-equality gate; several
PNGs are cICP Display P3, so never optimize them with a tool that drops
ancillary chunks).
