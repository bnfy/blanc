// bench/translate/harness/engine-cmd.js
// Command-driven engine page for the "engine behind the page" round. Reuses
// engine.worker.js unchanged; main sends init / translate / state / terminate.
'use strict';

const api = window.benchAPI;
const now = () => performance.timeOrigin + performance.now();
const toArrayBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const countWords = (t) => t.split(/\s+/).filter(Boolean).length;

for (const kind of ['focus', 'blur', 'mousedown', 'pointerdown', 'keydown', 'wheel']) {
  window.addEventListener(kind, () => api.probe(kind, { hasFocus: document.hasFocus() }), true);
}

let worker = null;
let call = null;
let batchSize = 64;
const blocks = { viewport: [], article: [] };
const words = { viewport: 0, article: 0 };

function paragraphs(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('sup.reference, style, .mw-ref, .noprint').forEach((n) => n.remove());
  return [...doc.querySelectorAll('section p')]
    .map((p) => p.textContent.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 40);
}

function take(paras, target) {
  const out = [];
  let total = 0;
  for (const p of paras) {
    if (total >= target) break;
    out.push(p);
    total += countWords(p);
  }
  return { out, total };
}

function startWorker() {
  worker = new Worker('engine.worker.js');
  let pending = null;
  worker.onmessage = ({ data }) => {
    const p = pending;
    pending = null;
    if (!p) return;
    if (data.type === 'error') p.reject(new Error(data.message));
    else p.resolve(data);
  };
  worker.onerror = (e) => pending && pending.reject(new Error(e.message || 'worker error'));
  const next = () => new Promise((resolve, reject) => { pending = { resolve, reject }; });
  const send = (message, transfer = []) => {
    const p = next();
    worker.postMessage(message, transfer);
    return p;
  };
  return { booted: next(), send };
}

async function init() {
  const t0 = now();
  const inputs = await api.getInputs();
  batchSize = inputs.run.batchSize;
  const paras = paragraphs(inputs.fixtureHtml);
  const article = take(paras, inputs.run.articleWords);
  const viewport = take(paras, inputs.run.viewportWords);
  blocks.article = article.out;
  words.article = article.total;
  blocks.viewport = viewport.out;
  words.viewport = viewport.total;
  const started = startWorker();
  await started.booted;
  call = started.send;
  const wasm = toArrayBuffer(inputs.wasm);
  const files = { model: toArrayBuffer(inputs.model), lex: toArrayBuffer(inputs.lex), vocab: toArrayBuffer(inputs.vocab) };
  await call({ type: 'init', wasm, files }, [wasm, files.model, files.lex, files.vocab]);
  return { readyMs: now() - t0, articleWords: words.article, viewportWords: words.viewport };
}

api.onCommand(async (c) => {
  try {
    if (c.type === 'init') {
      api.reply(c.id, await init());
    } else if (c.type === 'translate') {
      const r = await call({ type: 'translate', blocks: blocks[c.which], html: false, batchSize });
      api.reply(c.id, { ms: r.ms, out: c.keepOutput ? r.out : null });
    } else if (c.type === 'state') {
      api.reply(c.id, { hasFocus: document.hasFocus(), visibility: document.visibilityState });
    } else if (c.type === 'terminate') {
      worker.terminate();
      api.reply(c.id, {});
    }
  } catch (err) {
    api.fail(String((err && err.stack) || err));
  }
});

api.hello();
