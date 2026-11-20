// Names and records of Blanc's updater on Windows (W3 Task B2), for the
// runner check in chromium/tests/windows-updater.mjs. The names come from the
// file that brands the updater, so the check can't drift from the build.

const value = (text, name) => {
  const m = new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, 'm').exec(text);
  if (!m) throw new Error(`updater.gni has no ${name}`);
  return m[1];
};

// updater.gni's text -> {company, product, browserAppId}.
export function updaterNames(text) {
  return {company: value(text, 'updater_company_short_name'), product: value(text, 'updater_product_full_name'),
    browserAppId: value(text, 'browser_appid')};
}

// Where the beta registers its version for a per-user updater (patch 0101).
export const clientsKey = names => `HKEY_CURRENT_USER\\Software\\${names.company}\\Update\\Clients\\${names.browserAppId}`;

// A per-user updater's folder (chrome/updater/util/win_path_util.cc).
export const updaterFolder = (localAppData, names) => `${localAppData}\\${names.company}\\${names.product}`;

// The app ids in the updater's prefs.json, as it stores them (lower case).
export function registeredApps(prefsText) {
  try { return Object.keys(JSON.parse(prefsText)?.updateclientdata?.apps ?? {}).map(id => id.toLowerCase()); }
  catch { return []; }
}

// The tag of Blanc Beta's online installer (chrome/updater/tag.h): the beta's
// app id and name, installed per user (needsadmin: true, false or prefers,
// as chrome/updater/tag.cc parses it). The signed UpdaterSetup.exe carries it
// in its certificate table; `UpdaterSetup.exe --install=<tag>` takes the same.
export const installTag = names => `appguid=${names.browserAppId}&appname=Blanc%20Beta&needsadmin=false`;
