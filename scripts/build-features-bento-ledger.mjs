// Records the Features page (/features) copy as release-backed claims.
//
//   node scripts/build-features-bento-ledger.mjs
//
// Rerun after any copy change to site/src/pages/features.astro. It rewrites
// docs/website-features-bento-claims-v1.30.json and, in
// docs/website-revamp-claims-v1.27.json, supersedes Features-page claims whose
// wording left the page and replaces this script's own reviewed copy update
// (the prose test in test/unit/site-navigation.test.js replays it). Safe to
// run repeatedly: earlier output from this script is replaced, not appended.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = file => fs.readFileSync(file, 'utf8');
const entities = { rsquo: '’', lsquo: '‘', amp: '&', ldquo: '“', rdquo: '”' };
const normalize = text => text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*(?:>|$)/g, '')
  .replace(/&(rsquo|lsquo|amp|ldquo|rdquo);/g, (_, name) => entities[name]).replace(/\s+/g, ' ').trim();
const file = 'site/src/pages/features.astro';
const ledgerPath = 'docs/website-features-bento-claims-v1.30.json';
const v127Path = 'docs/website-revamp-claims-v1.27.json';
const LABEL = 'features-bento';
const REASON = ' October 8 bento redesign: tile board, dense grid and popovers with feature-first copy, verified at public v1.30.1 and recorded in docs/website-features-bento-claims-v1.30.json.';
const release = { publicRelease: 'v1.30.1', sourceSha: '9e337ac583e81bae509cfc970b9d97a81f3287ba', releaseEvidence: 'docs/release-incidents/2026-10-08-v1.30.1.md' };
const page = read(file);
const v127 = JSON.parse(read(v127Path));
const reorder = JSON.parse(read('docs/website-reorder-claims-v1.30.json'));

// measurements: records observed in the installed public release after it
// shipped (so not in the tagged tree), each naming the value the page shows.
const G = (evidence, qualification, measurements) => ({ evidence, qualification, ...(measurements && { measurements }) });
const evidenceGroups = {
  overview: G(['LICENSE', 'package.json', 'src/renderer/index.html', 'spec/acceptance/tabs-and-groups.feature'],
    'Desktop builds for macOS, Windows and Linux; first-party code MIT with the carve-outs in THIRD-PARTY-NOTICES.md and ASSET-LICENSE.md. Grouping is user-directed; Blanc does not infer tasks or organize tabs by meaning.'),
  glance: G(['src/main/glance-layout.js', 'src/main/main.js', 'spec/acceptance/glance.feature'], 'Another tab from the same window beside the main page; resizable, swappable, closable; never restored or synced.'),
  island: G(['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/styles.css', 'spec/acceptance/island-and-commands.feature'], 'The resting Island keeps a reserved band above the page and replaces the tab strip and toolbar; its panel overlays the page.'),
  quietTabs: G(['src/main/tab-sleep.js', 'settings-schema/schema.json', 'spec/acceptance/quiet-tabs.feature', 'test/unit/tab-sleep.test.js'], 'Eligible background tabs release renderer memory after the device-local delay (off, 30m, 1h default, 6h) and reload when revisited; audible, muted, pinned, capturing and dirty tabs stay awake. Claims name memory only.'),
  wallpaper: G(['src/renderer/pages/newtab.js', 'src/renderer/pages/newtab-wallpaper.js', 'src/main/settings.js'], 'Time-of-day wallpaper is a Settings → General option; the artwork follows the local computer clock through dawn, day, dusk and night. Its on/off choice (newtabDynamicWallpaper) is in SYNCED_KEYS, so it follows the user only when they turn on opt-in Sync.'),
  blocking: G(['src/main/adblock.js', 'src/main/shield-model.js', 'settings-schema/schema.json', 'src/renderer/overlay.html', 'src/renderer/overlay.js', 'spec/acceptance/ad-blocking.feature', 'adblock/sources/pinned.json'], 'Blanc Blocker on by default with bundled EasyList and EasyPrivacy; shield popover shows count, connection scheme and a per-site switch that reloads, and its Change button opens Choose a blocker (Blanc Blocker or uBlock Origin, applied after restart). Built in, so nothing to install. No blocker removes every ad or tracker. The optional uBlock Origin is the full, unmodified uBO 1.75.0 on supported builds (docs/ublock-origin-support-matrix-2026-10-03.md); private tabs use Blanc Blocker. The nytimes.com count of 24 was measured in installed v1.30.1 (build 1301) 10 s after opening the page in fresh profiles on October 8, 2026 (24, 24, 24, then 24, 24, 26), recorded in docs/website-blocking-count-v1.30.1.json; counts vary by visit.', ['docs/website-blocking-count-v1.30.1.json']),
  mahjong: G(['src/renderer/pages/mahjong-engine.js', 'src/renderer/pages/mahjong-state.js', 'src/renderer/pages/mahjong.js'], 'Opens from every Start Page footer in its own tab; eight boards, Daily deal, hints, undo, device-local records; offline single-player, not synced.'),
  reopening: G(['src/main/closed-tabs.js', 'src/main/main.js', 'src/renderer/overlay.js', 'test/unit/closed-tabs.test.js'], 'Per-window Recently Closed, up to 25 entries for one hour, memory only; at most one eligible page per window keeps its live view for about 30 seconds; private tabs never recorded; no promise of exact recovery.'),
  privateTabs: G(['src/main/main.js', 'src/main/tab-view.js', 'spec/acceptance/private-tabs.feature'], 'Separate non-persistent session; excluded from history, session restore, sync and Recently Closed; private Island theme and quick-exit chip. Not anonymity; downloads remain on disk.'),
  profiles: G(['src/main/local-profiles.js', 'src/main/local-profile-model.js', 'src/main/profile-sessions.js', 'spec/acceptance/local-profiles.feature'], 'Named profiles separate cookies, site data, Favorites, history, download metadata and remembered permissions; settings and Patron are device-level.'),
  quickSwitcher: G(['src/renderer/overlay.html', 'src/renderer/overlay.js', 'copy/slash-commands.json', 'spec/acceptance/island-and-commands.feature', 'spec/acceptance/find-favorites-history.feature'], 'Command/Ctrl+L; matches tabs, Favorites, history and Named Groups; Enter opens the highlighted result, exact-text web search chosen explicitly; slash commands exist in copy/slash-commands.json.'),
  startPage: G(['src/main/settings.js', 'src/renderer/pages/newtab.js', 'settings-schema/schema.json'], 'Four layouts Ledger, Billboard, Shelf, Tally; Billboard uses local history; layout choice is synced; history is not.'),
  namedGroups: G(['spec/acceptance/tabs-and-groups.feature', 'spec/acceptance/tab-drag.feature', 'src/renderer/overlay.js', 'src/main/tab-context-menu-model.js'], 'User-created and user-assigned via /group or the tab menu; Blanc never infers or sorts groups; drag ordering user-directed (v1.30.0).'),
  workspaces: G(['src/main/workspaces.js', 'src/main/main.js', 'spec/acceptance/F41-named-workspaces.feature'], 'Active Patrons create and save; a bound workspace saves tabs and groups as the user browses; existing workspaces stay usable after membership ends.'),
  sync: G(['src/main/sync.js', 'src/main/sync-crypto.js', 'spec/acceptance/sync.feature'], 'Opt-in, end-to-end encrypted, Personal profile only; Favorites, settings and optional open-tab snapshots; never history, cookies or private tabs.'),
  verticalTabs: G(['src/renderer/vertical-tabs.js', 'spec/acceptance/vertical-tabs.feature', 'spec/acceptance/tab-drag.feature'], 'Optional resizable left rail; Island remains the address and command surface; drag ordering user-directed.'),
  gestures: G(['src/main/mouse-gestures.js', 'settings-schema/schema.json', 'test/unit/mouse-gestures.test.js'], 'Off by default; right-button drag or Alt/Option one-finger trackpad drag; assignable actions include Back, Forward, Reload; device-local.'),
  onepassword: G(['src/main/onepassword-broker.js', 'src/main/onepassword-availability.js', 'src/main/credential-fill-controller.js', 'docs/1password-integration.md'], 'macOS only, optional, needs the installed 1Password app and account; explicit invoke (⌥⌘P, menu, /1password); never automatic.'),
  ublock: G(['docs/ublock-origin-support-matrix-2026-10-03.md', 'docs/ublock-origin-shipping-2026-10-03.md', 'src/renderer/overlay.html'], 'Full uBO 1.75.0 for regular tabs on Apple Silicon, native Intel Mac, Windows x64 and Linux x64; chosen from the shield, applies after restart; private tabs and Rosetta use Blanc Blocker.'),
  darkWebsites: G(['src/main/dark-websites.js', 'src/renderer/overlay.html', 'dark-reader/pinned.json'], 'Off by default, device-local; darkens http(s) pages without their own dark mode only while Blanc is dark; per-site switch in the shield; iframes keep their colors.'),
  passkeys: G(['src/main/webauthn.js', 'test/unit/webauthn-packaging.test.js'], 'macOS Touch ID passkeys created by Blanc, device-bound in the Secure Enclave; does not read third-party credential managers.'),
  reorder: G(['src/renderer/tab-drag.js', 'spec/acceptance/tab-drag.feature', 'test/unit/tab-drag.test.js'], 'v1.30.0 drag and Alt/Option+Shift+Up/Down in the expanded Island and vertical tabs; user-directed; pinned state unchanged.'),
  importing: G(['src/main/bookmark-import.js', 'src/main/browser-data-import.js'], 'Import from a detected browser profile or an HTML file in Favorites; processed on the device.'),
  capture: G(['src/main/capture-state.js', 'src/main/permissions.js'], 'Island chip and popover show live microphone/camera use and can stop it; sites must request media permission.'),
  recovery: G(['src/main/session-recovery.js', 'src/main/diagnostics-export.js'], 'After an unclean shutdown the user chooses restore or start fresh; diagnostics export is local and user-reviewed.'),
  downloads: G(['src/main/downloads.js'], 'Resume when Chromium can continue, Retry (http/https) otherwise; not every download can be completed.'),
  search: G(['settings-schema/schema.json', 'src/main/settings.js'], 'Engines DuckDuckGo, Google, Bing, Brave; search suggestions can be turned off.'),
  pinMute: G(['copy/slash-commands.json', 'src/main/tab-sleep.js'], '/pin and /mute exist; pinned tabs are excluded from Quiet Tabs.'),
  defaultBrowser: G(['src/main/windows-default-browser.js', 'src/renderer/pages/settings.html'], 'First-run setup offers default-browser choice; Settings has Make default; on Windows it opens the system Default apps page.'),
  security: G(['src/main/main.js', 'src/main/permissions.js'], 'Tab views run with sandbox and context isolation; media, geolocation and notifications are prompted permissions.'),
  releases: G(['docs/release-verification.md', 'scripts/release.sh'], 'macOS signed and notarized, Windows Authenticode-signed, every release ships a Sigstore-signed SHA256SUMS manifest.'),
  themes: G(['settings-schema/schema.json', 'copy/slash-commands.json'], 'System, light or dark via Settings or /theme; nativeTheme propagates to chrome, internal pages and web content.'),
};
const groupForId = {
  glance: 'glance', island: 'island', 'quiet-tabs': 'quietTabs', wallpaper: 'wallpaper', 'ad-blocking': 'blocking',
  mahjong: 'mahjong', blanc: 'overview', 'reopen-closed-tabs': 'reopening', 'private-tabs': 'privateTabs', profiles: 'profiles',
  commands: 'quickSwitcher', 'slash-commands': 'quickSwitcher', 'start-page': 'startPage', 'tab-groups': 'namedGroups',
  workspaces: 'workspaces', sync: 'sync', 'vertical-tabs': 'verticalTabs', 'mouse-gestures': 'gestures', '1password': 'onepassword',
  'ublock-origin': 'ublock', 'dark-websites': 'darkWebsites', passkeys: 'passkeys', 'drag-to-reorder': 'reorder', import: 'importing',
  capture: 'capture', recovery: 'recovery', downloads: 'downloads', 'search-engine': 'search', 'pin-mute': 'pinMute',
  'default-browser': 'defaultBrowser', security: 'security', 'signed-releases': 'releases', themes: 'themes',
};


// 1. Claims: every text element above the Patron band that is not already an
//    existing claim's exact wording. Glyph-only text (the ← → buttons) is skipped.
const main = page.slice(page.indexOf('<main'), page.indexOf('class="bento-patron"'));
const existing = new Set([...v127.claims, ...reorder.claims].filter(c => c.source === file).map(c => c.exactWording));
const starts = [...main.matchAll(/<(?:BentoTile|BentoSmall|FeaturePop)\b[^>]*\bid="([^"]+)"/g)].map(m => [m.index, m[1]]);
const ownerAt = index => starts.filter(([start]) => start <= index).at(-1)?.[1];
const firstTile = starts[0][0];
const claims = [];
for (const match of main.matchAll(/<(h[1-6]|p|figcaption|li|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
  const exactWording = normalize(match[2]);
  if (!/\p{L}/u.test(exactWording) || existing.has(exactWording)) continue;
  const group = match.index < firstTile ? 'overview' : groupForId[ownerAt(match.index)];
  if (!group) throw new Error(`no evidence group for: ${exactWording}`);
  claims.push({ id: `bento-130-${String(claims.length + 1).padStart(3, '0')}`, source: file, exactWording, subject: 'Blanc', evidenceGroups: [group], verdict: 'qualified' });
}
const used = new Set(claims.flatMap(c => c.evidenceGroups));
fs.writeFileSync(ledgerPath, `${JSON.stringify({
  ...release,
  scope: 'Features page bento redesign (October 8, 2026). Every evidence path is at the immutable publicRelease tag. Tile visuals reuse captures already published on the site; decorative mini UI repeats public interface strings and labels sample numbers as samples. Replaced wording is recorded as supersededClaims in docs/website-revamp-claims-v1.27.json, and the reviewed prose as a reviewedCopyUpdate there. Regenerate with node scripts/build-features-bento-ledger.mjs.',
  evidenceGroups: Object.fromEntries(Object.entries(evidenceGroups).filter(([key]) => used.has(key))),
  claims,
}, null, 2)}\n`);

// 2. Supersede v1.27 Features-page claims whose wording left the page.
const flat = page.replace(/\s+/g, ' ');
const gone = v127.claims.filter(c => c.source === file && !normalize(page).includes(c.exactWording) && !flat.includes(c.exactWording));
v127.claims = v127.claims.filter(c => !gone.includes(c));
for (const claim of gone) v127.supersededClaims.push({ id: claim.id, historicalLedger: v127Path,
  reason: 'October 8, 2026 Features page bento redesign replaced this wording; see docs/website-features-bento-claims-v1.30.json. The original wording remains in git history.' });

// 3. Reviewed copy update. The prose test replays the replacements on the
//    pre-revamp source and compares only h1-h6/p/figcaption text, so the
//    reviewed <main> is recorded as that prose sequence, not the markup.
const revision = '358cc02df00f10d184b84dbfdae6f6bfdfa6a790'; // same as site-navigation.test.js
const entry = v127.retainedFeaturePages.reviewedCopyUpdates.find(update => update.source === file);
entry.replacements = entry.replacements.filter(replacement => replacement.label !== LABEL);
entry.reason = entry.reason.replace(REASON, '') + REASON;
let reviewed = execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8' });
for (const { before, after } of entry.replacements) reviewed = reviewed.replace(before, after);
const mainBlock = text => text.slice(text.indexOf('<main'), text.indexOf('</main>') + '</main>'.length);
const prose = [...mainBlock(page).matchAll(/<(?:h[1-6]|p|figcaption)\b[^>]*>[\s\S]*?<\/(?:h[1-6]|p|figcaption)>/g)].map(match => match[0]).join('\n');
if (/\$[$&`']/.test(prose)) throw new Error('reviewed prose contains a $ pattern String.replace would expand');
entry.replacements.push({ label: LABEL, before: mainBlock(reviewed), after: prose });
fs.writeFileSync(v127Path, `${JSON.stringify(v127, null, 2)}\n`);
console.log(`${claims.length} claims recorded; ${gone.length} superseded now.`);
