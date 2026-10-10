# Polar setup — Blanc Supporter (done; kept as a rotation runbook)

**Status: complete.** The production organization id is hardcoded in
`PRODUCTION_ORG_ID` in `src/main/patron.js`, and the live hosted
checkout URL is in the "become a supporter" links in
`site/src/pages/index.astro` and `site/src/pages/about.astro`. The steps
below describe how it was set up — useful again only if the org, product,
or checkout URL ever changes.

1. Create a Polar organization at https://polar.sh — handle `bnfy`
   (it's what `.github/FUNDING.yml` points at; if it ever changes,
   update that file).
2. Create product **Blanc Supporter**: one-time purchase, **$19**, with
   the **License Keys** benefit enabled, activation limit **5**.
   Do the same in the sandbox dashboard (https://sandbox.polar.sh) with a
   test product for dev testing.
3. Copy the organization id (Settings → General in the Polar dashboard)
   into `PRODUCTION_ORG_ID` in `src/main/patron.js`. The sandbox org has
   its own id, kept in `SANDBOX_ORG_ID`; dev builds use it and
   sandbox-api.polar.sh automatically.
4. Put the hosted checkout URL into the "become a supporter" links
   (`site/src/pages/index.astro`, `site/src/pages/about.astro`).
5. Test end-to-end in dev: buy the sandbox product with Polar's test
   card, activate the key in Settings, confirm colorways unlock.
6. Deploy the site: `npm run site:deploy`.
7. Ship a release so packaged builds carry the production org id.
