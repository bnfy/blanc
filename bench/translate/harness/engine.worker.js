// bench/translate/harness/engine.worker.js
/* global loadBergamot */
'use strict';
importScripts('bergamot-translator.js');

// Values copied from mozilla/translations
// inference/wasm/tests/engine/translations-engine.worker.mjs at the pinned commit.
const ALIGNMENT = { model: 256, lex: 64, vocab: 64 };
const CONFIG = {
  'beam-size': '1', normalize: '1.0', 'word-penalty': '0', 'max-length-break': '128',
  'mini-batch-words': '1024', workspace: '128', 'max-length-factor': '2.0', 'skip-cost': 'true',
  'cpu-threads': '0', quiet: 'true', 'quiet-translation': 'true',
  'gemm-precision': 'int8shiftAlphaAll', alignment: 'soft',
};
const textConfig = () => {
  const indent = '            ';
  return '\n' + Object.entries(CONFIG).map(([k, v]) => `${indent}${k}: ${v}\n`).join('') + indent;
};

let bergamot = null;
let service = null;
let model = null;

function loadEngine(wasmBinary) {
  return new Promise((resolve, reject) => {
    const mod = loadBergamot({
      INITIAL_MEMORY: 234_291_200,
      print: () => {},
      onAbort: () => reject(new Error('Bergamot aborted while loading')),
      onRuntimeInitialized: () => resolve(mod),
      wasmBinary,
    });
  });
}

function buildModel(files) {
  const aligned = {};
  for (const [kind, buf] of Object.entries(files)) {
    const mem = new bergamot.AlignedMemory(buf.byteLength, ALIGNMENT[kind]);
    mem.getByteArrayView().set(new Uint8Array(buf));
    aligned[kind] = mem;
  }
  const vocabs = new bergamot.AlignedMemoryList();
  vocabs.push_back(aligned.vocab);
  return new bergamot.TranslationModel('fr', 'en', textConfig(), aligned.model, aligned.lex, vocabs, null);
}

function translate(blocks, html, batchSize) {
  const out = [];
  for (let i = 0; i < blocks.length; i += batchSize) {
    const messages = new bergamot.VectorString();
    const options = new bergamot.VectorResponseOptions();
    for (const block of blocks.slice(i, i + batchSize)) {
      messages.push_back(block);
      options.push_back({ qualityScores: false, alignment: true, html });
    }
    const responses = service.translate(model, messages, options);
    for (let j = 0; j < responses.size(); j++) out.push(responses.get(j).getTranslatedText());
    messages.delete();
    options.delete();
    responses.delete();
  }
  return out;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const t0 = performance.now();
      bergamot = await loadEngine(data.wasm);
      const t1 = performance.now();
      model = buildModel(data.files);
      service = new bergamot.BlockingService({ cacheSize: 0 });
      self.postMessage({ type: 'ready', engineLoadMs: t1 - t0, modelLoadMs: performance.now() - t1 });
    } else if (data.type === 'translate') {
      const t0 = performance.now();
      const out = translate(data.blocks, data.html, data.batchSize);
      self.postMessage({ type: 'translated', ms: performance.now() - t0, out });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.stack) || err) });
  }
};

self.postMessage({ type: 'booted', at: performance.timeOrigin + performance.now() });
