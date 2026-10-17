'use strict';

// The name this device publishes to its synced peers (tab-sync spec §4).
// os.hostname() is the kernel hostname, which macOS takes from the network
// when the router offers one — a MacBook Pro can show up as "mac.lan" — and
// which changes with the network. So a Mac is named by its computer name
// (the one in System Settings → General → About), read once per launch, and
// every platform drops a local-network suffix from the hostname fallback.
// The hostname itself is still read at each publish so a rename propagates.

const os = require('os');
const { execFileSync } = require('child_process');

const MAX_NAME = 80; // tabsync-model.js sanitizeEntry caps names the same way
const LOCAL_SUFFIX = /\.(?:local|lan|home|localdomain)$/i;
const SCUTIL_TIMEOUT_MS = 2000;

/** Pure: pick and trim the name from what the platform offers. */
function humanDeviceName({ platform, hostname, computerName }) {
  const computer = typeof computerName === 'string' ? computerName.trim() : '';
  if (platform === 'darwin' && computer) return computer.slice(0, MAX_NAME);
  const host = typeof hostname === 'string' ? hostname.trim().replace(LOCAL_SUFFIX, '') : '';
  return (host || 'unknown device').slice(0, MAX_NAME);
}

/** macOS computer name via scutil; empty on any failure (no scutil, timeout,
 * a sandbox that forbids child processes), which selects the hostname path. */
function readComputerName(exec = execFileSync) {
  try {
    return exec('scutil', ['--get', 'ComputerName'], {
      encoding: 'utf8',
      timeout: SCUTIL_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const launchCache = {};

function deviceName({
  platform = process.platform,
  hostname = os.hostname,
  exec = execFileSync,
  cache = launchCache,
} = {}) {
  if (platform === 'darwin' && !('computerName' in cache)) cache.computerName = readComputerName(exec);
  return humanDeviceName({
    platform,
    hostname: hostname(),
    computerName: platform === 'darwin' ? cache.computerName : '',
  });
}

module.exports = { humanDeviceName, readComputerName, deviceName, MAX_NAME };
