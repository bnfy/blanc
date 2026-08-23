# Tab-import on-device embedding benchmark (Task 15)

**Date:** 2026-08-23  
**Machine:** macOS arm64, Node v22.17.0 (Apple Silicon dev host, 10 cores)  
**Harness:** `node scripts/tab-import-embedding-benchmark.mjs`

## Ship decision

**On-device embeddings do not ship in F39 v1.** Bring Your Tabs ships with the
deterministic folder fallback only. Tasks 16–17 (Web Worker path + packaged model
verification) are deferred until a candidate passes the packaging gate on review.

**Reason:** the smallest reviewed curated payload (Transformers.js web runtime +
single ORT WASM + `paraphrase-MiniLM-L3-v2` `model_uint8.onnx` + tokenizer JSON)
is **30.04 MiB uncompressed** — above the locked **30 MiB** installer-increase
gate in `2026-08-23-ai-assisted-tab-migration-design.md`. Gzip of the same file
set is ~14.8 MiB, but release gates hash-verify exact packaged bytes; the
uncompressed payload is the binding budget.

The UI **Suggest groups on this device** action must remain hidden or disabled
until a future model review passes packaging, performance, and licensing gates
on macOS, Windows, and Linux.

## Candidates evaluated

| Candidate | License | ONNX uint8 | SHA-256 (uint8) | 384-dim |
|---|---|---:|---|---|
| `Xenova/paraphrase-MiniLM-L3-v2` | Apache-2.0 | 17.39 MiB | `883a0fa38c9a52de26265c3d34b611360cc5b871328af80372245ae9c9a9b0a3` | yes |
| `Xenova/all-MiniLM-L6-v2` | Apache-2.0 | 22.84 MiB | `57097fb267dcffb2a9f12fba945201c76ae99b7640ed1c6389cc9e0341c71ee6` | yes |

Runtime: `@huggingface/transformers` **4.2.0** (Apache-2.0) with ONNX Runtime Web
(MIT). Node benchmark used the library’s Node backend; the shipped surface would
use ORT Web WASM in a sandboxed worker only.

## Performance (this machine)

Candidate inputs match `sanitizeCandidateInput()` — title, hostname, folder path
labels only; no URLs.

| Model | Load (cold) | 100 candidates | 500 candidates |
|---|---:|---:|---:|
| paraphrase-MiniLM-L3-v2 | 2.09 s | **80 ms** | **299 ms** |
| all-MiniLM-L6-v2 | 2.02 s | 117 ms | 446 ms |

Locked release gates: 100 ≤ 3 s, 500 ≤ 10 s. **Both candidates pass** on this
host. Organizer heap deltas during inference stayed under ~13 MiB above the probe
baseline — well under the 250 MiB transient organizer budget (full worker-isolated
measurement belongs in Task 17 if a model ships later).

**Selected candidate for a future pin:** `Xenova/paraphrase-MiniLM-L3-v2`
(`model_uint8.onnx`) — smallest payload and fastest inference in this benchmark.

## Minimum curated web payload (binding packaging math)

| Asset | Bytes | MiB |
|---|---:|---:|
| `model_uint8.onnx` | 17,388,904 | 16.59 |
| `tokenizer.json` + configs | 712,672 | 0.68 |
| `ort-wasm-simd-threaded.wasm` | 12,942,611 | 12.35 |
| `ort-wasm-simd-threaded.mjs` | 24,180 | 0.02 |
| `transformers.web.min.js` | 431,652 | 0.41 |
| **Total uncompressed** | **31,500,019** | **30.04** |

Excluded from this tally: `onnxruntime-node` (~211 MiB in npm), unused ORT WASM
variants (JSEP/asyncify), source maps, and duplicate model files.

## Third-party licenses (for a future pin)

- `@huggingface/transformers` — Apache-2.0
- `onnxruntime-web` — MIT
- `Xenova/paraphrase-MiniLM-L3-v2` — Apache-2.0 (Sentence Transformers lineage)
- `Xenova/all-MiniLM-L6-v2` — Apache-2.0

## Re-run

```bash
npm install --no-save @huggingface/transformers@4.2.0
node scripts/tab-import-embedding-benchmark.mjs
```

Results land in `bench/tab-import/results/` (gitignored). Hugging Face cache defaults
to `bench/tab-import/.hf-cache` (gitignored).

## Follow-up options (separate review)

1. Smaller ONNX embedding model or slimmer runtime that stays ≤ 30 MiB uncompressed.
2. Platform-specific WASM variants if a smaller ORT build exists for the worker.
3. Ship folder-only for v1; revisit before enabling #TabBarReset AI copy.
