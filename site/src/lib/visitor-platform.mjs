// The desktop platform a What's New visitor is on, so the page can leave out
// highlights for other platforms (Sunrise Gold is a macOS icon). Pure and
// browser-safe: the page script passes in navigator and location fields.
// null means unknown (a phone, or nothing to go on), and then every
// highlight shows. ?platform=mac|windows|linux overrides it for checking.
export const PLATFORMS = Object.freeze(['mac', 'windows', 'linux']);

export function visitorPlatform({ search = '', userAgentData, platform = '', userAgent = '' } = {}) {
  const forced = new URLSearchParams(search).get('platform');
  if (PLATFORMS.includes(forced)) return forced;
  const hinted = userAgentData?.platform;
  if (hinted === 'macOS') return 'mac';
  if (hinted === 'Windows') return 'windows';
  if (hinted === 'Linux') return 'linux';
  if (/^Mac/.test(platform)) return 'mac';
  if (/^Win/.test(platform)) return 'windows';
  if (/Linux/.test(platform) && !/Android/.test(userAgent)) return 'linux';
  return null;
}
