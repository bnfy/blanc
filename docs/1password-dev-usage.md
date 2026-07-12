# Using 1Password fill in the local dev build

How to run Blanc's built-in 1Password fill on this branch (`feature/1password-fill`). This is the spike implementation — dev/personal use only; see [`1password-legal-inquiry.md`](1password-legal-inquiry.md) before anything ships.

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
4. Username + password fill; the terminal logs `[1p-spike] filled user+pass`.

## Troubleshooting — read the `[1p-spike]` line in the terminal

| Log line | Meaning / fix |
|---|---|
| *(nothing at all after ⌥⌘P)* | You're on a blank new tab — focus is in the address bar, which has no chord listener. Navigate to a real page first. |
| `no-match <host>` | No Login item whose website host matches. Add/fix the item's website in 1Password (exact host; leading `www.` is fine). |
| `non-http-noop` | Active tab isn't http/https (internal page, `file://`, blank tab). Go to the login page. |
| `chooser-cancel` | You dismissed the multi-match chooser. |
| `setup-error BLANC_1P_ACCOUNT is not set` | Env var missing — pass it or export it. |
| `fill-error` / an SDK or auth error | 1Password app not running/unlocked, or the Developer "integrate" toggle is off. |
| `abort-navigated` / `abort-url-changed` / `abort-tab-changed` / `abort-window-changed` | The page navigated, or you switched tab/window, during approval — the fill aborts for safety. Retry. |
| `origin-or-focus-mismatch` | The page changed or lost focus between trigger and injection. Retry. |

## Notes & limits (this is the spike, not the shippable engine)

- **Chrome/overlay changes need a relaunch, not ⌘R** — but the fill logic is main-process, so a normal `npm start` picks up any code change.
- Matching is **exact-host only** (no subdomains/redirects/1Password per-item rules), field detection is **first visible password field**, injection is **main-world**, and there's **no save/TOTP/iframe** support. These are the known shortcuts (spec Non-goals) that the real engine addresses.
- Credentials are handled **main-process only** — never persisted, logged, synced, or transmitted; only the selected item is decrypted.
