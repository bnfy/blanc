# Google OAuth compatibility coverage

Blanc has two complementary OAuth checks. Neither enters credentials or
completes a real account login.

## Deterministic Electron contract

```bash
npm run test:oauth:desktop
```

`desktop.test.js` launches the real Electron app against two local HTTP origins
and exercises both OAuth shapes Blanc must support:

- an explicit popup window;
- a featureless, tab-style `window.open` child.

Each provider fixture redirects across origins and posts its result back to the
relying page. The test asserts that:

- `window.opener` survives at the provider and callback;
- both child styles start from trusted Electron mouse input;
- the callback reaches the relying page through `postMessage`;
- the UA omits Blanc/Electron tokens;
- `navigator.userAgentData` advertises Google Chrome with consistent
  high-entropy metadata;
- low-entropy `Sec-CH-UA` request headers advertise Google Chrome;
- Electron's unusable FedCM surface is hidden;
- `window.chrome.app`, `csi`, and `loadTimes` exist in both child styles.

This test is deterministic and runs in CI under `xvfb`.

## Live third-party canary

```bash
npm run test:oauth:live
```

The live canary launches a throwaway Blanc profile with normal ad blocking,
opens ChatGPT and Instacart, follows each visible Google-login entry point, and
passes when a rendered `accounts.google.com` sign-in/account/password page is
reached. It fails on the known `gis_transform` 400, insecure-browser rejection,
blocked-access page, missing controls, or timeout.

It deliberately stops before credential entry. It is opt-in rather than CI:
third-party labels and page structure can change independently of Blanc, and a
site redesign should produce an actionable canary failure without blocking
every pull request.

Set `BLANC_OAUTH_KEEP_PROFILE=1` to preserve the otherwise-deleted temporary
profile for debugging a failed canary.

To run only one canary while debugging:

```bash
npm run test:oauth:live -- chatgpt
npm run test:oauth:live -- instacart
```

## External application callbacks

The deterministic suite also verifies browser-to-app callbacks in the real
Electron runtime: direct links, HTTP redirects, iframe redirects, direct
`window.open`, managed child tabs, and OAuth popup windows. Only the native
app lookup, confirmation dialog, and OS launch are stubbed. Cancellation must
not launch anything; callback parameters must not appear in dialog text.

Blanc discovers installed app handlers through the OS, without a per-service
scheme list. Browser-internal and dangerous OS schemes are excluded. Other
custom app schemes always require confirmation, including typed links; an
unregistered scheme never reaches the OS. Typed colon-prefixed search terms
without a slash continue through normal search routing. Missing handlers and
launch errors produce a visible message. No persistent permission or callback
URL is saved. After any page-initiated handoff, further attempts stay quiet
until another native click or activation key; this includes missing-handler
messages, so timers and redirects cannot trap the user in dialogs.

This coverage verifies the browser handoff contract, not a real account login.
Before release, validate actual sign-in on macOS, Windows, and Linux with
representative installed apps, including Claude. Google account-policy errors
and provider-specific authentication failures require separate diagnosis.
