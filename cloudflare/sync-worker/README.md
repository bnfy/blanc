# blanc-sync — E2EE profile sync store

Stores only AES-GCM ciphertext for Blanc's profile sync (see `src/main/sync.js`
in the main repo). Keyed by an opaque `accountId` the client derives from a
passphrase this Worker never sees. It cannot decrypt or merge user data.
Account-locator and raw client-IP rate counters are stored in KV for up to
120 seconds. Provider logging and metadata retention require operational
verification separately.

## Deploy

1. `cd cloudflare/sync-worker`
2. `wrangler kv namespace create SYNC` → paste the id into `wrangler.toml`.
3. `wrangler deploy`
4. Confirm the URL matches `SYNC_ENDPOINT` in `src/main/sync.js`.

## Local dev

`wrangler dev` serves on http://127.0.0.1:8787; temporarily point
`SYNC_ENDPOINT` in `src/main/sync.js` there to test the app end-to-end.

## API

- `GET /v1/blob/:accountId/:store` → `{ version, blob }` | 404 | 429
- `PUT /v1/blob/:accountId/:store` `{ ifVersion, blob }` → `{ version }` | 409 | 400 | 413
- `DELETE /v1/blob/:accountId` → 204 (account wipe)

`accountId` is 64 hex chars; `store` is one of `bookmarks`, `settings`,
`session` (tab sync — per-device open-tab snapshots), or `icons` (optional
source-rasterized tab favicons, kept separate for mixed-client compatibility
and budget isolation). Every store is ciphertext like the rest. No
separate credentials: possession of `accountId` is the bearer storage
capability, permitting retrieval, replacement and deletion of ciphertext.
Its resistance to guessing depends on the handle/passphrase and KDF. This
known R3 risk remains open; the v1 size hardening adds no authentication.
A per-client-IP limit (120/min, all methods) is the anti-guessing
throttle — each passphrase guess derives a fresh `accountId`, so the
per-`accountId` GET limit (30/min) is only anti-hammering of a single account.

PUT requests are capped at 513 KiB of streamed UTF-8 bytes before parsing,
including ignored fields. The serialized blob remains capped at 512 KiB,
also in UTF-8 bytes. A declared oversized Content-Length rejects early;
missing or misleading lengths do not bypass the stream cap. Over-limit
streams are cancelled with 413 before a blob is stored. Routes, encryption,
derivation, conflict and version response shapes remain v1-compatible.

KV counters and version checks are non-atomic. Two same-version writes can
both succeed, losing one write; a pending write can recreate data after a
DELETE. Client reconciliation does not guarantee recovery. Strict concurrency,
deletion fencing and authenticated migration are separate v2 work.
