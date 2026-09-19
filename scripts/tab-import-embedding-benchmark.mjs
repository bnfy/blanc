#!/usr/bin/env node
'use strict';

/**
 * Task 15 packaging + performance probe for on-device tab-import embeddings.
 * Run: node scripts/tab-import-embedding-benchmark.mjs [--sizes=100,500]
 *
 * Measures candidate embedding time/memory for reviewed model candidates using
 * the same Transformers.js feature-extraction path planned for the worker.
 */

import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pipeline, env } from '@huggingface/transformers';

const require = createRequire(import.meta.url);
const { sanitizeCandidateInput } = require('../src/main/tab-import-organizer');

const ROOT = path.join(import.meta.dirname, '..');
const MODELS = [
  {
    id: 'Xenova/paraphrase-MiniLM-L3-v2',
    label: 'paraphrase-MiniLM-L3-v2',
    license: 'Apache-2.0',
    dims: 384,
  },
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    label: 'all-MiniLM-L6-v2',
    license: 'Apache-2.0',
    dims: 384,
  },
];

const sizes = (process.argv.find((arg) => arg.startsWith('--sizes='))?.slice(8)
  ?? '100,500').split(',').map((n) => Number(n.trim())).filter((n) => n > 0);

const CACHE_DIR = path.join(ROOT, 'bench/tab-import/.hf-cache');
env.cacheDir = CACHE_DIR;
env.allowLocalModels = false;

function formatCandidate(index) {
  const topics = ['work', 'reading', 'finance', 'travel', 'docs', 'shop', 'news', 'dev'];
  const topic = topics[index % topics.length];
  const host = `${topic}${index % 12}.example`;
  return sanitizeCandidateInput({
    candidateId: `cand-${index}`,
    title: `${topic} page ${index} — quarterly review notes`,
    hostname: host,
    folderPath: ['Bookmarks bar', topic, `batch-${Math.floor(index / 25)}`],
  });
}

function candidateText(candidate) {
  const folder = candidate.folderPath.join(' / ');
  return `${candidate.title} (${candidate.hostname}) — ${folder}`;
}

function peakHeapMb() {
  const { heapUsed } = process.memoryUsage();
  return heapUsed / (1024 * 1024);
}

async function measureModel(model) {
  const baselineHeap = peakHeapMb();
  const loadStart = performance.now();
  const extractor = await pipeline('feature-extraction', model.id, { dtype: 'uint8' });
  const loadMs = performance.now() - loadStart;
  const afterLoadHeap = peakHeapMb();

  const results = [];
  for (const count of sizes) {
    const candidates = Array.from({ length: count }, (_, i) => formatCandidate(i));
    const texts = candidates.map(candidateText);
    const startHeap = peakHeapMb();
    const start = performance.now();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const elapsedMs = performance.now() - start;
    const peakHeap = peakHeapMb();
    const matrix = output.tolist();
    results.push({
      count,
      elapsedMs,
      heapDeltaMb: peakHeap - startHeap,
      rows: matrix.length,
      dims: matrix[0]?.length ?? 0,
    });
  }

  return {
    model,
    loadMs,
    baselineHeapMb: baselineHeap,
    afterLoadHeapMb: afterLoadHeap,
    loadHeapDeltaMb: afterLoadHeap - baselineHeap,
    runs: results,
  };
}

function dirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSizeBytes(full) : fs.statSync(full).size;
  }
  return total;
}

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function cacheInventory() {
  const inventory = [];
  if (!fs.existsSync(CACHE_DIR)) return inventory;
  for (const modelDir of fs.readdirSync(CACHE_DIR, { withFileTypes: true })) {
    if (!modelDir.isDirectory()) continue;
    const root = path.join(CACHE_DIR, modelDir.name);
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const onnxDir = path.join(root, entry.name, 'onnx');
      if (!fs.existsSync(onnxDir)) continue;
      for (const file of fs.readdirSync(onnxDir)) {
        if (!file.endsWith('.onnx')) continue;
        const filePath = path.join(onnxDir, file);
        inventory.push({
          model: entry.name,
          file,
          bytes: fs.statSync(filePath).size,
          sha256: sha256File(filePath),
        });
      }
    }
  }
  return inventory;
}

async function main() {
  const transformersPkg = path.join(ROOT, 'node_modules/@huggingface/transformers/package.json');
  const transformersBytes = dirSizeBytes(path.join(ROOT, 'node_modules/@huggingface/transformers'));
  const onnxPkgBytes = dirSizeBytes(path.join(ROOT, 'node_modules/onnxruntime-node'))
    + dirSizeBytes(path.join(ROOT, 'node_modules/onnxruntime-web'));

  const report = {
    host: {
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      node: process.version,
    },
    sizes,
    runtime: {
      '@huggingface/transformers': {
        version: JSON.parse(fs.readFileSync(transformersPkg, 'utf8')).version,
        bytes: transformersBytes,
      },
      onnxruntime: {
        bytes: onnxPkgBytes,
      },
    },
    models: [],
    cache: {
      dir: CACHE_DIR,
      bytes: dirSizeBytes(CACHE_DIR),
      files: [],
    },
    gates: {
      installerDeltaMiBMax: 30,
      ms100Max: 3000,
      ms500Max: 10000,
    },
  };

  for (const model of MODELS) {
    report.models.push(await measureModel(model));
  }

  report.cache.files = await cacheInventory();
  report.cache.bytes = dirSizeBytes(CACHE_DIR);

  const smallestOnnx = report.cache.files
    .filter((entry) => entry.file.includes('uint8'))
    .sort((a, b) => a.bytes - b.bytes)[0];
  const modelId = smallestOnnx?.model ?? '';
  const modelCacheRoot = modelId
    ? path.join(CACHE_DIR, 'Xenova', modelId)
    : null;
  const tokenizerBytes = modelCacheRoot && fs.existsSync(modelCacheRoot)
    ? ['tokenizer.json', 'config.json', 'tokenizer_config.json']
      .map((name) => path.join(modelCacheRoot, name))
      .filter((filePath) => fs.existsSync(filePath))
      .reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0)
    : 0;
  const ortWasm = path.join(ROOT, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm');
  const ortLoader = path.join(ROOT, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs');
  const transformersWeb = path.join(ROOT, 'node_modules/@huggingface/transformers/dist/transformers.web.min.js');
  const webMinimum = [
    smallestOnnx?.bytes ?? 0,
    tokenizerBytes,
    fs.existsSync(ortWasm) ? fs.statSync(ortWasm).size : 0,
    fs.existsSync(ortLoader) ? fs.statSync(ortLoader).size : 0,
    fs.existsSync(transformersWeb) ? fs.statSync(transformersWeb).size : 0,
  ];
  const webMinimumBytes = webMinimum.reduce((sum, n) => sum + n, 0);
  report.packaging = {
    runtimeBytes,
    smallestUint8Onnx: smallestOnnx ?? null,
    webMinimumBytes,
    webMinimumMiB: webMinimumBytes / (1024 * 1024),
    estimatedInstallerDeltaMiB: webMinimumBytes / (1024 * 1024),
    note: 'Curated Electron worker payload only — excludes onnxruntime-node and unused ORT WASM variants.',
  };

  const outDir = path.join(ROOT, 'bench/tab-import/results');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `embedding-benchmark-${stamp}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
