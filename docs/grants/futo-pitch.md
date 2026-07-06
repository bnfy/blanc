# FUTO pitch — Blanc (draft)

> Short email-style pitch for https://futo.org (rolling submissions,
> grants@futo.org). Review and send personally — nothing has been sent.

Subject: Grant inquiry — Blanc, an independent ad-blocking-first desktop browser

Hi,

I build Blanc (https://blancbrowser.com, https://github.com/bnfy/blanc),
an open-source desktop browser for macOS/Windows/Linux with one premise:
the browser itself should be on the user's side. Ad and tracker blocking
runs at the network layer of the app — no extension store, no Manifest V3
ceiling — private tabs never touch disk, permissions are explicit, and
telemetry is a single opt-in anonymous launch ping. The whole shell is
deliberately small enough for one person to audit.

It's shipping today (three platforms, signed and notarized, auto-updates)
and was recently accepted into Apple's password-manager-resources dataset.
The gap between "shipping" and "viable for normal people" is a short,
concrete list: passkey/WebAuthn platform-authenticator support (currently
gated behind OS-vendor allowlists that exclude independent browsers — I
want to both implement it and document the path publicly), Windows/Linux
parity, and an accessibility pass on the custom chrome.

I'm seeking on the order of $10–20k to fund six months of focused
part-time work on exactly that list. Happy to share roadmap, architecture
notes, or anything else useful.

Thanks for considering it,
Anthony Loria
anthony@bnfy.me
