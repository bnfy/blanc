'use strict';
// Page markup without its interface keys (F44 data-i18n* attributes), for
// tests that check structure and English by pattern. copy:check separately
// verifies that the inline English matches the catalog.
const withoutInterfaceKeys = (html) => html.replace(/\s+data-i18n(?:-[\w-]+)?="[^"]*"/g, '');

module.exports = { withoutInterfaceKeys };
