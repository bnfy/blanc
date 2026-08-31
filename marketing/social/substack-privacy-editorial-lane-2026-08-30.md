# Substack editorial lane — privacy, power, and browser incentives

Status: **strategy and draft queue only**. This document does not authorize a
Substack Note, article, reply, subscription, restack, like, or profile change.
Every public action still requires an action-time approval and a fresh claim
check against the current public release.

The first full article draft and its source/claim ledger are in
[`substack-article-business-model-draft-2026-08-30.md`](substack-article-business-model-draft-2026-08-30.md).

Public product baseline: **v1.10.0**.

## Audience and editorial position

Write for privacy-conscious, technically literate readers who care about power,
consent, ownership, and institutional incentives. Do not assume or target an
individual reader's political beliefs. The strongest Blanc position is not a
partisan label; it is an accountable argument:

> A browser's business model is part of the browser.

Substack should be the place where Blanc makes the full case. Short-form social
can show the product or join a conversation; Substack can examine who a browser
is accountable to, which defaults deserve consent, what leaves the device, and
how an independent browser can be funded without an advertising business.

Use the language of incentives and power rather than cartoon-villain language.
“Big Brother” can appear as a cultural reference, but the essay must explain the
actual mechanism instead of implying that every larger browser secretly reads
everything. Do not use “surveillance,” “selling data,” or a competitor's
business-model claim without a current first-party source and exact scope.

## Release-backed Blanc claim ledger

| Claim | v1.10.0 evidence | Required qualification | Verdict |
| --- | --- | --- | --- |
| Blanc is built by the independent studio Bananify without venture funding, investors, or an ads business. | `v1.10.0:site/src/pages/about.astro` | This describes Blanc and Bananify; it does not prove anything about a competitor. | verified |
| Blanc is not funded by selling ads or turning browsing activity into an audience product. | `v1.10.0:site/src/pages/about.astro` | Do not broaden this to “Blanc makes no network requests” or “nothing ever leaves the device.” | verified |
| Blanc is free; optional Patron support funds the work and adds named workspaces and cosmetic benefits. | `v1.10.0:site/src/pages/about.astro` | Named workspace creation requires active Patron; the core browser remains free. | verified |
| Browsing history, downloads metadata, favorites, settings, permissions, cookies, and regular session data are local unless an optional feature explicitly says otherwise. | `v1.10.0:site/src/pages/privacy.astro` | Websites, providers, the network, and explicitly enabled services still observe their own requests. | verified and qualified |
| A fresh install asks before the first pseudonymous launch ping. | `v1.10.0:site/src/pages/privacy.astro`; `v1.10.0:src/main/settings.js`; `v1.10.0:src/main/telemetry.js` | The “Help improve Blanc” choice is presented **on**, not off. The user can turn it off before continuing or later. Do not call this “opt-in telemetry.” | verified and qualified |
| The enabled launch ping contains an installation UUID, random session ID, Blanc version, OS family/coarse major version, and architecture—not browsing content. | `v1.10.0:src/main/telemetry.js`; `v1.10.0:site/src/pages/privacy.astro` | The collector and configured providers still process the limited event as documented. | verified and qualified |
| Profile Sync is off by default and encrypts eligible content on-device so the v1 server stores ciphertext. | `v1.10.0:site/src/pages/privacy.astro`; `v1.10.0:site/src/pages/features/sync.astro` | Open-tab publication is a separate per-device opt-in; no service can erase endpoint or passphrase risks. | verified and qualified |
| Blanc does not sell personal information or share it for cross-context behavioral advertising. | `v1.10.0:site/src/pages/privacy.astro` | Keep the statement exact; do not substitute the broader “Blanc never shares data.” | verified |
| Blanc's blocker ships with hash-pinned EasyList and EasyPrivacy snapshots and does not fetch changing filter resources at startup. | `v1.10.0:site/src/pages/privacy.astro`; packaged ad-block evidence | Blocking reduces known ads and trackers but cannot guarantee every tracker is stopped. | verified and qualified |

## Editorial series

### 1. Your browser's business model is part of the browser

- **Tension:** privacy discussions start in Settings even though incentives are
  established long before a toggle is designed.
- **Payoff:** readers get a clearer question for evaluating any browser: who
  pays for it, and what does that make the product accountable to?
- **Blanc proof:** independent studio, no venture funding or advertising
  business, optional Patron support, core browser free.
- **Competitor rule:** if Chrome/Google, Edge/Microsoft, Brave, Arc/Dia, Zen, or
  another browser is named, verify the exact business-model statement from a
  current annual report, official privacy policy, or official product page.
- **Proposed title:** `Your browser's business model is part of the browser`
- **Proposed subtitle:** `Privacy settings matter. The incentives behind them matter first.`

### 2. The honest version of “no telemetry” is usually more complicated

- **Tension:** absolute privacy slogans hide the questions that informed users
  actually ask: what is sent, when, why, and under whose control?
- **Payoff:** specificity gives the reader something they can evaluate instead
  of demanding trust.
- **Blanc proof:** explain the bounded launch ping, its exact fields, the
  pre-first-ping choice, the initially-on toggle, the off switch, and the
  resettable install ID.
- **Guardrail:** do not call the ping opt-in, anonymous, or nonexistent.
- **Proposed title:** `Blanc does send a usage ping. Here is exactly what it says.`
- **Proposed subtitle:** `Privacy claims should survive contact with the details.`

### 3. A free browser still has to answer: who pays?

- **Tension:** “free” describes the price, not the incentive structure.
- **Payoff:** readers see a concrete alternative to both ad funding and putting
  the basic browser behind a subscription.
- **Blanc proof:** optional Patron; core browser remains free; active Patron is
  required for creating named workspaces.
- **Guardrail:** do not imply Patron is Blanc's only present or future revenue,
  or that optional support guarantees sustainability.

### 4. Privacy is not a private-window costume

- **Tension:** a private mode can keep local history cleaner without making a
  user anonymous to websites, networks, or employers.
- **Payoff:** readers get a usable distinction between local privacy and network
  anonymity.
- **Blanc proof:** private tabs stay out of Blanc history, session restore,
  reopen-closed-tab, and Profile Sync; saved files and external observers remain.

### 5. Blocking should not begin with installing a privileged stranger

- **Tension:** people often have to add another vendor and permission surface
  before their browser stops loading known advertising and tracking resources.
- **Payoff:** Blanc ships a reviewed blocker with the browser and updates its
  pinned lists with signed releases.
- **Guardrail:** never promise universal blocking or anonymity.

## Note-sized prompts

These are draft directions, not approved posts:

1. `privacy features live inside business models. “what does this browser need from me to make money?” is a product question, not just a finance question.`
2. `the most trustworthy privacy claim is the one that includes its limits.`
3. `Blanc does have a usage ping. you see the choice before the first one, can turn it off, and can read the exact five fields it carries. privacy should survive specificity.`
4. `a browser can be free without turning browsing activity into an audience product. Blanc is independently built; optional Patron support funds the work.`
5. `private browsing and anonymous browsing are not the same promise. a browser should be honest about which one it can actually keep.`

## Voice and distribution rules

- Lead with the institutional tension or human consequence, not a feature list.
- Use direct, plain language; avoid corporate reassurance and moral grandstanding.
- Make Blanc's limits visible in the same post as its strengths.
- Prefer one sourced comparison per essay to an unsourced list of villains.
- Do not turn replies into repeated Blanc pitches; add a useful thought first.
- Use Notes to test a thesis. Expand only the ideas that earn replies, profile
  visits, or follows into full articles.
- Measure publication subscribers and public profile followers separately.

## Recommended first move

Review the completed draft of **“Your browser's business model is part of the
browser.”** It introduces the editorial thesis without recycling tab-overload
content and creates a foundation for later pieces about telemetry, sync,
blocking, and private tabs. Its external comparison uses current Google and
Alphabet first-party sources, and its release-backed claim ledger is complete.
It remains unpublished until the article copy, a new 5:2 header, and the final
action are each approved at execution time.
