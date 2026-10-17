// /bangs: the search, the two views, and the icons. The page works without
// this script (every card and row is in the HTML); with it, the popular bangs
// show as cards until a visitor searches or presses Browse all, and the list
// then pages through the matches. The only requests it makes are for the
// page's own data asset and, as rows are shown, their icons from this site's
// /bang-icons/; what a visitor types never leaves the page.

import dataUrl from '../data/bangs.json?url';
import { filterBangs, iconUrl } from './bangs-directory.mjs';

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

// ---------- icons ----------

// An icon covers its lettered tile once it has loaded; one that fails is
// removed, so the letter is what stays and no broken image ever shows.
function watchIcon(img) {
  const settle = () => {
    if (img.naturalWidth > 0) img.classList.add('is-loaded');
    else img.remove();
  };
  if (img.complete) settle();
  else {
    img.addEventListener('load', settle, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
  }
}

function addIcon(tile, host) {
  if (tile.querySelector('img')) return;
  const img = document.createElement('img');
  img.alt = '';
  img.width = 32;
  img.height = 32;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = iconUrl(host);
  tile.append(img);
  watchIcon(img);
}

// The cards' icons wait in data-src, so a page without this script never
// draws a broken image over a tile.
document.querySelectorAll('#bangs-cards img[data-src]').forEach((img) => {
  img.src = img.dataset.src;
  watchIcon(img);
});

// ---------- views and the list ----------

const main = document.querySelector('.bangs-page');
const list = document.getElementById('bangs-rows');
const search = document.getElementById('bangs-search');
const countLine = document.getElementById('bangs-count');
const showing = document.getElementById('bangs-showing');
const more = document.getElementById('bangs-more');
const browse = document.getElementById('bangs-browse');
const searchThem = document.getElementById('bangs-search-them');
const listSection = document.getElementById('bangs-list');
const listTitle = document.getElementById('bangs-dir-title');
const back = document.getElementById('bangs-back');

if (main && list && search && countLine && showing && more && browse && searchThem && listSection && listTitle && back) {
  const items = [...list.children];
  const byCode = new Map(items.map((item) => [item.dataset.code, item]));
  // Until the data arrives, search what the rows themselves show.
  let rows = items.map((item) => ({
    code: item.dataset.code,
    aliases: (item.querySelector('small')?.textContent ?? '').split(/\s+/).filter((part) => part.startsWith('!')).map((part) => part.slice(1)),
    name: item.querySelector(':scope > span:not(.bangs-icon)')?.textContent ?? '',
    host: item.querySelector('em')?.textContent ?? '',
  }));
  const hostOf = new Map(rows.map((row) => [row.code, row.host]));
  let query = '';
  let browsing = false;
  let limit = STEP;
  let reordered = false;
  let visible = new Set(items);

  function render() {
    const listing = Boolean(query) || browsing;
    main.dataset.view = listing ? 'list' : 'cards';
    const matched = filterBangs(rows, query);
    const shown = matched.slice(0, limit).map((row) => byCode.get(row.code)).filter(Boolean);
    const next = new Set(shown);
    for (const item of visible) if (!next.has(item)) item.hidden = true;
    for (const item of shown) {
      item.hidden = false;
      if (listing) addIcon(item.querySelector('.bangs-icon'), hostOf.get(item.dataset.code));
    }
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
      // Clearing the search goes back to the cards, and a new search starts
      // from the first page of matches.
      if (!query) browsing = false;
      limit = STEP;
      render();
    }, 120);
  });
  more.addEventListener('click', () => {
    limit += STEP;
    render();
  });
  // Browse all hides itself, so focus moves to the list's heading; going
  // back clears any search and returns focus to Browse all.
  browse.addEventListener('click', () => {
    browsing = true;
    limit = STEP;
    render();
    listTitle.focus();
  });
  back.addEventListener('click', () => {
    clearTimeout(timer);
    search.value = '';
    query = '';
    browsing = false;
    limit = STEP;
    render();
    browse.focus();
  });
  searchThem.addEventListener('click', () => search.focus());
}
