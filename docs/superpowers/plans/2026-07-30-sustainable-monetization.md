# Sustainable Monetization — Search Partnerships, Blanc Plus, and Referrals

**Date:** 2026-07-30
**Status:** Proposed
**Branch:** `codex/post-1.0-development`
**Predecessor:** `docs/superpowers/plans/2026-07-06-monetization-phase1.md`

## Goal

Build recurring revenue capable of funding Chromium upgrades, security work,
signing, infrastructure, support, and continued product development while
keeping Blanc free and preserving its privacy-first position.

Phase 1 already established the $19 one-time Blanc Supporter license, cosmetic
perks, Polar checkout, support links, grants, and a B2B line. This phase does
not replace or weaken those commitments. It adds three complementary revenue
engines:

1. Search-provider distribution revenue as the operating baseline.
2. Blanc Plus subscriptions for advanced productivity and hosted continuity.
3. A small number of transparent, privacy-aligned referral partnerships.

Donations and one-time Supporter purchases remain supplemental rather than part
of the operating forecast.

## Non-negotiable product rules

- Never sell or share browsing history, typed addresses, search queries,
  credentials, or user profiles.
- Never create a Blanc advertising profile.
- Never silently change an existing user's search engine.
- Never weaken ad/tracker blocking for a commercial partner.
- Never paywall blocking, private browsing, security updates, threat
  protection, screen sharing, or ordinary browser functionality.
- Every commercial placement is labeled and removable.
- Normal tabs, Favorites, history, and explicit user actions always outrank
  commercial suggestions.
- Partner attribution is added only under a signed agreement and only to
  searches or links the user deliberately sends to that partner.
- Existing Supporter licenses remain permanent, offline-capable, and trusted
  forever. A subscription must use a separate entitlement model.
- No monetization work lands in or rebuilds the frozen 1.0.0 RC2 release.

## Revenue mix target

These are portfolio targets, not forecasts:

| Channel | Target share | Purpose |
|---|---:|---|
| Search distribution | 50–65% | Predictable baseline tied to active usage |
| Blanc Plus | 25–40% | Recurring direct customer relationship |
| Partner referrals | 0–15% | Supplemental, deliberately capped |
| Supporter, donations, grants, B2B | Excluded from baseline | Upside and project funding |

No single commercial counterparty should exceed 50% of total revenue once Blanc
has enough scale to diversify.

## Free and paid product boundary

### Always free

- Ad/tracker blocking and per-site controls
- Private browsing
- Security and threat-protection features
- Browser and Chromium security updates
- Display sharing, downloads, Favorites, and history
- Tabs, groups, profiles, and basic workspace organization
- Basic E2EE Profile Sync and current Tab Sync behavior
- Import, export, and data portability

### Blanc Plus candidates

Plus should sell advanced continuity and customization, not safety:

- Encrypted history and reading-list sync
- Synced workspace, profile, and split-view layouts
- Extended session archive and cross-device recovery
- Advanced workspace templates
- Additional Island themes, icon collections, and seasonal packs
- Stable preview channel access
- Later: shared workspaces and family/team plans

Do not launch Plus until at least one continuity feature and one customization
feature are complete and independently useful.

## Pricing decision

Initial pricing to validate:

- Blanc Plus Monthly: **$4/month**
- Blanc Plus Annual: **$36/year**
- Blanc Supporter: retain the existing **$19 one-time** product
- Existing Supporter buyers: label as **Founding Supporters** and preserve every
  promised permanent perk

Polar models monthly and annual billing as separate recurring products. Create
both products and present them together at checkout. Use Polar's customer portal
for cancellation, invoices, and payment-method changes.

References:

- <https://polar.sh/docs/features/subscriptions/introduction>
- <https://polar.sh/docs/features/products>

## Planning economics

Replace these assumptions with signed partner terms and observed conversion:

| Monthly active users | Search at $0.75–$1.50/user/year | Plus at 2% × $36 | Referral assumption | Illustrative gross |
|---:|---:|---:|---:|---:|
| 25,000 | $18,750–$37,500 | $18,000 | $3,000–$8,000 | $39,750–$63,500 |
| 100,000 | $75,000–$150,000 | $72,000 | $10,000–$30,000 | $157,000–$252,000 |
| 250,000 | $187,500–$375,000 | $180,000 | $25,000–$60,000 | $392,500–$615,000 |

These figures are scenario tools, not public claims. Search revenue may be zero
until a provider accepts Blanc into a distribution program.

---

## Workstream A — Measurement and partner brief

**Owner:** Founder/business
**Timing:** First 30 days after 1.0 launch
**Engineering dependency:** None

- [ ] Record the 1.0 launch baseline:
  - installer downloads by platform;
  - DAU, WAU, and MAU from the existing aggregate telemetry worker;
  - launch and version adoption;
  - 30-day retention when enough time has elapsed;
  - Supporter purchases and conversion;
  - site-to-download conversion where already available.
- [ ] Keep the telemetry payload unchanged during initial partner outreach.
  Do not add search counts, queries, URLs, or per-user behavioral events.
- [ ] Create `docs/business/search-partner-brief.md` containing:
  - Blanc's positioning and differentiators;
  - supported desktop platforms;
  - active-user and growth figures;
  - default and selectable search engines;
  - privacy and telemetry boundaries;
  - requested commercial structure;
  - contact and company details.
- [ ] Prepare a private one-page partner deck using the same facts.
- [ ] Update the deck monthly; never publish confidential commercial terms.

**Exit gate:** The brief contains verified post-launch usage figures and can be
sent without making unsupported growth or privacy claims.

## Workstream B — Search-provider outreach

**Owner:** Founder/business
**Timing:** Days 15–60
**Engineering dependency:** None until an agreement is signed

Approach the providers Blanc already supports before expanding the engine list:

- [ ] DuckDuckGo
- [ ] Brave Search
- [ ] Microsoft/Bing
- [ ] Google only if an appropriate independent-browser distribution contact
  becomes available

For each provider, request written answers covering:

- [ ] Payment basis: per search, revenue share, minimum guarantee, or hybrid
- [ ] Eligible countries and platforms
- [ ] Required attribution parameters
- [ ] Reporting cadence and audit rights
- [ ] Minimum traffic or active-user thresholds
- [ ] Default-placement or exclusivity requirements
- [ ] Data received beyond an ordinary direct search request
- [ ] Contract term, termination, and attribution-removal requirements
- [ ] Brand and product-placement requirements

Reject or renegotiate terms that require:

- exclusive default status;
- sending data to Blanc before the user submits a search;
- persistent user identifiers controlled by Blanc;
- hidden commercial placement;
- ad-block exceptions;
- suppression or degradation of competing engines.

Vivaldi's disclosed model is the reference pattern: user-selectable partner
search engines, removable partner placements, and no sale of browsing profiles.

Reference: <https://vivaldi.com/blog/vivaldi-business-model/>

**Exit gate:** At least one signed agreement has acceptable privacy,
attribution, reporting, termination, and non-exclusivity terms.

## Workstream C — Supporting-search product integration

**Owner:** Engineering + design/content
**Timing:** After Workstream B exit gate
**Dependency:** Signed provider agreement

- [ ] Add a main-process partner configuration containing:
  - provider id;
  - eligible regions/platforms;
  - contracted search URL template;
  - attribution version;
  - agreement start/end state.
- [ ] Keep secrets out of the application. A browser-distribution identifier is
  public once shipped and must never be treated as authentication.
- [ ] Extend the search-engine presentation metadata with a derived
  `supportsBlanc` label; do not expose contract values to renderers.
- [ ] Show “supports Blanc” in first-run search selection and Settings without
  ranking or visual coercion.
- [ ] Preserve existing users' current search-engine selection during upgrades.
- [ ] Send the exact query directly to the chosen provider. Blanc must not proxy,
  log, or inspect it.
- [ ] Add unit tests for:
  - partner URL generation;
  - no attribution on non-partner engines;
  - region/platform eligibility;
  - malformed or expired partner configuration;
  - current-default behavior after settings changes;
  - private-tab behavior matching ordinary explicit searches.
- [ ] Update:
  - privacy policy;
  - Settings disclosure;
  - security page;
  - release notes;
  - public business-model page.
- [ ] Add a remote kill switch only if it can disable attribution without
  becoming a general remote-configuration channel. A signed, narrowly scoped
  provider-state document is preferred.

**Exit gate:** Tests prove that attribution occurs only for a user-selected,
eligible partner engine and no search request passes through Blanc.

## Workstream D — Separate Blanc Plus entitlement

**Owner:** Engineering
**Timing:** Months 2–4
**Dependency:** Polar recurring products configured

Do not overload `settings.supporter` or `supporterActive`. That record represents
a permanent one-time purchase and must retain its trust-forever semantics.

- [ ] Write an entitlement design before implementation covering:
  - device activation;
  - subscription status and paid-through date;
  - cancellation at period end;
  - failed-payment recovery;
  - offline grace;
  - device replacement;
  - account deletion;
  - downgrade behavior;
  - clock rollback and corrupt local state.
- [ ] Create separate monthly and annual Polar products.
- [ ] Configure a minimum 30-day offline/payment-failure grace period.
- [ ] Persist only a derived, device-local Plus entitlement. Never include
  license, customer, or subscription identifiers in Profile Sync.
- [ ] Perform checkout and validation in the main process or a narrowly scoped
  Blanc service. Renderers receive only:
  - `plusActive`;
  - `validThrough`;
  - `graceState`;
  - customer-portal URL.
- [ ] Cache successful validation and avoid startup-blocking network calls.
- [ ] A Polar or Blanc service outage must not affect browser startup or free
  features.
- [ ] On expiry, retain user data and make it exportable. Disable only Plus
  operations; never delete synced history, layouts, or archives.
- [ ] Add tests for active, canceled, past-due, grace, offline, expired, corrupt,
  and Supporter-plus-Plus combinations.
- [ ] Complete an entitlement threat review before shipping.

**Exit gate:** Subscription loss cannot remove user data, break startup, weaken
free features, or alter permanent Supporter access.

## Workstream E — Blanc Plus v1 package

**Owner:** Product + engineering
**Timing:** Months 3–6
**Dependency:** Entitlement design plus applicable roadmap foundations

- [ ] Select one primary continuity feature:
  - encrypted session archive; or
  - synced workspaces/layouts; or
  - encrypted history + reading-list sync.
- [ ] Select one customization bundle:
  - Island themes;
  - additional icon collection;
  - workspace templates.
- [ ] Write the free/Plus acceptance contract before implementation.
- [ ] Confirm that free users can export every data type used by Plus.
- [ ] Add a 14-day trial only after the paid value is complete and stable.
- [ ] Build an in-app comparison that describes benefits without countdowns,
  modal nags, or degraded free states.
- [ ] Show upgrade prompts only from the related feature surface or Supporter
  section.
- [ ] Add restore and downgrade acceptance scenarios.
- [ ] Launch annual and monthly pricing together.

**Exit gate:** A user can understand and receive meaningful Plus value without
buying access to privacy, safety, or basic browsing.

## Workstream F — Privacy-aligned referral pilot

**Owner:** Founder/business + privacy review
**Timing:** Months 3–6
**Dependency:** Written partner agreement

- [ ] Evaluate at most three candidates across VPN, email aliases, encrypted
  storage, identity protection, or another browser-adjacent privacy service.
- [ ] Score each candidate on:
  - privacy policy and data retention;
  - independent security record;
  - product usefulness;
  - refund and cancellation experience;
  - supported countries;
  - attribution method;
  - brand fit;
  - expected revenue;
  - conflict with Blanc blocking or sync.
- [ ] Select no more than one pilot partner.
- [ ] Place the pilot under a labeled “Services that support Blanc” section in
  Settings or on the website.
- [ ] Do not insert it into personal Favorites.
- [ ] Do not add it to the Island or Quick Switcher during the pilot.
- [ ] Use an ordinary removable affiliate link; never silently allowlist partner
  tracking requests.
- [ ] Measure only aggregate conversion supplied by the partner.
- [ ] Review complaints, conversion, and revenue after 90 days.
- [ ] Remove the integration if it produces meaningful trust cost or negligible
  revenue.

**Exit gate:** One clearly labeled, removable offer earns measurable revenue
without adding browser telemetry or privileged ad-block behavior.

## Workstream G — Transparency and governance

**Owner:** Founder/business + content
**Timing:** Before the first commercial integration ships

- [ ] Publish a “How Blanc makes money” page listing:
  - every revenue category;
  - current commercial partners;
  - what triggers a payment;
  - what data Blanc does and does not receive;
  - how to disable or remove each placement.
- [ ] Link it from Settings, the privacy policy, and the website footer.
- [ ] Publish revenue mix as percentage bands annually once revenue is material.
- [ ] Document partner additions and removals in release notes.
- [ ] Review every agreement annually against the non-negotiable product rules.
- [ ] Maintain a partner-removal runbook so an agreement can end without an
  emergency browser release where practical.

**Exit gate:** A user can determine who pays Blanc and why without reading legal
terms or reverse-engineering search URLs.

## Deferred options

These remain possible but are not part of the first sustainable-revenue release:

- Local, optional Direct Match-style commercial suggestions
- Family or team Plus plans
- Managed enterprise policies
- White-label/kiosk browser contracts
- OEM distribution
- Paid support agreements

Do not build Direct Match until search and Plus performance is known. If later
approved, matching must remain local, commercial rows must be labeled, and a
single setting must disable the feature.

## Execution timeline

### Days 0–30 after 1.0

- [ ] Establish the launch and retention baseline
- [ ] Write the partner brief and private deck
- [ ] Begin search-provider introductions
- [ ] Draft the public monetization promise

### Days 31–90

- [ ] Negotiate search terms
- [ ] Complete the Plus entitlement design
- [ ] Configure Polar subscription products in sandbox
- [ ] Select the first Plus continuity feature
- [ ] Evaluate referral candidates

### Months 3–6

- [ ] Ship a search integration only if contracted
- [ ] Implement and verify the separate Plus entitlement
- [ ] Ship Plus with completed, useful benefits
- [ ] Run one referral pilot
- [ ] Publish the business-model transparency page

### Month 6 review

- [ ] Compare actual search yield to partner quotes
- [ ] Measure Plus trial, paid conversion, churn, and annual/monthly mix
- [ ] Measure referral revenue and support burden
- [ ] Reforecast against 25k, 100k, and 250k MAU scenarios
- [ ] Decide whether to invest in another provider, additional Plus value, B2B,
  or external capital

## Definition of done

This phase is complete when:

- Blanc has at least two recurring or usage-linked revenue sources;
- no source depends on selling personal or browsing data;
- existing Supporter promises remain unchanged;
- free security and privacy features remain complete;
- partner relationships and user controls are publicly documented;
- revenue reporting can distinguish search, Plus, referrals, and supplemental
  income;
- actual results have replaced the planning assumptions in the operating model.
