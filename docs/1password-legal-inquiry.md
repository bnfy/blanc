# 1Password SDK — terms/compliance inquiry

**Purpose:** Blanc's built-in 1Password fill (branch `feature/1password-fill`) is technically proven feasible (see `docs/superpowers/specs/2026-07-12-1password-autofill-spike-design.md` → Findings). Before building the *shippable* engine, one clause in 1Password's [API and SDK Terms of Service](https://1password.com/legal/api-sdk-terms-of-service) — **§4.1(e)**, the competitive/replication restriction — needs written confirmation from 1Password. This file holds the inquiry and (later) their reply, so the answer lives beside the code that depends on it.

**Status:** ☐ drafted · ☐ sent (date: ____) · ☐ reply received (date: ____) · ☐ resolved

> **Do not build the shippable engine until this is resolved.** Personal/dev use of the current spike code is fine (a user running a local integration against their own vault); the open question is distribution to end users.

---

## Research summary (2026-07-12, two independent passes converged)

Apparently **permitted by the published terms; no partner program or vendor allowlist required** — `DesktopAuth` is user-authorized with no code-signature gate (the barrier that blocked the old native-messaging path). Supporting points:

- **Code license is MIT** (`@1password/sdk` + native `@1password/sdk-core`).
- The **API/SDK Terms grant** "incorporate and distribute the SDK… as part of an Application, on an integrated (not standalone) basis."
- The [desktop-integration security model](https://developer.1password.com/docs/sdks/desktop-app-integrations/) explicitly anticipates third-party binaries it can't code-verify, leaving the trust decision to the user.
- Autofill is a **documented SDK use case** ([SDK concepts](https://www.1password.dev/sdks/concepts/) defines website-matching rules + credential field IDs) — *supporting evidence, not explicit permission for a third-party browser implementation*.

**Open clause — §4.1(e):** no product that "competes directly or indirectly with 1Password… or replicates a substantial portion of the functionality of the Services." Blanc reads as complementary (requires 1Password installed + subscribed; no vault/sync of its own), but "indirectly" is broad enough to warrant written confirmation.

**Caveat:** the above is an AI-assisted reading of a legal document, not legal advice. A human (ideally counsel) should read the actual §4.1(e) text before a shipping commitment.

**Accurate note on the auth model:** `DesktopAuth` grants the approved process temporary access to the *whole authorized account* (expiring per 1Password's session rules; approval via Touch ID, account password, or another configured method). Blanc's v1 read-only behavior is a function of it calling only list/read operations — **not** a scope limit imposed by the SDK. Don't describe it as "per-use" or "read-only authorization."

---

## Draft inquiry email

**To:** 1Password developer / partner relations *(if no direct contact: developer-portal support or `support@1password.com`, asking to be routed to developer relations)*
**Subject:** API/SDK Terms question — independent browser using `DesktopAuth` for opt-in autofill (§4.1(e))

Hello,

I'm building **Blanc**, an independent Electron-based web browser (not affiliated with, endorsed by, or certified by 1Password). Blanc has no browser-extension runtime, so rather than an extension I'd like to integrate 1Password directly via the JavaScript SDK's desktop app integration (`DesktopAuth`). Before investing in a shippable implementation, I want to confirm this is permitted under the API and SDK Terms of Service.

**Intended behavior (v1):**

In v1, Blanc will invoke only list and read operations. Users must explicitly enable SDK integration and authorize the Blanc process through the 1Password desktop app. Authorization is scoped per account and process and expires according to 1Password's documented session rules. Blanc will decrypt only the user-selected item and will not persist, log, sync, or transmit retrieved credentials. Blanc does not provide its own vault, sync, or password-management service — it retrieves a user-selected item from the user's existing 1Password account and fills it into the matching page.

To be precise about the security model: I understand `DesktopAuth` grants the approved process temporary access to the authorized account (via Touch ID, account password, or another configured method), not a per-item or read-only grant. Blanc's read-only behavior is a property of the operations it calls, not a limit on the authorization your SDK issues.

Your SDK documentation describes website-matching behavior for autofill, which I read as supporting evidence that autofill is an intended SDK use. I recognize, though, that it doesn't specifically address a third-party browser distributing this to end users — which is exactly why I'm asking directly rather than assuming.

**My questions:**

1. Does this integration comply with **§4.1(e)** of the API and SDK Terms (the restriction on products that compete directly or indirectly with 1Password, or replicate a substantial portion of the Services' functionality)? Blanc is intended to be complementary — it requires an active 1Password installation and subscription and adds no vault or sync of its own — but I'd appreciate your confirmation given the breadth of "indirectly."

2. Is any **security review, registration, or written approval** required before public distribution of an application that bundles the SDK and uses `DesktopAuth`?

3. Are there specific **end-user terms, disclaimers, or brand-usage requirements** you'd want included beyond what's in the API/SDK Terms and Brand Guidelines?

I'm glad to share more detail on the implementation or credential-handling design. Thank you for your time.

Best regards,
[Your name] — Bananify (the studio behind Blanc)
[contact email] · [blancbrowser.com]

---

## Shipping obligations to fold into the real-engine spec (once §4.1(e) is cleared)

Paperwork/policy layer — *not code blockers*, and the spike already satisfies the data-handling ones:

- End-user terms: 1Password warranty/support disclaimer, no 1Password participation in the agreement, protection against reverse-engineering bundled components, appropriate liability limits.
- Privacy-policy disclosure of the integration and credential handling.
- Use of the 1Password name/logo strictly per their Brand Guidelines; no implied endorsement/certification.
- Reasonable credential-grade security; notify 1Password of relevant incidents within 24 hours.
- Track SDK versions — v0 releases have short support windows and the terms require compatibility with current versions.

**Already satisfied by the spike's design:** reveal-one-item (no bulk decrypt), no persist/log/sync/transmit of credentials, main-process-only handling, data minimized to the selected item's built-in fields.

---

## 1Password's reply

*(paste verbatim when received — date, contact, and their answer to each question)*
