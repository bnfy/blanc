'use strict';
// Day groups and time labels for blanc://history. Served flat via <script>
// and require-able by node tests. Days are local calendar days.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancHistoryGroups = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  function dayLabel(date, now, locale) {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (dayKey(date) === dayKey(now)) return 'Today';
    if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString(locale, options);
  }

  function groupByDay(entries, now = new Date(), locale = undefined) {
    const groups = [];
    for (const entry of entries) {
      const date = new Date(entry.visitedAt);
      const key = dayKey(date);
      if (groups.at(-1)?.key !== key) groups.push({ key, label: dayLabel(date, now, locale), entries: [] });
      groups.at(-1).entries.push(entry);
    }
    return groups.map(({ label, entries: items }) => ({ label, entries: items }));
  }

  function timeLabel(ts, locale = undefined) {
    return new Date(ts).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  }

  return { groupByDay, timeLabel };
});
