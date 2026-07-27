# Using 1Password fill in the local dev build

How to run Blanc's built-in 1Password fill on this branch (`feature/1password-fill`).

> **Dev-only, and deliberately so.** This is still the **spike** implementation:
> the code carries its `SPIKE` markers and is gated to unpackaged builds (or an
> explicit `BLANC_1P_SPIKE=1`), so it never activates in a normal release. It is
> **not** the shippable engine, and distribution is **shelved** — 1Password
> declined to pre-approve the integration under their API/SDK Terms, so shipping
> it to other people is an open legal question, not a technical one. See
> [`1password-legal-inquiry.md`](1password-legal-inquiry.md). Personal use
> against your own vault was never in question — that's what this guide is for.

In a dev build the fill is **on by default** (`ONE_PASSWORD_SPIKE_ENABLED = !app.isPackaged || BLANC_1P_SPIKE === '1'`), so no flag is needed — the one required input is your 1Password **account identifier** via `BLANC_1P_ACCOUNT`.

## 1. Be on this branch

```bash
git checkout feature/1password-fill
npm install          # only if `npm start` later reports a missing @1password/sdk
```
(The code isn't on `main` — it was torn down there; it lives here.)

## 2. One-time 1Password app setup

- 1Password 8 desktop app installed in `/Applications`, signed in, and **unlocked**.
- **Settings → Developer** → enable the SDK / "Integrate with other apps" toggle (label varies by app version — it's the Developer setting that lets external apps connect through the SDK). `DesktopAuth` can't connect without it.
- **Settings → Security → Touch ID** enabled (for the approval prompt).

## 3. Find your account identifier

`DesktopAuth` accepts your account name (top-left of the 1Password app), your sign-in email/address, or your account UUID. To list them:

```bash
op account list        # shows URL / EMAIL / USER ID for each configured account
```

Use whichever value worked previously, or start with the email.

## 4. Run

```bash
BLANC_1P_ACCOUNT="you@example.com" npm start
```

Optional — export it so plain `npm start` works (it's an identifier, not a secret, but keep it out of git):

```bash
echo 'export BLANC_1P_ACCOUNT="you@example.com"' >> ~/.zshrc
```

## 5. Use it

1. Open a **login page** (http/https) that has a matching Login item in your vault.
2. Press **⌥⌘P** (Option-Command-P).
3. First trigger per ~10-minute SDK session: approve the 1Password prompt (Touch ID or password).
   **In dev the prompt names "Electron," not "Blanc"** — expected, because the dev binary is unsigned. A signed build names Blanc.
4. **You may get a confirmation dialog** — see below. Otherwise the fields fill
   and the terminal logs `[1p-spike] filled user+pass`.

### Why a dialog sometimes appears

Blanc fills **silently** only when the site itself declares which field holds
your existing password (`autocomplete="current-password"`, uncontradicted). Most
major sites do.

When the site doesn't say, Blanc *infers* the field from page structure and
wording — and those wording signals are English-only, so they'd read a localized
signup page as a login form. Rather than guess silently with your password, it
asks:

> **Fill your \<item\> password into this form?**
> *\<host\> didn't identify its sign-in field, so Blanc inferred it. Only continue
> if this is a sign-in form — not a sign-up or password-reset page.*

Choose **Fill** to proceed (`filled …`) or **Cancel** (`user-declined` — nothing
is decrypted). The dialog is language-independent, which is why it, and not a
longer keyword list, is the actual safety boundary.

### Multi-step logins (Google/Microsoft-style)

Two presses, no state kept in between:

1. Username screen → **⌥⌘P** → `filled user-only (multi-step step 1)`
2. Advance to the password screen → **⌥⌘P** again → `filled pass-only …`

## Troubleshooting — read the `[1p-spike]` line in the terminal

| Log line | Meaning / fix |
|---|---|
| *(nothing at all after ⌥⌘P)* | You're on a blank new tab — focus is in the address bar, which has no chord listener. Navigate to a real page first. |
| `no-match <host>` | No Login item whose website host matches. Add/fix the item's website in 1Password (exact host; leading `www.` is fine). |
| `non-http-noop` | Active tab isn't http/https (internal page, `file://`, blank tab). Go to the login page. |
| `chooser-cancel` | You dismissed the multi-match chooser. |
| `setup-error BLANC_1P_ACCOUNT is not set` | Env var missing — pass it or export it. |
| `fill-error` / an SDK or auth error | 1Password app not running/unlocked, or the Developer "integrate" toggle is off. |
| `abort-navigated` / `abort-url-changed` / `abort-tab-changed` / `abort-window-changed` / `abort-wc-changed` | The page navigated, or you switched tab/window, or the tab lost focus, while the flow was waiting on 1Password or a dialog — the fill aborts for safety and writes nothing. Retry. |
| `empty-item` | The matched 1Password item has neither a username nor a password in its built-in fields. Check the item — Blanc reads the standard `username`/`password` fields only, not custom ones. |
| `nothing-filled` | A field was identified but nothing was written — usually the item lacks the value that field needed (e.g. a password-only screen matched an item with no password). |
| `no-active-tab` | No active tab at trigger time; nothing to fill. |
| `origin-or-focus-mismatch` | The page changed or lost focus between trigger and injection. Retry. |
| `no-fillable-field` | Nothing safe to fill: a **signup or password-reset page** (declined on purpose — see below), a form with only a search box, a login inside an iframe or shadow DOM, or a page whose fields carry no login signals at all. Not a bug. |
| `selection-changed` | The page altered its form between Blanc choosing the field and writing to it, so the authorization no longer matched — **nothing was written**. Retry; if it repeats, the page is rewriting itself continuously. |
| `user-declined` | You chose Cancel at the confirmation dialog. Nothing was decrypted. |
| `filled user-only (multi-step step 1)` | Username screen filled — press ⌥⌘P again on the password screen. |
| `filled pass-only (username field not found)` | Password filled; no confident username field. Expected on a password-only screen, and on form-less pages (see below). |

## Notes & limits (this is the spike, not the shippable engine)

- **Chrome/overlay changes need a relaunch, not ⌘R** — but the fill logic is main-process, so a normal `npm start` picks up any code change.
- **Matching is by registrable domain (eTLD+1)** — an item saved for `google.com`
  fills on any `*.google.com`. Per-tenant hosts stay separate (`alice.github.io`
  never matches `bob.github.io`), and `localhost`/raw IPs fall back to exact-host.
  1Password's own per-item URL rules (`AnywhereOnWebsite`/`ExactDomain`/`Never`)
  are **not** read — Blanc applies one uniform rule.
- **Signup and password-reset pages are declined on purpose.** Writing your
  *existing* password into a "Create a password" box is the failure this feature
  most has to avoid, so Blanc refuses when a form has two or more password fields
  (new + confirm), when a field is marked `new-password`, or when the page reads
  as a registration flow. Expect `no-fillable-field` there — the password box
  staying empty on a signup page is correct behavior, not a miss.
- **Form-less pages fill the password only.** On a login widget with no `<form>`
  (common in SPAs), every stray input on the page shares one scope, so a username
  could belong to an unrelated widget — Blanc fills the password and leaves the
  username to you. A `<form>`, `fieldset`, `[role=form]`, or a login/auth-classed
  container is enough to restore both.
- **Username selection needs positive evidence.** A search or newsletter box is
  never filled, and an ambiguous page no-ops rather than guessing.
- Still unsupported: shadow-DOM inputs, cross-origin iframes, TOTP, saving new or
  updated items, and login-vs-signup disambiguation beyond the rules above.
- Credentials are handled **main-process only** — never persisted, logged, synced,
  or transmitted; only the selected item is decrypted, and only after a fillable
  field is confirmed. The credential-bearing injection runs in a **dedicated
  isolated world** (id 1001), so page scripts can't hook the setter or read the
  value in flight. Once written into a field, the page can read it — inherent to
  every autofill.
