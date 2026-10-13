# Mail and Suite licensing — updated October 13, 2026

## Hold until Blanc Mail ships

The owner confirmed Mail is not released and that licensing is complete.
Keep all four Mail/Suite products Private and all public checkout gates false.
When the approved Mail release ships: make those four products Public, enable
checkout and deploy the site, run one real Suite purchase and verify both app
keys activate, then delete the retired production `df98506e` and sandbox
`2f5e210c` benefits only once no supported build references them. The QA Suite
subscription ends automatically November 13, 2026. No deployment or deletion
is part of committing this wiring.

## Released Browser compatibility and launch preflight — October 13

Fresh origin tags and the GitHub published-release inventory still identify
v1.31.0 as the latest public release. All **34 published releases with Patron
support**, v1.7.0 through v1.31.0, carry the production shared benefit
`ed1cce8c-d87e-4d27-b9d7-d30bda2de402` in their packaged allowlist. None is
Monthly-only. Draft v1.2.0/v1.2.4 and prereleases were excluded; 22 earlier
stable v1 releases have no Patron module and precede subscription support.
Users on pre-Patron versions need a current Browser update.

The exact `patron.js` and `patron-model.js` from each release tag were executed
with `app.isPackaged=true` and mocked granted Polar responses. Activation and
due revalidation passed in all 34, stored the same shared benefit and key,
and selected production endpoints. This is tagged-source behavior evidence,
not execution of every historical binary. The installed signed Release QA
activation above supplies the current runtime check. No real keys or API
credentials were used in the compatibility harness.

Launch preflight found the public `https://blanc.day/mail/appcast.xml` returns
HTTP 200 with **zero release items**. The Mail release task list still leaves
exact-candidate selection, Developer ID export, notarization, stapling,
Gatekeeper, final ZIP digest and signed live acceptance open. A working local
Apple Development Release build is not that distribution artifact. Checkout
remains disabled and products private pending the approved Mail artifact and
its acceptance evidence. The owner was asked whether those exist elsewhere.
No optional production period switch was made: its QA key ID is `3e69c8b9-…`,
while `78275bf8-…` belongs to the owner's separate Patron Monthly subscription.

## Current production state: shared Browser benefit (October 13)

The owner explicitly confirmed both Anthony J Loria Monthly subscriptions are
theirs and authorized replacing their Browser keys while keeping Kiren's key
unchanged. This limited exception supersedes the earlier migration blocker
below; no external customer's key replacement was authorized.

Both production Browser benefits matched: BLANC-PATRON prefix, no expiry,
five activations, customer-managed activation removal, unlimited usage.
Retained `ed1cce8c-d87e-4d27-b9d7-d30bda2de402` and renamed it “Blanc Browser
License”. Patron Monthly now carries only that benefit; Suite Monthly carries
it plus Mail. Annual products were not edited and already carry that benefit.
Mail-only products were not edited. Suite products remain Private.

Fresh dashboard read-back showed three Granted shared Browser keys, exactly
one per customer. Kiren's key ID `83c78c08-2b9a-4509-be15-fd121f598216` and
complete key value are unchanged; status is Granted. The owner's replacement
key is `78275bf8-5502-40d3-8b34-c2f31834a096`; the QA replacement is
`3e69c8b9-d017-43a0-8f06-38e2e3661969`. The retired Monthly benefit's
unfiltered Grants tab shows both grants Revoked and no active grants.
The QA Mail key `df9dcc4f-8977-43f1-82f3-686dff203644` is still Granted;
its complete value matches the pre-unification purchase key. All four Mail
and Suite products were read back as Private.
The dashboard did not expose grant IDs, so Kiren's grant ID was not directly
compared; no API token is available here. The Annual product was not changed.

The QA replacement key activated Patron successfully in an isolated profile
of the currently installed, signed Browser Release copy. The first attempt
parsed a key incompletely at an underscore; full-field parsing corrected it.
Kiren's preservation check was repeated using the complete field value.
Earlier sandbox regex comparisons could likewise truncate underscore-bearing
values; the owner independently confirmed the full Browser/Mail key hashes
across all four sandbox switches. Key IDs and grant statuses were directly
verified in this dashboard session. No full key values are recorded.

Prepared source now allows only the shared subscription benefit in each
environment (production `ed1cce8c`, sandbox `27ecc7d8`), retaining the separate
founding Supporter benefits. Checkout's Suite Monthly mapping now uses the
shared production benefit. Focused validation/checkout tests cover shared
activation, stored-key validation, environment isolation and rejection of
retired Monthly benefits. This source change has not been released.

Neither retired benefit was deleted. Installed/public Browser releases still
reference the old IDs; deletion remains deferred until that condition is
resolved and the irreversible action is separately confirmed. Public checkout
and purchase/key-continuity gates remain false; no release or launch occurred.


## October 13 production setup (checkout remains closed)

The owner approved and created the Mail benefit and four private products in
Blanc Browser production (`bnfy`). A fresh **All** catalogue check included
archived products and found exactly one of each; the unfiltered benefits list
contained exactly one Mail benefit. Kiren's and Anthony's existing Patron
subscriptions were unchanged. No migration or deletion was needed.

| Product | Production ID | USD price | Benefits |
| --- | --- | --- | --- |
| Blanc Mail — Monthly | `b39dbdde-a607-4b94-bbba-f20c5acd6439` | $4.99/month | Mail |
| Blanc Mail — Annual | `72c489be-30a0-4dee-9a02-2a482458f17b` | $49.99/year | Mail |
| Blanc Suite — Monthly | `bb3a14c5-7fab-4f64-a7b2-718aafec9966` | $7/month | Browser + Mail |
| Blanc Suite — Annual | `28957184-d99d-4954-bdb6-56397a606816` | $70/year | Browser + Mail |

Mail benefit: `93a4fbc5-b7b0-4a0b-8817-46f62814181c`, visible license keys
with no prefix, no fixed expiry, unlimited activations and usage.
Suite reuses production Patron Monthly `df98506e-a88a-4364-b4c9-cc424dda01f0`
or Patron Annual `ed1cce8c-d87e-4d27-b9d7-d30bda2de402`; no Suite benefit.

The production catalogue and checkout selection live in
`site/src/data/mail-commerce.mjs`. `/mail/pricing` consumes its prices and its
gated checkout links. Both `purchaseTestingPassed` and `checkoutEnabled` are
false, and no checkout links are configured. The owner requested **disabled
flow only**, with no private QA checkout-link creation. No payment was made,
no purchase test passed, and no public checkout or deployment is implied.
Keep all four Polar products Private until the purchase matrix passes;
private visibility alone does not prevent purchase through a direct link.

Blanc Mail's `native/Config/Shared.xcconfig` embeds the production Mail benefit
for Release validation and purchase-email sign-in. Debug keeps the separate
sandbox benefit. The Mail repository's `docs/POLAR_MAIL_SUITE_PRODUCTION.md`
records the corresponding configuration and remaining gates. Existing public
Mail pages remain coming soon; the sandbox acceptance checklist below is still
pending and must be repeated against a signed production candidate.

Local wiring verification: Xcode's effective Release setting resolves the
production Mail benefit and Debug resolves `819e65da-12b8-4cb4-a32d-329446b40811`.
All 35 focused hostless Mail licensing tests and its source audits passed.
All 2,978 Browser unit tests passed outside the sandbox (the sandbox run's two
localhost-listen permission errors passed on retry); ESLint also passed.
The site/SEO build passed, desktop and 390px mobile pricing previews retained
the closed-checkout notice, and the built pricing HTML contains all four
approved prices with no Polar checkout URL. These checks do not prove a real
purchase, granted production key, installed-app activation or cancellation.

## October 13 app purchase checks (production test pending)

With the owner's action-time approval, a fresh sandbox Suite Monthly purchase
used Stripe's test card and a fictional New York address: $7 + $0.62 simulated
tax. No real payment was processed. The seller dashboard showed Paid order
`cf692ea2-34a3-4409-b477-c31d1fcbef59`, active subscription
`3f9c527a-1eca-4798-a785-3bd0e29e80c8`, and customer
`78ed2da0-f6d4-4fc0-b5df-7f67ad2959b9`, with both expected benefit grants.

| App check | Observed result |
| --- | --- |
| Browser development build at `9cdf21c6`, isolated `/private/tmp/blanc-suite-sandbox-browser-Dev` profile | Purchased Patron Monthly key activated through Settings; “You're a Patron — thank you.” |
| Mail Debug at `ba1e26c0` plus the production configuration change | Required `run-dev.sh` launch, Apple Development signed `com.bnfy.PostelMail`, team `XYGUCY4498`, strict deep signature passed; actual app plist embeds sandbox Mail benefit |
| Mail isolated QA Keychain namespace `3df26af4-97a1-45da-9fa0-8610e86180e2`, demo mail, no development-authoring bypass | Purchased Mail key changed Trial ended to Licensed · Blanc Mail; New Message enabled and read-only strip removed |

No currently active sandbox Patron Monthly subscription was available, so the
new Suite test subscription was switched to Patron Monthly (prorate on next
invoice), then back to Suite Monthly (prorate & charge now). Older sandbox
fixtures were untouched. Patron key ID `3688c4f4-2864-4f2d-8add-3bf36a747004`
and its exact value remained unchanged and Granted on both plans. Mail key ID
`d48cfa99-5289-410b-bf1e-6fd068304568` was Revoked on Patron-only; Mail's
explicit Check Again showed License needed. The Suite upgrade restored the
same Mail key and its exact value; Check Again restored Licensed · Blanc Mail
using the stored key without re-entry. Full key values were kept only in
memory/isolated app licensing storage and never printed or recorded here.

Scope: seller-side grants and signed Debug/development app activation, including
manual Mail revalidation. The customer receipt/portal display, Browser's next
daily revalidation, the full annual/Mail-only matrix, physical offline behavior
and production/installed-artifact checks are not proved by these observations.

Production QA preparation: one 100% discount, Once (first invoice only), max
one redemption globally and one per customer, restricted to Suite Monthly.
A new private QA checkout link `66a379d5-d8d1-41e2-aaa1-55b8e9e7b32a` presets
the discount with codes disabled, Suite Monthly only and no trial. The owner
approved a separate Gmail `+suiteqa` alias because their original production
email already has Patron Monthly; that existing subscription is unchanged.
The owner completed the $0 production checkout. Order
`22930c2d-8d43-4927-8819-3a734783e992` is Paid; Suite Monthly subscription
`2fc8fcca-f4de-4e79-9f03-3ac48067b9bc` belongs to the approved QA alias.
Both production benefit grants appeared. The QA link must never be installed
as a public purchase link.

Browser v1.31.0 (bundle 1310), copied without changing its signature into an
isolated QA app/profile, accepted the production Patron Monthly key and showed
“You’re a Patron — thank you.” The local universal Mail Release candidate
launched through `native/scripts/run-dev.sh` with
`POSTEL_BUILD_CONFIGURATION=Release`; its actual plist embeds production Mail
benefit `93a4fbc5-b7b0-4a0b-8817-46f62814181c`, and strict deep codesign
verification passed outside the sandbox. It showed “Licensed · Blanc Mail” and
enabled New Message. This is an Apple Development-signed local Release build,
not a notarized or distributed Mail release. No full key values are recorded.

The QA subscription was canceled at period end. The dashboard confirms it
ends **November 13, 2026**, with a final charge of **$0.00**, rather than a paid
renewal. Mail Check Again still validates during the remaining period. This
does not prove end-of-period revocation. Neither existing paid Patron
subscription was changed.

Portal review: production Settings → Customer portal has **Enable subscription
plan changes** on. No same-billing-period-only setting was shown. The current
[organization settings API](https://polar.sh/docs/api-reference/2026-10/organizations/update-organization)
also exposes a global `customer_portal_settings.subscription.update_plan`
boolean, with no period-specific restriction. No portal setting was changed.

### October 13 correction: preserve keys across billing periods

The owner rejected key re-entry and explicitly required preserving the exact
Browser key across monthly ↔ annual changes. This supersedes the October 8
same-period-only proposal below. It applies to existing Patron customers as
well as new Patron/Suite purchases. Keep one license key per app.

The current Monthly and Annual Browser benefits differ, so the catalogue does
not yet satisfy this requirement. New purchases need a shared Browser benefit
across Patron/Suite and both periods. Existing Monthly and Annual keys must
remain valid through that transition and follow subscription cancellation.
Replacing the Annual benefit with the Monthly benefit would revoke existing
Annual keys. Attaching both benefits to every product retains old keys but
issues two Browser keys per customer, contrary to the one-key-per-app decision;
that workaround has not been applied.

The published [license-key update API](https://polar.sh/docs/api-reference/license-keys/update)
allows status, usage, activation/usage limits and expiry changes; it exposes no
benefit reassignment or key-value change. The [subscription update API](https://polar.sh/docs/api-reference/subscriptions/update)
changes products, with no per-customer benefit override. A supported Polar
migration that preserves key values, or a separately reviewed entitlement
service for legacy keys, is still needed before altering production benefits.
No migration or benefit reassignment has been performed.

Acceptance must cover existing Monthly and Annual keys and new Suite keys in
both directions, restart/revalidation without re-entry, one Browser key per
customer, Mail grant changes on Patron/Suite changes, and cancellation of all
subscription entitlements. Keep founding Supporter licenses unchanged.

All four production products remain Private. Public checkout now explicitly
requires `keyContinuityTestingPassed` as well as `purchaseTestingPassed` and
`checkoutEnabled`; all are false. The monthly production purchase/activation
and scheduled cancellation passed, but key continuity, the full acceptance
matrix, Mail release/distribution and public launch remain pending.

## October 13 sandbox unification and period-switch test

The owner reported unifying all four sandbox Patron/Suite products on benefit
`27ecc7d8-f31e-4951-8235-22dda51327c4`, renamed “Blanc Browser License”, and
removing `2f5e210c-7d63-4ba6-8818-45f3b7fc9b93` from the monthly products.
Dashboard read-back confirms the shared benefit is on Patron Monthly, Patron
Annual, Suite Monthly and Suite Annual, with no expiry and five activations.
It has three Granted Browser keys. The retired Monthly benefit was not deleted.
Debug already accepts the shared benefit; its allowlist comment now reflects
the rename. A regression test confirms activation and stored-key revalidation
against this sandbox benefit, while Release rejects sandbox benefits.

The owner reported that unification issued one new Browser key to each active
Suite Monthly subscription, including today's `3f9c527a-…`, revoked their old
Monthly grants, and left Mail keys unchanged. That is **replacement**, not
preservation of the pre-unification keys; the earlier app test's old Monthly
Browser key must no longer be treated as current.

The dashboard then completed all four requested switches on subscription
`eda7e167-a8ec-40d1-9dd2-9cf13da66891`, using “Prorate on next invoice”. After
each switch, the same shared Browser key detail was freshly read and its exact
value compared in memory, without recording the key. Grant processing was
allowed to settle between changes.

| Selected product | Browser key ID | Exact Browser key unchanged | Browser status |
| --- | --- | --- | --- |
| Suite Annual | `fea9909a-10e2-4616-8a2e-666e86cbcb22` | Yes | Granted |
| Patron Annual | Same | Yes | Granted |
| Patron Monthly | Same | Yes | Granted |
| Suite Monthly (final) | Same | Yes | Granted |

The original Mail key `67e39021-b27b-416d-bcbd-09e7b1e20957` was Revoked on
Patron-only and returned to Granted on Suite Monthly, with its exact value
unchanged. The subscription is Active and left on Suite Monthly. No production
catalogue, subscription or customer-portal setting changed in this test.

This proves Polar grant/key continuity **after** unification. It does not prove
that unification preserves old Monthly keys, nor does it constitute a fresh
native-app restart/daily-revalidation test with this fixture. Public checkout
and key-continuity gates remain false pending the production migration and
remaining app acceptance work.

## October 8 decision: one license key per app

The owner decided that changing between Patron, Mail, and Suite must never
require entering a new key in an app the customer already uses. Polar keeps a
benefit grant, and therefore its license key, when a subscription changes to a
product that carries the same benefit; it revokes only benefits the new product
lacks (`list_outdated_grants` filters on `benefit_id NOT IN` the new product's
benefits). The separate Suite benefit is therefore retired. Suite carries the
existing per-app benefits instead:

| Product | Benefits it must carry |
| --- | --- |
| Patron Monthly | Blanc Patron Monthly License (unchanged) |
| Patron Annual | Blanc Patron Annual License (unchanged) |
| Mail Monthly, Mail Annual | Mail license `819e65da-…` (unchanged) |
| Suite Monthly | Blanc Patron Monthly License + Mail license |
| Suite Annual | Blanc Patron Annual License + Mail license |

Browser accepts only its Patron and founding benefits; Mail accepts only the
Mail benefit plus its legacy `PM1-` keys. Neither app has a Suite allowlist.
Because Patron Monthly and Annual are separate benefits, a change of billing
period still issues a new Browser key, as it already does for Patron alone, so
this historical same-period-only proposal did not meet the October 13 owner
requirement above and must not be used as the launch design.

### Sandbox changes (applied October 8)

Applied through the sandbox API with a short-lived organization token; the
production catalog is unchanged.

| Product | Before | After |
| --- | --- | --- |
| Blanc Suite — Monthly `286767b6-7f5c-45b7-94f6-89faa905879c` ($7/month) | Blanc Suite License `c5ebb27b-…` | Blanc Patron Monthly License `2f5e210c-7d63-4ba6-8818-45f3b7fc9b93` + Blanc Mail License `819e65da-…` |
| Blanc Suite — Annual `578a6b00-20f5-4fce-bd72-f53805caa8b9` ($70/year) | Blanc Suite License `c5ebb27b-…` | Blanc Patron Annual License `27ecc7d8-f31e-4951-8235-22dda51327c4` + Blanc Mail License `819e65da-…` |

Both products read back with exactly those two benefits. Polar then revoked
both Suite-benefit grants (subscriptions `eda7e167-…` and `3155fa61-…`, at
13:46:51Z), so no sandbox subscription holds the Suite benefit.

Polar granted the new benefits to both existing Suite Monthly subscriptions in
the same second, which is the plan-change behaviour this model relies on:

| Subscription | Patron Monthly grant (license key id) | Mail grant (license key id) |
| --- | --- | --- |
| `eda7e167-…` (the Patron → Suite upgrade) | `b73bd00b-…`, originally created September 29 (`650ab1a7-1717-4548-aa19-1b89d48f8e1f`) | `a9a48755-…`, new (`67e39021-…`) |
| `3155fa61-…` (bought as Suite) | `c4127bba-…`, new (`cd4f0b14-…`) | `0910d0f9-…`, new (`aa9a55e8-…`) |

The upgraded subscription's Patron grant is the original record, re-granted,
and its license key id `650ab1a7-…` is the same Patron key id recorded for
the September 29 purchase below. So the customer's existing Browser key came back
rather than being replaced. The token could not read license keys (403), so
the key value and activation state were not inspected; confirm in Browser that
the original key validates.

At the owner's direction the unused Blanc Suite License benefit
`c5ebb27b-…` was then deleted (no grant was active; `DELETE` returned 204 and a
later `GET` 404).

Historical follow-ups (the period restriction is superseded above):

1. Offer plan changes only within the same billing period. Products expose no
   plan-change field, and the organization settings could not be read with the
   token's scopes, so check the subscription and customer-portal settings in
   the dashboard.
2. Start fresh purchases for the checklist below rather than relying on the
   older Suite fixtures.

### Acceptance checklist

- [ ] New Suite Monthly purchase: the receipt and portal show a Browser key
      and a Mail key. The Browser key activates Patron in Browser; the Mail key
      unlocks authoring in Mail; each app rejects the other's key.
- [ ] Patron Monthly → Suite Monthly (prorate and charge now): the stored
      Patron key's ID and value are unchanged, Browser stays Patron through its
      next daily validation, and a Mail key is newly granted.
- [ ] Suite Monthly → Patron Monthly: the Browser key is unchanged and still
      valid; the Mail key is revoked and Mail closes authoring after its next
      validation.
- [ ] Mail Monthly → Suite Monthly and back: the Mail key is unchanged in both
      directions; a Browser key appears with Suite and is revoked after.
- [ ] Repeat one upgrade on the Annual products.
- [ ] Sign in with the purchase email in Mail (Enter License → "Or sign in
      with your purchase email") on a Suite and a Mail-only customer: the code
      arrives, and Mail enters that customer's granted Mail key. A Patron-only
      customer is told no Mail license was found.
- [ ] Cancel Suite at period end: both keys are revoked at the end of the
      period, not before.
- [ ] Record what Polar shows the customer before and after the upgrade.
      Since October 8 the public copy no longer promises a confirmed
      pre-change quote, only that Polar handles the price difference, so
      this is evidence for support rather than a launch gate.

The October 3 and earlier evidence below used the retired Suite benefit and
is kept for history only.

## Previous Suite-benefit evidence (superseded)

Suite sandbox benefit: `c5ebb27b-529f-43f4-946a-5fcde32d4ad0` in the existing
Bananify Creative sandbox organization `a6ffc65a-8ba3-4973-8a2a-e057aa811f9f`.
It grants the $7/month and $70/year Suite products. Browser's production Suite
allowlist remains empty, and the public Mail pages remain coming soon.

Mail has a separate benefit, `819e65da-12b8-4cb4-a32d-329446b40811`, for its
$4.99/month and $49.99/year products. It is not in Browser's allowlist. Existing
Patron and founding products/benefits were not changed. All four new products
are private in the sandbox customer portal, use no checkout trial, and grant
only their corresponding Mail or Suite license benefit.

The new benefits have unlimited activations and no fixed expiry. The
[Polar license-key guide](https://polar.sh/docs/features/benefits/license-keys)
describes expiry as a duration from purchase; it must not be assumed to equal a
subscription renewal date. Mail's paid-through offline behavior remains a
launch gate until actual purchased-key responses establish the required data.

An invented invalid key sent to the public sandbox validator returned HTTP 404
`ResourceNotFound`. Browser previously treated all non-OK validation responses
as an outage; it now invalidates an explicitly rejected key. The regression
failed before the fix, then all 19 focused licensing tests and ESLint passed.
Network failure, 429, and 503 retain Browser's existing grace policy.

The Mail annual sandbox purchase completed: the issued key validates as granted
with the Mail benefit and was accepted by an Apple Development-signed Mail UI
fixture, enabling compose and reply. Polar returned `expires_at=null` although
its subscription dashboard has a September 2027 renewal. Cancellation is
scheduled at that date and the key remains granted today. The full key is not
committed. Polar blocked a second active subscription for the same customer
email, including through a Suite-only checkout link. The owner approved
`bnfycreative+suiteqa@gmail.com` for the separate Suite test.

The Suite monthly sandbox purchase completed for that alias: paid order
`855070fb-a8f3-42be-8def-57c3cde3dfdb`, active subscription
`3155fa61-6baa-4ca3-88a4-3f7cffe2d821`, and granted Suite license-key ID
`34350fe1-75eb-4d45-b2ae-2876cf17741c`. A fake New York billing address
produced $0.62 sandbox tax, for a $7.62 displayed total. The full key is not
committed. The actual key displayed **Licensed · Blanc Suite** and enabled
compose/reply in signed Mail QA. In an isolated, unpackaged Browser development
build, the same key activated through the real sandbox path and displayed
**You’re a Patron — thank you**. A production-signed Browser and its production
benefit IDs remain untested and unconfigured. The actual Mail-only key was
rejected by Browser in a second isolated profile, with Patron checkout still
visible.

On September 29, a fresh Patron Monthly sandbox subscription was purchased for
`anthony+sandbox-patron2@bnfy.me` with the Stripe test card. Subscription
`eda7e167-a8ec-40d1-9dd2-9cf13da66891` and order
`a06a7eea-62db-4630-904f-77bd48dd662e` showed a $4.00 base charge plus
$0.36 test tax. The Patron benefit/key ID `650ab1a7-1717-4548-aa19-1b89d48f8e1f`
was granted. With the owner's action-time approval, the existing subscription
was updated to Suite Monthly using **Prorate & charge now**. Polar kept the same
subscription ID, marked Suite active at $7/month, and created plan-change order
`e770fcff-b566-4ef1-8859-cb1cc3d07283`. Its invoice credited the unused
Patron period $4.00, charged Suite $7.00 for the same period, and collected a
$3.00 difference plus $0.27 test tax ($3.27 total). The Patron grant became
revoked and the Suite benefit/key ID `71dbd1a9-81f8-46c5-bdd8-c291e820ee12`
was granted. The next invoice shows $7.62 including test tax on October 29.
No full license key or card data is committed.

The upgraded key activated an Apple Development-signed Mail QA build from
`eb3c4655` with an in-memory expired trial, showing **Licensed · Blanc Suite**
and enabling compose/reply. It also activated Patron in an isolated, unpackaged
Browser v1.23.0 PR build and hid checkout and activation controls. Shipping
Mail Keychain migration and production-signed Browser behavior remain unverified.

On October 3, the same upgraded Suite key was entered once into a separate
UUID-scoped Keychain item in signed Mail demo QA. A controlled license-transport
outage after relaunch kept reading available and authoring disabled. This
exposed and fixed misleading Settings text: Mail now says **License check
needed** and explains reconnect/Check Again, rather than suggesting renewal
while claiming a check is still running. Online relaunch of Mail `3b75ae6d`
restored **Licensed · Blanc Suite** and authoring without re-entering the key.
All 26 focused licensing tests and source audits passed. These observations
cover development-signed QA persistence and recovery, not physical network
loss, shipping Keychain migration, or a paid-through/offline-grace guarantee.
The Mail record includes the exact fixture scope and operator notes.

Polar's admin update dialog did **not** show the prorated amount before its
final button. A customer-facing exact quote and explicit confirmation remain
unverified. Monthly Mail and annual Suite purchases, end-of-period revocation,
and the distributed app's offline policy also remain pending. Product and checkout identifiers plus the detailed matrix
are recorded in the Mail repository's `docs/POLAR_MAIL_SUITE_SANDBOX.md` in
[PR #67](https://github.com/bnfy/Postel/pull/67).
