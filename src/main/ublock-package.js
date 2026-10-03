'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function readVerifiedPackage(root) {
  const pin = JSON.parse(fs.readFileSync(path.join(root, 'pinned.json'), 'utf8'));
  if (pin.format !== 1 || pin.version !== '1.75.0' || !Array.isArray(pin.files)
    || pin.files.length > 2000 || !Array.isArray(pin.sources)) throw new Error('ubo-package-invalid');
  const files = new Map();
  const seen = new Set();
  for (const entry of pin.files) {
    if (!/^[a-zA-Z0-9_./+@-]+$/.test(entry.path) || entry.path.split('/').some(p => !p || p === '..' || p === '.')) throw new Error('ubo-package-path');
    if (seen.has(entry.path)) throw new Error('ubo-package-duplicate');
    seen.add(entry.path);
    const bytes = fs.readFileSync(path.join(root, 'upstream', entry.path));
    if (bytes.length !== entry.size || hash(bytes) !== entry.sha256) throw new Error('ubo-package-integrity');
    files.set(entry.path, bytes);
  }
  for (const entry of pin.sources) {
    if (!/^[a-zA-Z0-9_./+-]+$/.test(entry.path) || entry.path.split('/').some(p => !p || p === '..' || p === '.')) throw new Error('ubo-source-path');
    if (hash(fs.readFileSync(path.join(root, entry.path))) !== entry.sha256) throw new Error('ubo-source-integrity');
  }
  return { pin, files };
}

const UI_ICONS = ['pipette', 'zap', 'list', 'settings', 'chevron-left', 'chevron-right', 'chevron-down', 'x', 'ellipsis', 'lock-keyhole', 'undo-2', 'rotate-cw', 'house', 'external-link', 'search', 'check', 'refresh-cw', 'download', 'upload', 'save', 'book-open', 'info', 'circle-help'];
const HOST_INPUTS = [
  ...['ublock-host-mainworld.js', 'ublock-bridge-mainworld.js', 'ublock-css-mainworld.js', 'ublock-bridge-preload.js', 'ublock-package.js', 'ublock-host-policy.js', 'ublock-provider.js', 'ublock-registry.js', 'ublock-documents.js', 'ublock-popup-mainworld.js', 'ublock-popup-preload.js', 'ublock-popup-host.js', 'ublock-dashboard-mainworld.js'].map(name => 'src/main/' + name),
  'src/renderer/ublock-popup.css', 'src/renderer/ublock-dashboard.css', 'src/renderer/sunrise-hero-mark.png', 'src/renderer/pages/inter-latin.woff2',
  ...UI_ICONS.map(name => 'src/renderer/ublock-popup-icons/' + name + '.svg'),
  'src/renderer/ublock-popup-icons/README.md', 'src/renderer/ublock-popup-icons/lucide-LICENSE.txt',
];
function readHostSources(root) {
  const read = name => fs.readFileSync(path.join(root, name));
  return {
    adapter: read('src/main/ublock-host-mainworld.js'), bridge: read('src/main/ublock-bridge-mainworld.js'),
    dashboardScript: read('src/main/ublock-dashboard-mainworld.js'), dashboardStyle: read('src/renderer/ublock-dashboard.css'),
    popupScript: read('src/main/ublock-popup-mainworld.js'), popupStyle: read('src/renderer/ublock-popup.css'),
    popupMark: read('src/renderer/sunrise-hero-mark.png'), popupFont: read('src/renderer/pages/inter-latin.woff2'),
    popupIcons: new Map(UI_ICONS.map(name => [name, read('src/renderer/ublock-popup-icons/' + name + '.svg')])),
  };
}

function adaptPackage(files, hostSources) {
  const result = new Map(files);
  const replace = (text, from, to) => {
    if (text.split(from).length !== 2) throw new Error('ubo-patch-version');
    return text.replace(from, to);
  };
  for (const [name, bytes] of files) {
    if (!name.endsWith('.html')) continue;
    const html = bytes.toString('utf8');
    if ((html.match(/<head(?:\s[^>]*)?>/gi) || []).length !== 1) throw new Error('ubo-patch-version');
    result.set(name, Buffer.from(html.replace(/<head(?:\s[^>]*)?>/i, '$&\n<!-- Modified by Blanc on 2026-10-02: browser host adaptation. -->\n<script src="/blanc-host.js"></script>')));
  }
  // Host-only resource constraint. The filter engine remains upstream code;
  // imported backups/settings cannot turn remote data into executable resources.
  const storage = result.get('js/storage.js').toString('utf8');
  const target = 'const userResourcesLocation = this.hiddenSettings.userResourcesLocation;';
  if (!storage.includes(target)) throw new Error('ubo-patch-version');
  let adaptedStorage = replace(storage, target, "const userResourcesLocation = 'unset'; // Blanc: bundled executable resources only");
  adaptedStorage = replace(adaptedStorage, 'const success = await redirectEngine.resourcesFromSelfie(io);',
    'const success = false; // Blanc: rebuild executable resources from verified package every launch');
  adaptedStorage = replace(adaptedStorage, 'µb.saveHiddenSettings = function() {',
    "µb.saveHiddenSettings = function() {\n    this.hiddenSettings.userResourcesLocation = 'unset'; // Blanc policy, including restore");
  adaptedStorage = replace(adaptedStorage, "broadcast({ what: 'hiddenSettingsChanged' });\n};",
    "this.hiddenSettings.userResourcesLocation = 'unset'; // Blanc: reject stored custom resources\n    broadcast({ what: 'hiddenSettingsChanged' });\n};");
  result.set('js/storage.js', Buffer.from(adaptedStorage));
  const start = result.get('js/start.js').toString('utf8');
  if (!start.includes('µb.isReadyResolve();')) throw new Error('ubo-patch-version');
  result.set('js/start.js', Buffer.from(replace(replace(start,
    "if ( lastVersionInt === 0 && vAPI.webextFlavor.soup.has('chromium') ) {",
    "if ( lastVersionInt === 0 && vAPI.webextFlavor.soup.has('chromium') && !self.BlancUboHost ) {"),
  'µb.isReadyResolve();', 'µb.isReadyResolve();\nself.BlancUboHost.ready();')));
  const webext = result.get('js/webext.js').toString('utf8');
  if (!webext.includes('// browser.privacy entries\n{')) throw new Error('ubo-patch-version');
  result.set('js/webext.js', Buffer.from(replace(replace(webext,
    'privacy: {\n    },', 'privacy: undefined, // Blanc: browser policy remains in the host'),
  '// browser.privacy entries\n{', '// browser.privacy entries\nif ( chrome.privacy instanceof Object ) {')));
  const messaging = result.get('js/messaging.js').toString('utf8');
  if (!messaging.includes('vAPI.browserSettings.canLeakLocalIPAddresses')) throw new Error('ubo-patch-version');
  result.set('js/messaging.js', Buffer.from(replace(replace(messaging,
    'vAPI.browserSettings.canLeakLocalIPAddresses', 'vAPI.browserSettings?.canLeakLocalIPAddresses'),
  '    // Whitelist directives can be represented as an array or as a',
  '    delete hiddenSettings.userResourcesLocation; // Blanc: never import executable resources\n\n    // Whitelist directives can be represented as an array or as a')));
  result.set('js/vapi-common.js', Buffer.from(replace(result.get('js/vapi-common.js').toString('utf8'),
    'vAPI.closePopup = function() {',
    'vAPI.closePopup = function() {\n    self.BlancUboHost.closePopup(); return; // Blanc owns the popup view lifecycle')));
  // Security adaptation: these values gate web-accessible resources and identify
  // content-script sessions. Generate them in the native isolated realm using
  // cryptographic randomness, including on ordinary HTTP pages.
  result.set('js/vapi-background.js', Buffer.from(replace(result.get('js/vapi-background.js').toString('utf8'),
    "        secret += (Math.floor(Math.random() * 2176782336) + 2176782336).toString(36).slice(1);",
    "        secret += Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); // Blanc: 128 random bits per segment")));
  result.set('js/vapi-client.js', Buffer.from(replace(result.get('js/vapi-client.js').toString('utf8'),
    `    const n = Math.random();
    return String.fromCharCode(n * 25 + 97) +
        Math.floor(
            (0.25 + n * 0.75) * Number.MAX_SAFE_INTEGER
        ).toString(36).slice(-8);`,
    "    return 'a' + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); // Blanc: CSS-safe cryptographic identifier")));
  // Presentation only: retain every original popup handler and filtering rule.
  let popup = result.get('popup-fenix.html').toString('utf8');
  popup = replace(popup, '<link rel="stylesheet" href="css/popup-fenix.css">', '<link rel="stylesheet" href="css/popup-fenix.css">\n<link rel="stylesheet" href="blanc-popup.css">');
  popup = replace(popup, '<script src="js/popup-fenix.js" type="module"></script>', '<script src="blanc-popup.js"></script>\n<script src="js/popup-fenix.js" type="module"></script>');
  result.set('popup-fenix.html', Buffer.from(popup));
  let popupScript = result.get('js/popup-fenix.js').toString('utf8');
  popupScript = replace(popupScript, '    renderTooltips();\n};', '    renderTooltips();\n    self.BlancUboPopupUI?.update(popupData);\n};');
  popupScript = replace(popupScript, '    for ( let i = 0; i < maxNumberOfSections; i++ ) {\n        const bit = 1 << (more ?', '    if ( self.BlancUboPopupUI ) {\n        newBits = (more ? (1 << maxNumberOfSections) - 1 : 0b00101) & offbits | onbits;\n    } else for ( let i = 0; i < maxNumberOfSections; i++ ) {\n        const bit = 1 << (more ?');
  popupScript = replace(popupScript, "dom.on('#moreButton', 'click', ( ) => { toggleSections(true); });", "if ( self.BlancUboPopupUI ) self.BlancUboPopupUI.expand = toggleSections;\ndom.on('#moreButton', 'click', ( ) => { toggleSections(true); });");
  popupScript = replace(popupScript, "let url = dom.attr(ev.target, 'href');", "let url = dom.attr(ev.currentTarget, 'href'); // Blanc: preserve links with presentation children");
  result.set('js/popup-fenix.js', Buffer.from(popupScript));
  // Scope Blanc presentation to reviewed dashboard pages, never webpages or tools.
  for (const name of ['dashboard.html', 'settings.html', '3p-filters.html', '1p-filters.html', 'dyna-rules.html', 'whitelist.html', 'support.html', 'about.html', 'advanced-settings.html']) {
    let html = result.get(name).toString('utf8');
    html = replace(html, '</head>', '<link rel="stylesheet" href="blanc-dashboard.css">\n</head>');
    html = replace(html, '</body>', '<script src="blanc-dashboard.js"></script>\n</body>');
    result.set(name, Buffer.from(html));
  }
  result.set('js/support.js', Buffer.from(replace(result.get('js/support.js').toString('utf8'),
    '    autofocus: true,', '    autofocus: false, // Blanc: open Support at its heading; Select all still focuses the editor')));
  result.set('blanc-dashboard.js', Buffer.from(hostSources.dashboardScript));
  result.set('blanc-dashboard.css', Buffer.from(hostSources.dashboardStyle));
  result.set('blanc-popup.js', Buffer.from(hostSources.popupScript));
  result.set('blanc-popup.css', Buffer.from(hostSources.popupStyle));
  result.set('blanc-sunrise.png', Buffer.from(hostSources.popupMark));
  result.set('blanc-inter.woff2', Buffer.from(hostSources.popupFont));
  for (const name of UI_ICONS) result.set('blanc-icons/' + name + '.svg', Buffer.from(hostSources.popupIcons.get(name)));
  const manifest = JSON.parse(result.get('manifest.json'));
  manifest.content_scripts[0].js.unshift('blanc-state.js');
  result.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  result.set('blanc-state.js', Buffer.from(`// Added by Blanc on 2026-10-02: master blocking switch lifecycle.
'use strict';
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id || message?.blancFilteringDisabled !== true) return;
  // Stop observers and procedural work. Scriptlet/DOM changes already made
  // are intentionally not reversed; they require an explicit page reload.
  self.vAPI?.shutdown?.exec();
});
`));
  result.set('blanc-host.js', Buffer.from(hostSources.adapter));
  result.set('blanc-bridge.html', Buffer.from('<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'"></head><body><script src="blanc-bridge.js"></script></body></html>'));
  result.set('blanc-bridge.js', Buffer.from(hostSources.bridge));
  for (const [name, before] of files) {
    if (!name.endsWith('.js') || result.get(name).equals(before)) continue;
    result.set(name, Buffer.from('// Modified by Blanc on 2026-10-02: browser host adaptation and pinned executable-resource policy.\n' + result.get(name).toString('utf8')));
  }
  return result;
}

function installVerifiedFiles(adapted, destination) {
  if (adapted.size > 2000) throw new Error('ubo-package-capacity');
  for (const [name] of adapted) {
    if (!/^[a-zA-Z0-9_./+@-]+$/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('ubo-package-path');
  }
  // Reject parent symlinks before reading or replacing managed files. A
  // compromised extraction may never redirect writes outside this profile.
  for (let current = path.resolve(destination); current !== path.dirname(current); current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('ubo-package-symlink');
  }
  const verify = directory => {
    try {
      // Only known extension bytes may execute, including after interrupted updates.
      let count = 0;
      const scan = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) throw new Error('ubo-package-symlink');
          if (entry.isDirectory()) scan(path.join(dir, entry.name));
          else if (entry.isFile()) count++;
          else throw new Error('ubo-package-type');
        }
      };
      scan(directory);
      if (count !== adapted.size) return false;
      for (const [name, bytes] of adapted) {
        if (!fs.readFileSync(path.join(directory, name)).equals(Buffer.from(bytes))) return false;
      }
      return true;
    } catch { return false; }
  };
  if (!verify(destination)) {
    const parent = path.dirname(destination);
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    const stagingPrefix = `.${path.basename(destination)}.staging-`;
    // Staging directories contain only verified executable assets, never
    // user storage. Recover interrupted installs without accumulating files.
    for (const name of fs.readdirSync(parent)) if (name.startsWith(stagingPrefix)) fs.rmSync(path.join(parent, name), { recursive: true, force: true });
    const staging = fs.mkdtempSync(path.join(parent, stagingPrefix));
    try {
      for (const [name, bytes] of adapted) {
        const file = path.join(staging, name);
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
      }
      if (!verify(staging)) throw new Error('ubo-extraction-integrity');
      // No user configuration lives here. A crash before rename is recovered
      // by recreating this exact managed package at the same identity path.
      const backup = path.join(parent, `.${path.basename(destination)}.previous`);
      fs.rmSync(backup, { recursive: true, force: true });
      if (fs.existsSync(destination)) fs.renameSync(destination, backup);
      try { fs.renameSync(staging, destination); }
      catch (error) { if (fs.existsSync(backup)) fs.renameSync(backup, destination); throw error; }
      fs.rmSync(backup, { recursive: true, force: true });
    } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  }
  return destination;
}

function installVerifiedPackage({ root, destination, hostSources }) {
  const { pin, files } = readVerifiedPackage(root);
  const adapted = adaptPackage(files, hostSources);
  installVerifiedFiles(adapted, destination);
  return { path: destination, version: pin.version, scripts: new Map([...adapted].filter(([name]) => name.endsWith('.js'))) };
}

module.exports = { hash, readVerifiedPackage, adaptPackage, installVerifiedPackage, installVerifiedFiles, readHostSources, HOST_INPUTS };
