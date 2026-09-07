# Blanc one-time tab handoff

This Worker exposes the public `create_tab_handoff` MCP tool and an encrypted
handoff endpoint used by the Firefox and Safari companions. It is deliberately
separate from Profile Sync.

The storage relay holds a v2 AES-GCM envelope in a Durable Object. The 256-bit
key is returned in the landing URL fragment and is never staged in storage;
the MCP handler generates it transiently for ChatGPT requests. The envelope's
absolute ten-minute expiry and handoff ID are authenticated as AES-GCM
additional data. Payload and launch links remain v1. The first claim atomically
deletes ciphertext and retains only an expiry-only used-ID marker until the
original expiry. No permanent used-ID log is kept. Requests are rate checked
before body consumption; consumed bytes, including oversized rejected chunks,
are charged separately. Rate-limit storage failures fail closed. Request
bodies are never logged by application code.

## Routes

- `POST /mcp` — sessionless Streamable HTTP MCP (`initialize`, `tools/list`,
  `tools/call`, and `ping`).
- `PUT /v1/handoffs/:id` — store an already-encrypted companion envelope.
- `POST /v1/handoffs/:id/claim` — retrieve and consume the envelope once.
- `GET /.well-known/openai-apps-challenge` — submission verification after
  `OPENAI_APPS_CHALLENGE` is configured.

## Local development

Run `npm install` and `npm run dev` in this directory. A packaged Blanc build
always uses `https://tabs.blancbrowser.com`; an unpackaged `BLANC_TEST=1` run
may set `BLANC_TEST_TAB_IMPORT_RELAY` to a loopback origin for acceptance.

Deployment, DNS, OpenAI registration, and the verification secret are release
operations and are intentionally not performed by repository tests.
