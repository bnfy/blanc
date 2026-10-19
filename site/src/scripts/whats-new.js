// What's New pages: one highlight at a time, after Chrome's What's New tab.
// Without this script every highlight shows in order and the tile row stays
// hidden. Tiles, Next and the arrow keys (in the tile row) move between
// highlights; Next and the arrows wrap. The URL hash follows the highlight
// shown, and a hash on arrival selects it. Clips play only when the visitor
// allows motion; under reduced motion they wait on their poster.
const root = document.querySelector('.wn');
if (root) {
  const sections = [...root.querySelectorAll('.wn-highlight')];
  const tiles = [...root.querySelectorAll('.wn-tile')];
  const tileRow = root.querySelector('.wn-tiles');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: no-preference)');
  let current = -1;

  const indexOfId = (id) => sections.findIndex((section) => section.id === id);
  const wrap = (index) => (index + sections.length) % sections.length;

  function settleVideos() {
    sections.forEach((section, index) => {
      const video = section.querySelector('video');
      if (!video) return;
      const replay = section.querySelector('.wn-replay');
      if (index !== current) {
        video.pause();
        return;
      }
      if (replay) replay.hidden = false;
      if (motionQuery.matches) video.play().catch(() => {});
    });
  }

  // Scroll the tile row sideways to the current tile, never the page.
  function revealTile(tile) {
    if (!tile || !tileRow) return;
    const left = tile.offsetLeft - tileRow.offsetLeft;
    if (left < tileRow.scrollLeft || left + tile.offsetWidth > tileRow.scrollLeft + tileRow.clientWidth) {
      tileRow.scrollLeft = left;
    }
  }

  function show(index, { updateHash = true } = {}) {
    current = wrap(index);
    sections.forEach((section, i) => { section.hidden = i !== current; });
    tiles.forEach((tile, i) => tile.setAttribute('aria-current', i === current ? 'true' : 'false'));
    revealTile(tiles[current]);
    if (updateHash) history.replaceState(null, '', `#${sections[current].id}`);
    settleVideos();
  }

  root.classList.add('is-enhanced');
  show(Math.max(0, indexOfId(decodeURIComponent(location.hash.slice(1)))), { updateHash: false });
  // A hash names a highlight, not a place to scroll: the page opens at its
  // top, header in view, as it does without one.
  // The browser's own jump to the fragment can land after this script runs,
  // so undo it again once the page has loaded.
  if (location.hash) {
    window.scrollTo(0, 0);
    window.addEventListener('load', () => requestAnimationFrame(() => window.scrollTo(0, 0)), { once: true });
  }

  tiles.forEach((tile, index) => {
    tile.addEventListener('click', () => show(index));
    tile.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      show(current + (event.key === 'ArrowRight' ? 1 : -1));
      tiles[current].focus();
    });
  });
  for (const next of root.querySelectorAll('.wn-next')) {
    next.addEventListener('click', () => {
      show(current + 1);
      sections[current].querySelector('.wn-next')?.focus({ preventScroll: true });
    });
  }
  for (const replay of root.querySelectorAll('.wn-replay')) {
    replay.addEventListener('click', () => {
      const video = replay.parentElement.querySelector('video');
      video.currentTime = 0;
      video.play().catch(() => {});
    });
  }
  window.addEventListener('hashchange', () => {
    const index = indexOfId(decodeURIComponent(location.hash.slice(1)));
    if (index >= 0 && index !== current) show(index, { updateHash: false });
  });
}
