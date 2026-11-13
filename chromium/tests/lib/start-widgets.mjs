// V24 (owner, 2026-11-13): Billboard is the one Start Page layout. The old
// layouts are the widget sets the one-time migration gives them
// (blanc_prototype_ui.cc widgetsRead): Ledger showed Favorites and other
// devices, Tally Favorites (its week's chart is Billboard's own line since
// V26, which took the Blocked this week widget away), Shelf a grid of
// favorites.
export const LAYOUT_WIDGETS = Object.freeze({
  ledger: {favorites: true, devices: true, shortcuts: false},
  tally: {favorites: true, devices: false, shortcuts: false},
  shelf: {favorites: true, devices: false, shortcuts: true},
  billboard: {favorites: false, devices: false, shortcuts: false},
});
// The Favorites widget lists up to eight, the most any old layout showed.
export const FAVORITES_WIDGET_LIMIT = 8;
// The same, read inside a Start Page document (its state.widgets).
export const PAGE_LAYOUT = `(()=>{const m=${JSON.stringify(LAYOUT_WIDGETS)};const w=typeof state==='object'?state.widgets:null;
 return Object.keys(m).find(n=>Object.entries(m[n]).every(([k,v])=>w?.[k]===v))??'custom';})()`;
