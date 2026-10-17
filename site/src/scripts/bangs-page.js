// /bangs: the try-it box and the directory search. The page works without
// this script (every row is in the HTML, the box shows its example); with
// it, the box answers live through the pinned copy of the app's bangs.js and
// the directory pages and filters. The only request this makes is for the
// page's own data asset; what a visitor types never leaves the page.

import * as bangsModule from './bangs.js';
import dataUrl from '../data/bangs.json?url';
import { filterBangs } from './bangs-directory.mjs';
import { describeTryIt, islandHintFor } from './bangs-tryit.mjs';

// The pinned bangs.js is a dual-mode script: the production bundle wraps it
// as CommonJS (its export arrives as the default), while the dev server runs
// it as a plain script that publishes window.Bangs.
const Bangs = bangsModule.default ?? window.Bangs;

const STEP = 50;
const format = (n) => n.toLocaleString('en-US');

// Fetch the data once the page is idle, so the first keystroke answers.
function whenIdle(callback) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout: 3000 });
  else setTimeout(callback, 1500);
}

let dataPromise = null;
function loadData() {
  if (!dataPromise) {
    dataPromise = fetch(dataUrl)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return dataPromise;
}

// ---------- try it ----------

const tryInput = document.getElementById('bangs-try');
const tryList = document.getElementById('bangs-try-list');
const tryDest = document.getElementById('bangs-try-dest');
const tryHint = document.getElementById('bangs-try-hint');
const message = (kind) => document.querySelector(`[data-msg="${kind}"]`)?.textContent ?? '';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// overlay.js bangHeaderRow: an unfolded section header, caret first.
const SVG_NS = 'http://www.w3.org/2000/svg';
function caret() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [name, value] of Object.entries({ class: 'caret', viewBox: '0 0 10 10', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(name, value);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M3.5 2 L7 5 L3.5 8');
  svg.append(path);
  return svg;
}

function renderTry(answer, labels) {
  const nodes = [];
  if (answer.kind === 'bang') {
    const row = el('div', 'trow command hl');
    row.append(el('span', 'cmd', `!${answer.hint.code}`), el('span', 'hint', answer.hint.title), el('span', 'enter', '↵'));
    nodes.push(row);
  }
  for (const { label, count, rows } of answer.sections ?? []) {
    const head = el('div', 'sec-head');
    head.append(caret(), el('span', 'dim', label), el('span', 'count', String(count)));
    nodes.push(head);
    for (const { code, name, domain } of rows) {
      const row = el('div', 'trow command');
      row.append(el('span', 'cmd', `!${code}`), el('span', 'hint', name), el('span', 'domain', domain));
      nodes.push(row);
    }
  }
  tryList.replaceChildren(...nodes);
  if (tryHint) tryHint.textContent = islandHintFor(answer, labels);
  // The page's own explanation goes under the Island, never inside it: the
  // app draws no row for text that isn't a bang.
  tryDest.replaceChildren();
  if (answer.kind === 'bang') tryDest.append('Return would open ', el('code', '', answer.hint.url));
  else if (answer.kind === 'other' || answer.kind === 'unknown-code') tryDest.append(message(answer.kind));
}

async function updateTry() {
  const data = await loadData();
  // Without the data the box keeps the example the page was built with.
  if (!data || !Bangs) return;
  renderTry(describeTryIt(tryInput.value, Bangs, data.entries, data.popular, data.labels), data.labels);
}

if (tryInput && tryList && tryDest) {
  tryInput.addEventListener('focus', loadData, { once: true });
  tryInput.addEventListener('input', updateTry);
  // There is nowhere to go: Return in this box does nothing.
  tryInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); });
  for (const chip of document.querySelectorAll('[data-chip]')) {
    chip.addEventListener('click', () => {
      tryInput.value = chip.dataset.chip;
      tryInput.focus();
      updateTry();
    });
  }
}

// ---------- directory ----------

const list = document.getElementById('bangs-rows');
const search = document.getElementById('bangs-search');
const countLine = document.getElementById('bangs-count');
const showing = document.getElementById('bangs-showing');
const more = document.getElementById('bangs-more');

if (list && search && countLine && showing && more) {
  const items = [...list.children];
  const byCode = new Map(items.map((item) => [item.dataset.code, item]));
  // Until the data arrives, search what the rows themselves show.
  let rows = items.map((item) => ({
    code: item.dataset.code,
    aliases: (item.querySelector('small')?.textContent ?? '').split(/\s+/).filter((part) => part.startsWith('!')).map((part) => part.slice(1)),
    name: item.querySelector('span')?.textContent ?? '',
    host: item.querySelector('em')?.textContent ?? '',
  }));
  let query = '';
  let limit = STEP;
  let reordered = false;
  let visible = new Set(items);

  function render() {
    const matched = filterBangs(rows, query);
    const shown = matched.slice(0, limit).map((row) => byCode.get(row.code)).filter(Boolean);
    const next = new Set(shown);
    for (const item of visible) if (!next.has(item)) item.hidden = true;
    for (const item of shown) item.hidden = false;
    visible = next;
    if (query) {
      // Best matches first: move the shown rows to the top, in order.
      for (let i = shown.length - 1; i >= 0; i -= 1) list.prepend(shown[i]);
      reordered = true;
    } else if (reordered) {
      list.append(...items);
      reordered = false;
    }
    countLine.textContent = `${format(matched.length)} ${matched.length === 1 ? 'bang' : 'bangs'}`;
    showing.textContent = matched.length
      ? `Showing ${format(shown.length)} of ${format(matched.length)}`
      : `No bang matches “${query}”.`;
    more.hidden = shown.length >= matched.length;
  }

  for (const item of items.slice(STEP)) item.hidden = true;
  visible = new Set(items.slice(0, STEP));
  render();

  // With the data, search sees every alias, not only the three a row shows.
  // The rows are already in the build's order, so nothing is re-sorted here.
  let adopted = false;
  const adopt = (data) => {
    if (!data || adopted) return;
    adopted = true;
    const aliases = new Map(data.entries.map(([code, codes]) => [code, codes]));
    rows = rows.map((row) => ({ ...row, aliases: aliases.get(row.code) ?? row.aliases }));
    if (query) render();
  };
  search.addEventListener('focus', () => loadData().then(adopt), { once: true });
  whenIdle(() => loadData().then(adopt));

  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = search.value;
      limit = STEP;
      render();
    }, 120);
  });
  more.addEventListener('click', () => {
    limit += STEP;
    render();
  });
}

