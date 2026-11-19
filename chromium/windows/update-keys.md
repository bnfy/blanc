# Blanc Beta for Windows: update keys

Blanc's updater (Chromium's `//chrome/updater`, branded by
`blanc/branding/win-beta/updater.gni`) trusts two keys of Blanc's own, never
Google's (W3 owner decisions 2 and 4, 2026-11-18). Only their public halves are
in this repository.

| Key | Algorithm | Private half | Public half | Used for |
| --- | --- | --- | --- | --- |
| CUP | ML-DSA-44 | 1Password Dev "Blanc Windows Beta CUP Key"; the update Worker's secret | `cup-public.der` (pending) | Signing update-check answers (Client Update Protocol). Key version 1. |
| CRX publisher | RSA 4096 | 1Password Dev "Blanc Windows Beta CRX Publisher Key" | `crx-public.der` (pending) | Signing update packages (CRX3); the app pins the SHA-256 of its public key (`crx_pkhash`, base64). |

Neither private key is ever on the build server, in GitHub or in a GitHub
artifact.

## Making them

The owner runs `chromium/windows/owner/update-keys-make.command` once, on the
MacBook Pro (Homebrew OpenSSL 3, which makes ML-DSA-44). It stores both private
keys in 1Password, reads each back and compares, and leaves only the public
halves in `~/Projects/Blanc/records/windows-update-keys/`. It refuses to run
again while either key exists. `tools/windows-update-keys.test.mjs` runs it
with a stand-in for 1Password.

## What the app does with them (patch to come)

- CUP: the updater's configurator hands `update_client` Blanc's key and version
  instead of the built-in Google key in `components/update_client/request_sender.cc`.
  The browser's own component updater keeps Chromium's key.
- CRX: the updater accepts CRX3 packages signed with Blanc's publisher key
  (`crx_pkhash`) instead of requiring Google's publisher proof.
