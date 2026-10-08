// bench/translate/harness/engine.js
'use strict';

const api = window.benchAPI;
const now = () => performance.timeOrigin + performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toArrayBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const countWords = (t) => t.split(/\s+/).filter(Boolean).length;
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function extractWikipedia(html, articleWords, markupBlocks) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('sup.reference, style, .mw-ref, .noprint').forEach((n) => n.remove());
  const paras = [...doc.querySelectorAll('section p')].filter((p) => p.textContent.trim().length > 40);
  const article = [];
  let total = 0;
  for (const p of paras) {
    if (total >= articleWords) break;
    const text = p.textContent.replace(/\s+/g, ' ').trim();
    article.push(text);
    total += countWords(text);
  }
  const markup = paras
    .filter((p) => p.querySelector('a, b, i, em, strong'))
    .slice(0, markupBlocks)
    .map((p) => p.innerHTML.replace(/\s+/g, ' ').trim());
  return { article, articleWords: total, markup };
}

// The F43 marker form: every element keeps its tag name, loses all original
// attributes, and gains an opaque id; translate="no" content is not sent.
function toMarkers(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let n = 0;
  const ser = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.data);
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.localName;
    const id = `m${n++}`;
    if (node.getAttribute('translate') === 'no') return `<${tag} id="${id}"></${tag}>`;
    return `<${tag} id="${id}">${[...node.childNodes].map(ser).join('')}</${tag}>`;
  };
  return [...doc.body.childNodes].map(ser).join('');
}

function startWorker() {
  const worker = new Worker('engine.worker.js');
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
  const call = (message, transfer = []) => {
    const p = next();
    worker.postMessage(message, transfer);
    return p;
  };
  return { worker, booted: next(), call };
}

async function boot(inputs, tStart) {
  const tInputs = now();
  const tWorker = now();
  const { worker, booted, call } = startWorker();
  const { at } = await booted;
  const wasm = toArrayBuffer(inputs.wasm);
  const files = { model: toArrayBuffer(inputs.model), lex: toArrayBuffer(inputs.lex), vocab: toArrayBuffer(inputs.vocab) };
  api.mark('engine');
  const ready = await call({ type: 'init', wasm, files }, [wasm, files.model, files.lex, files.vocab]);
  const timing = {
    inputTransferMs: tInputs - tStart,
    workerStartMs: at - tWorker,
    engineLoadMs: ready.engineLoadMs,
    modelLoadMs: ready.modelLoadMs,
    endToEndReadyMs: now() - tStart,
  };
  api.onTerminate(() => { worker.terminate(); api.terminated(); });
  return { call, timing };
}

async function fullCycle(inputs, tStart) {
  const { run } = inputs;
  const { article, articleWords, markup } = extractWikipedia(inputs.fixtureHtml, run.articleWords, run.wikipediaMarkupBlocks);
  if (articleWords < run.articleWords) throw new Error(`fixture too short: ${articleWords} words`);
  const { call, timing } = await boot(inputs, tStart);
  const translate = (blocks, html) => call({ type: 'translate', blocks, html, batchSize: run.batchSize });

  api.mark('cold');
  const cold = await translate(article, false);
  api.mark('warm');
  const warmMs = [];
  let warm = null;
  for (let i = 0; i < run.warmRuns; i++) {
    warm = await translate(article, false);
    warmMs.push(warm.ms);
  }
  api.mark('markup');
  const wiki = await translate(markup, true);
  const htmlSrc = inputs.fixtures.map((c) => c.html);
  const markerSrc = inputs.fixtures.map((c) => toMarkers(c.html));
  const htmlOut = await translate(htmlSrc, true);
  const markerOut = await translate(markerSrc, true);

  return {
    mode: 'full',
    timing,
    articleWords,
    articleBlocks: article,
    articleOut: warm.out,
    coldMs: cold.ms,
    warmMs,
    markup: {
      wikipedia: markup.map((src, i) => ({ src, out: wiki.out[i] })),
      fixtures: [
        ...inputs.fixtures.map((c, i) => ({ id: c.id, mode: 'html', src: htmlSrc[i], out: htmlOut.out[i] })),
        ...inputs.fixtures.map((c, i) => ({ id: c.id, mode: 'markers', src: markerSrc[i], out: markerOut.out[i] })),
      ],
    },
  };
}

async function shortCycle(inputs, tStart) {
  const { run } = inputs;
  const { article } = extractWikipedia(inputs.fixtureHtml, run.articleWords, 0);
  const { call, timing } = await boot(inputs, tStart);
  api.mark('first');
  const first = await call({ type: 'translate', blocks: article, html: false, batchSize: run.batchSize });
  return { mode: 'short', timing, firstTranslateMs: first.ms };
}

async function main() {
  api.hello();
  await sleep(1000); // idle baseline: the loaded page before any engine bytes arrive
  const tStart = now();
  const inputs = await api.getInputs();
  const cycle = inputs.mode === 'full' ? await fullCycle(inputs, tStart) : await shortCycle(inputs, tStart);
  api.report(cycle);
}

main().catch((err) => api.fail(String((err && err.stack) || err)));
