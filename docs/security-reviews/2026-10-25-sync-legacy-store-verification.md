# Sync legacy-store restrictions — read-only production verification

**Observed:** October 25, 2026, approximately 22:50–23:03 UTC.
**Purpose:** Establish a finite legacy-store/size bound for the conservative
reservation proposal in [#1134](https://github.com/bnfy/blanc/pull/1134).
**Authorization:** Owner requested production verification and a plan revision.

Only read-only Cloudflare control-plane/source and KV key-metadata APIs were
used. No public Worker mutation request, deployment, configuration change,
customer ciphertext read/export, erasure check or real-device test was made.
The source-behavior checks below ran against local fake KV, not production.
This record contains no account locators, full key lists, credentials or
customer values. Raw source/configuration inspection files remain local.

## Active deployment

| Field | Observation |
| --- | --- |
| Worker | `blanc-sync` / `https://blanc-sync.bnfy-441.workers.dev` |
| Deployment | `a816832c-cb3d-42ee-867c-17b74e5557fe`, October 25, 13:40:13.552660 UTC |
| Traffic | 100% to `106160ef-42e6-4499-bf4f-e3c72937774e` |
| KV binding | `SYNC` → `0e6ba79c73d64d77bbb76886666c33d5` |
| Quota binding | None |
| Current variables | `NEW_ACCOUNT_DAILY_LIMIT=100`, `CLEANUP_ENABLED=true`, `CLEANUP_MAX_DELETES=1000` |
| Source relationship | Downloaded original source equals repository `97088934ecb6653fb1d0a81e31a0c81eb0e3ca82` / `47e08762e223d601f0e3e85548e120ad0ef52fa2` at the Worker source path |

The deployment history includes a newer October 25 version than the older
October 2 operational record. The current source was verified directly rather
than inferred from a commit message saying a different change was not deployed.
Its allowlist is exactly `bookmarks`, `settings`, `session`, `icons`, `sends`.
The route requires a store for PUT, rejects unknown names and has no dynamic
Space route. New blob PUTs are limited to 524,288 serialized UTF-8 bytes.

## All recorded versions inspected

The version API returned eight total versions, matching the eight deployment
versions from Worker creation through the observation. Each version's modules
were downloaded through the read-only Workers version API with `include=modules`.
Their main-module SHA-256 values are below; these are source hashes, not
Cloudflare's separate script etags.

| Version | Created | Allowed stores | Size check | Main-module SHA-256 |
| --- | --- | --- | --- | --- |
| `deb23f79-05fe-4b3e-a67a-e156f58883f8` | July 7 | bookmarks, settings | UTF-16 code units | `d36bc2ecc0646ea6db7dd88813416b5e251e286cd92f14a655529b5e8711d557` |
| `d673c38c-e2a4-405d-9b1c-fbe0a4d406fe` | July 22 | bookmarks, settings, session | UTF-16 code units | `48f9f28b5e12e3a700b5f303189d0c79482c9903f02f09d27baeee7e6dfbc714` |
| `a8f81a1c-1faa-4ec2-a47b-40aca4127163` | August 9 | bookmarks, settings, session, icons | UTF-16 code units | `dc2834201262444c4344bbd5ba4844713e05db14f42cb47d02c69f0d07ce6a60` |
| `ee52d321-1b60-4d3c-9e83-9a136b39246d` | October 6 | bookmarks, settings, session, icons | UTF-8 bytes | `be64e5c51d2cb923547f4195963ff6f1b43b1a4972630555b5f35c47901b1f98` |
| `3348953b-cf30-465b-9217-b1e74252fa3c` | October 6 | bookmarks, settings, session, icons | UTF-8 bytes | `be64e5c51d2cb923547f4195963ff6f1b43b1a4972630555b5f35c47901b1f98` |
| `d24015ae-7790-4ddf-8e47-c031b0e3649b` | October 6 | bookmarks, settings, session, icons | UTF-8 bytes | `be64e5c51d2cb923547f4195963ff6f1b43b1a4972630555b5f35c47901b1f98` |
| `cec782e2-0d08-4585-8f89-b307baa334b8` | October 16 | bookmarks, settings, session, icons | UTF-8 bytes | `4ce6ec26faa52f24a42338ba8c5c314390119d699d29a58ac959598a4153806f` |
| `106160ef-42e6-4499-bf4f-e3c72937774e` | October 25 | bookmarks, settings, session, icons, sends | UTF-8 bytes | `7c9d8763e38aca0330154cac001b2d7db786fd6e64affd1c0567b49f2276dcc9` |

Every inspected version requires a store and rejects the three M16 fixed names,
dynamic Space names and arbitrary unknown stores. The union of accepted legacy
names is five fixed stores, not eight. Reserving eight deliberately also covers
the three new fixed names once M16 is enabled.

## Binding and key-metadata cross-check

Read current settings and service environments for the ten visible Workers.
Each reported one `production` environment. Only `blanc-sync` had a KV binding
to the Sync namespace; it had no service binding to an auxiliary writer. The
eight inspected Sync versions all bind the same namespace. Uploaded/preview
source versions were included in the eight-version check; none offers M16 routes.

A paginated `blob:` key-metadata listing completed in one page. Observed suffixes
were `bookmarks`, `settings`, `session` and `icons`; no `space-<id>`, M16 fixed
store or malformed blob key was observed. Full names were processed only in
memory and were not saved into this record. No values were fetched. KV listings
are eventually consistent, so this observation is not proof that the list
contained every key. [Cloudflare KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

The inspection does not audit all past operator credentials, direct REST writes,
bulk imports, deleted services or external infrastructure. The finite-store
proof assumes no out-of-schema administrative write. The owner/operator must
confirm that assumption and recheck writer/deployment drift before any deployment.
Evidence of an additional historical store or larger size invalidates the bound;
it must not be treated as covered merely because a metadata scan missed it.

## Local checks and historical size consequence

Imported each downloaded module into an isolated local test with fake KV.
Across all eight versions, PUTs to `space-<id>`, `spaces`, `closed`, `shared`,
an unknown name and the storeless route returned 404. No such request was sent
to the deployed endpoint. A small accepted ASCII value also verified that the
stored-value wrapper adds exactly 58 bytes in every downloaded version.

Also submitted a synthetic object whose serialized blob is exactly 524,288
UTF-16 code units and 1,572,846 UTF-8 bytes. The three pre-October-6 versions
accepted it locally; the five byte-bounded versions returned 413. Thus the
legacy reservation must cover the historical encoding limit, even though
ordinary encrypted client blobs are ASCII. No customer blob was sampled and
no assertion is made that oversized customer values exist.

At most three UTF-8 bytes per UTF-16 code unit bounds that representation.
The four older names therefore reserve `3 * 524288 + 58 + 256` bytes each;
the other four fixed slots reserve `524288 + 58 + 256` bytes each. This sums to
8,391,120 charged bytes across eight slots. The larger historical reserve is a
safety bound, not an actual namespace-size measurement.
