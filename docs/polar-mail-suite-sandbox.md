# Mail and Suite sandbox setup — September 24, 2026

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
visible. Annual Suite purchase,
end-of-period revocation, offline/relaunch, and the confirmed prorated
Patron-to-Suite upgrade remain pending. Product and checkout identifiers plus
the detailed matrix are recorded in the Mail repository's
`docs/POLAR_MAIL_SUITE_SANDBOX.md` in
[PR #67](https://github.com/bnfy/Postel/pull/67).
