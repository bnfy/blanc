# Polar setup — Blanc Patron (done; kept as a rotation runbook)

**Status: complete.** Blanc Patron has been on sale since August 19, 2026.
Use this runbook only if the Polar organization, a product, a license
benefit, or the checkout link changes.

## What is set up

Polar (https://polar.sh) is the merchant of record. Both environments have
the same three products. Each product has its **own** License Keys benefit,
because Blanc decides what a key unlocks from the key's `benefit_id`.

| Product | Price | Benefit | Blanc kind |
|---|---|---|---|
| Blanc Patron — Monthly | $4/month | Blanc Patron Monthly License | `subscription` |
| Blanc Patron — Annual | $30/year | Blanc Patron Annual License | `subscription` |
| Blanc Supporter (retired) | $19 one-time | Blanc Supporter License | `founding` |

- **Production** organization: slug `bnfy` (`.github/FUNDING.yml` points
  at it). **Sandbox** (https://sandbox.polar.sh) organization: slug
  `bananify-creative`. The two have different organization ids.
- The Patron License Keys benefits were configured on 2026-08-18 with the
  `BLANC-PATRON` prefix, no expiry, a limit of 5 activations, and
  customer-manageable activations. Every activation in Blanc uses one
  activation, and Blanc never deactivates, so the customer portal is how a
  customer frees one.
- The $19 Supporter is no longer for sale (no checkout link, public
  storefront disabled). Its product and benefit must stay **active** so
  existing Supporter keys keep activating as founding Patrons.
- One checkout link sells both Patron plans (the buyer chooses monthly or
  annual).

## Where Blanc keeps the values

All in `src/main/patron.js`. Packaged builds use production values and
`api.polar.sh`; development runs use sandbox values and
`sandbox-api.polar.sh`, so a production key can be tested only in a
packaged build.

- `PRODUCTION_ORG_ID` and `SANDBOX_ORG_ID`: the organization ids
  (Settings → General in each Polar dashboard).
- `BENEFIT_ALLOWLIST`: benefit id → kind, one table per environment. A key
  whose benefit is not listed is refused, so a new product or benefit does
  nothing until its id is added here and released. To find a benefit's id,
  open the benefit in the dashboard and copy the UUID at the end of the URL
  (`…/products/benefits/<uuid>`).

The checkout link appears in Settings (`#patronCheckout` in
`src/renderer/pages/settings.html`) and on the website
(`site/src/pages/index.astro`, `about.astro`, `features.astro`,
`support.astro`). Search for `buy.polar.sh` to find every copy.

## How Blanc uses Polar

- **Activation** (Settings → Patron): `POST
  /v1/customer-portal/license-keys/activate` with the key, the organization
  id and the label `Blanc`. A subscription key must come back `granted` and
  unexpired.
- **Validation**, for subscription keys only: at startup and then at most
  once a day, `POST /v1/customer-portal/license-keys/validate` with the
  organization id, the key and the activation id. A 404 with error
  `ResourceNotFound` ends Patron at once. If Polar is unreachable or the
  response is ambiguous, Patron continues for up to 30 days from the last
  successful validation (`GRACE_MS` in `src/main/patron-model.js`).
- Founding Supporter keys are never revalidated.
- Renderers see only `patronActive`. Patron currently unlocks creating
  Named Workspaces.

If the data Blanc sends to Polar changes, update the `patron-license` flow
in `security/network-data-inventory.json` and the Patron paragraph in
`site/src/pages/privacy.astro` in the same change.

## Rotating something

1. Make the change in the Polar dashboard. Do it in the sandbox too, so the
   two environments stay alike.
2. Put any new organization or benefit ids into `src/main/patron.js`.
   Keep an old benefit in the allowlist for as long as keys issued under it
   should keep working.
3. If the checkout link changed, replace every `buy.polar.sh` link (see
   above).
4. Test in a development run: buy with Polar's sandbox test card, enter the
   key in Settings → Patron, and confirm that a Named Workspace can be
   created. Run `npm run test:unit`.
5. Test production in a packaged build with a real key.
6. Ship a release (packaged builds carry the ids) and deploy the website
   with `npm run site:deploy`.
