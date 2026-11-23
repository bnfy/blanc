// The Betas panel on /download: a click anywhere on a beta's row opens or closes
// its details (the chevron stays the keyboard and screen-reader control), and
// each beta's "Last updated" line says how long ago its release was published.
// Without scripting the line stays hidden and the details show the release day.

const DAY = 86400000;
const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

// published: YYYY-MM-DD (UTC), as in the beta data files.
export function updatedText(published, now = new Date()) {
  const then = Date.parse(`${published}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.max(0, Math.round((today - then) / DAY));
  if (days < 7) return relative.format(-days, 'day');
  if (days < 30) return relative.format(-Math.floor(days / 7), 'week');
  if (days < 365) return relative.format(-Math.floor(days / 30), 'month');
  return relative.format(-Math.floor(days / 365), 'year');
}

const INTERACTIVE = 'a, button, input, label, select, textarea, summary';

export function initBetaRows(root = document) {
  for (const time of root.querySelectorAll('time[data-beta-updated]')) {
    const text = updatedText(time.dateTime);
    if (!text) continue;
    time.textContent = text;
    time.title = new Date(`${time.dateTime}T00:00:00Z`)
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    time.closest('.dl-beta-updated')?.removeAttribute('hidden');
  }
  for (const row of root.querySelectorAll('.dl-beta-row')) {
    const line = row.querySelector('.dl-beta-line');
    const details = row.querySelector(':scope > .dl-beta-more');
    if (!line || !details) continue;
    line.classList.add('dl-beta-line--toggle');
    line.addEventListener('click', (event) => {
      if (event.target.closest(INTERACTIVE)) return;
      // Leave a text selection alone.
      if (String(globalThis.getSelection?.() ?? '')) return;
      details.open = !details.open;
    });
  }
}
