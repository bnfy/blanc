# Mail and Suite sandbox setup — updated October 3, 2026

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
