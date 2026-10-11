'use strict';
// Day groups and time labels for blanc://history. Served flat via <script>
// and require-able by node tests. Days are local calendar days.
(function (root, factory) {
  // The interface language's translator: the page's blancI18n in the app,
  // the English catalog under Node (unit tests require this module directly).
  const i18n = root.blancI18n || (() => {
    const { createTranslator } = require('./i18n.js');
    return { t: createTranslator({ locale: 'en', messages: require('./strings.en.js').messages }) };
  })();
  const api = factory(i18n.t);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancHistoryGroups = api;
})(typeof self !== 'undefined' ? self : this, function (t) {
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // `relative` marks Today and Yesterday, the two labels from the catalog;
  // every other day is the locale's own date.
  function dayLabel(date, now, locale) {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (dayKey(date) === dayKey(now)) return { label: t('history.day.today'), relative: true };
    if (dayKey(date) === dayKey(yesterday)) return { label: t('history.day.yesterday'), relative: true };
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
    return { label: date.toLocaleDateString(locale, options), relative: false };
  }

  function groupByDay(entries, now = new Date(), locale = undefined) {
    const groups = [];
    for (const entry of entries) {
      const date = new Date(entry.visitedAt);
      const key = dayKey(date);
      if (groups.at(-1)?.key !== key) groups.push({ key, ...dayLabel(date, now, locale), entries: [] });
      groups.at(-1).entries.push(entry);
    }
    return groups.map(({ label, relative, entries: items }) => ({ label, relative, entries: items }));
  }

  function timeLabel(ts, locale = undefined) {
    return new Date(ts).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  }

  return { groupByDay, timeLabel };
});
