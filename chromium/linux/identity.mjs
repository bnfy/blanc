// Exact identity values already owned by shipping Blanc, Chromium or Chrome.
// The Linux package scan also checks its installed names against these values.
export const FORBIDDEN = Object.freeze([
  'chromium', 'chromium-browser', 'chromium-browser.desktop', 'google-chrome',
  'Chromium Safe Storage', 'Chromium Keys', 'Chrome Safe Storage', 'Chrome Keys',
  'chrome', 'Blanc', 'blanc', 'blanc.desktop', '~/.config/Blanc', '~/.config/chromium',
  '/opt/chromium.org/chromium', '/opt/google/chrome',
]);
