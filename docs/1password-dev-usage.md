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
4. **You may get a confirmation dialog** (inferred field) or a **username
   picker** (several logins match) — see below. Otherwise the fields fill and the
   terminal logs `[1p-spike] filled user+pass`.

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

### When several logins match

Most of the time you won't see a picker. Matches are ranked by how well the
saved website fits the page — an item saved for the **exact host** beats one
saved for the **parent domain**, which beats a **sibling subdomain** — and only
the best tier is offered. Where one item clearly fits, Blanc fills it without
asking (on `www.google.com` this collapses a whole family of `google.com` items
to one).

When several items genuinely tie, the Island shows a list **labelled by
username** — the only field that reliably tells near-duplicate items apart — with
the item title and matched host beneath each. **↑/↓** move the highlight,
**Enter** fills the highlighted row, and **Cancel** / **Escape** / a click
outside dismisses it. At most **10** are shown; if more matched, the last line
says how many were left out (narrow it in 1Password). While the picker is up the
rest of the Island is inert — you can't type an address or open a tab until you
pick or cancel.

Reading those usernames means Blanc decrypts each listed item — but only when a
picker is actually needed, never more than 10, and only after the page has been
judged fillable. Blanc doesn't deliberately keep a decrypted item once it has
taken the username; only the one you pick is read again to fill it. (JavaScript
can't guarantee a released value is collected or zeroed, so this describes what
Blanc holds, not what remains in process memory.)

## Troubleshooting — read the `[1p-spike]` line in the terminal

| Log line | Meaning / fix |
|---|---|
| *(nothing at all after ⌥⌘P)* | You're on a blank new tab — focus is in the address bar, which has no chord listener. Navigate to a real page first. |
| `no-match <host>` | No Login item shares a **registrable domain** with this page. An item saved for `example.com` covers any `*.example.com`, but not a different registrable domain — so `example.co.uk` or a separate tenant host (`you.github.io`) needs its own entry. Add or fix the item's website field in 1Password (`www.` is ignored). |
| `non-http-noop` | Active tab isn't http/https (internal page, `file://`, blank tab). Go to the login page. |
| `chooser-cancel dismissed` / `chooser-cancel escape` | You cancelled the picker — the Cancel button or a click outside (`dismissed`), or Escape (`escape`). Nothing was filled. |
| `chooser-cancel blur` / `chooser-cancel tab-changed` | The picker closed because you switched away — to another app (`blur`) or another tab (`tab-changed`). Nothing was filled. |
| `chooser-cancel mode-replaced` / `chooser-cancel hidden` / `chooser-cancel window-closed` | The picker was dismissed by another Blanc action — opening another Island panel (`mode-replaced`), the overlay being hidden another way (`hidden`), or the window/overlay closing (`window-closed`). Nothing was filled. |
| `chooser-cancel timeout` | The picker sat open for 60s and closed itself. Press ⌥⌘P again. |
| `chooser-cancel invalid-reply` | The picker sent a malformed reply and was abandoned (shouldn't happen in normal use). Press ⌥⌘P again. |
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
- **Ties are ranked, then picked.** When several items share the registrable
  domain, Blanc keeps only the best host tier (exact host > parent domain >
  sibling subdomain), so usually one item wins and fills without a prompt. A
  genuine tie shows the username picker — see [When several logins
  match](#when-several-logins-match).
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
- **Where your credential actually goes.** Blanc never persists, logs, syncs or
  transmits it, and decrypts only the one selected item — and only after a
  fillable field is confirmed, plus your approval if the target was inferred. But
  it does not stay in the main process: to fill a form it necessarily crosses
  into the renderer, and then into the page's own DOM. Concretely:
  1. Decrypted in the **main process** (never written to disk or the network).
  2. Sent to the renderer and evaluated in a **dedicated isolated world** (id
     1001) — a JS realm the page cannot read or hook, so it cannot tamper with
     the setter or scrape the value in flight.
  3. **Written into the form field**, at which point it is ordinary page state:
     the site's own scripts can read it, and an `input`/`change` handler runs
     immediately afterward. That is true of every autofill, including
     1Password's own extension — filling a field and keeping it secret from the
     page are mutually exclusive.

  So the accurate guarantee is: confined to the main process and the **one
  verified field** you authorized, never anywhere else.
