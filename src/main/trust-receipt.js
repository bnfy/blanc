const path = require('node:path');
const { execFile } = require('node:child_process');
const { extractCommonName, runAuthenticodeSignature } = require('./updater-signature');

const MAC_TEAM_ID = 'XYGUCY4498';
const MAC_BUNDLE_ID = 'me.bnfy.bowser';
const MAC_PUBLISHER = 'Developer ID Application: Anthony Loria (XYGUCY4498)';
const WINDOWS_PUBLISHER = 'Bananify Creative';

function exec(file, args, execFileImpl = execFile) {
  return new Promise((resolve) => {
    execFileImpl(file, args, { timeout: 30_000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, output: `${stdout ?? ''}\n${stderr ?? ''}` });
    });
  });
}

function macAppPath(executablePath) {
  const marker = '.app/Contents/';
  const index = String(executablePath).indexOf(marker);
  return index === -1 ? null : String(executablePath).slice(0, index + 4);
}

function parseMacIdentity(output) {
  const authorities = [...String(output).matchAll(/^Authority=(.+)$/gm)].map((match) => match[1].trim());
  return {
    publisher: authorities[0] ?? null,
    teamId: /^TeamIdentifier=(.+)$/m.exec(output)?.[1]?.trim() ?? null,
    bundleId: /^Identifier=(.+)$/m.exec(output)?.[1]?.trim() ?? null,
  };
}

async function inspectMacSignature(executablePath, execFileImpl) {
  const appPath = macAppPath(executablePath);
  if (!appPath) return { status: 'unavailable', expectedPublisher: MAC_PUBLISHER, observedPublisher: null };
  const verify = await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], execFileImpl);
  const details = await exec('/usr/bin/codesign', ['-dv', '--verbose=4', appPath], execFileImpl);
  const identity = parseMacIdentity(details.output);
  const exact = !verify.error && !details.error && identity.publisher === MAC_PUBLISHER
    && identity.teamId === MAC_TEAM_ID && identity.bundleId === MAC_BUNDLE_ID;
  return {
    status: exact ? 'verified' : 'mismatch',
    expectedPublisher: MAC_PUBLISHER,
    observedPublisher: identity.publisher,
    teamId: identity.teamId,
    bundleId: identity.bundleId,
  };
}

async function inspectWindowsSignature(executablePath, run = runAuthenticodeSignature) {
  const { error, stdout } = await run(executablePath);
  if (error) return { status: 'unavailable', expectedPublisher: WINDOWS_PUBLISHER, observedPublisher: null };
  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    return { status: 'unavailable', expectedPublisher: WINDOWS_PUBLISHER, observedPublisher: null };
  }
  const observed = extractCommonName(result?.SignerCertificate?.Subject ?? '');
  return {
    status: result?.Status === 0 && observed === WINDOWS_PUBLISHER ? 'verified' : 'mismatch',
    expectedPublisher: WINDOWS_PUBLISHER,
    observedPublisher: observed || null,
  };
}

async function inspectLocalSignature({ platform, packaged, executablePath, execFileImpl, runAuthenticode } = {}) {
  if (!packaged) {
    return { status: 'development', expectedPublisher: null, observedPublisher: null };
  }
  if (platform === 'darwin') return inspectMacSignature(executablePath, execFileImpl);
  if (platform === 'win32') return inspectWindowsSignature(executablePath, runAuthenticode);
  if (platform === 'linux') {
    return {
      status: 'manifest-backed',
      expectedPublisher: 'Signed release manifest',
      observedPublisher: null,
    };
  }
  return { status: 'unavailable', expectedPublisher: null, observedPublisher: null };
}

function buildTrustReceipt({ appInfo, signature, blocker, sync, choices, diagnostics, links }) {
  return {
    app: {
      version: String(appInfo.version),
      bundleBuild: String(appInfo.bundleBuild),
      electron: String(appInfo.electron),
      chromium: String(appInfo.chromium),
      node: String(appInfo.node),
      platform: String(appInfo.platform),
      architecture: String(appInfo.architecture),
      packaged: appInfo.packaged === true,
    },
    signature: { ...signature },
    blocker: {
      snapshotDate: blocker.date,
      combinedSha256: blocker.combinedSha256,
      lists: blocker.lists.map((list) => ({ name: path.basename(list.file, path.extname(list.file)), sha256: list.sha256 })),
    },
    sync: {
      enabled: sync.enabled === true,
      categories: ['Favorites', 'selected settings'],
      openTabsEnabled: sync.enabled === true && sync.syncTabs === true,
      openTabsCategory: 'open tabs and their locally cached icons',
      profileScope: 'Personal only',
    },
    choices: {
      usageMeasurement: choices.usagePing === true,
      searchSuggestions: choices.searchSuggestions === true,
      secureDns: String(choices.secureDns),
      crashLedger: { storedLocally: true, automaticUpload: false, eventLimit: 50, eventCount: diagnostics.count },
    },
    links: links.map(({ id, label }) => ({ id, label })),
  };
}

module.exports = {
  MAC_TEAM_ID,
  MAC_BUNDLE_ID,
  MAC_PUBLISHER,
  WINDOWS_PUBLISHER,
  buildTrustReceipt,
  inspectLocalSignature,
  macAppPath,
  parseMacIdentity,
};
