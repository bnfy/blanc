'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STAGING_CHANNEL = 'staging';
// Set by a Flatpak wrapper whose package manager delivers updates. Honored only
// inside a Flatpak sandbox; anywhere else it is just another unsupported value.
const FLATPAK_CHANNEL = 'flatpak';
const FLATPAK_INFO_FILE = '/.flatpak-info';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function disabled(reason) {
  return {
    enabled: false, mode: 'disabled', reason, feed: null,
    allowPrerelease: false, autoInstall: false, statusFile: null,
  };
}

function insideFlatpak() {
  try { return fs.statSync(FLATPAK_INFO_FILE).isFile(); } catch { return false; }
}

function production() {
  return {
    enabled: true, mode: 'production', reason: null, feed: null,
    allowPrerelease: false, autoInstall: false, statusFile: null,
  };
}

function parseStagingUrl(raw, allowHttp) {
  let url;
  try { url = new URL(raw); } catch {
    throw new Error('BLANC_UPDATE_STAGING_URL must be an absolute URL');
  }
  const loopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) && allowHttp;
  if (url.protocol !== 'https:' && !loopbackHttp) {
    throw new Error('the staging feed must use HTTPS; HTTP requires explicit loopback smoke mode');
  }
  if (url.username || url.password) throw new Error('the staging feed URL must not contain credentials');
  if (url.search || url.hash) throw new Error('the staging feed URL must not contain a query or fragment');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.toString();
}

function resolveUpdaterPolicy({
  isPackaged, env = process.env, platform = process.platform, isFlatpak = insideFlatpak,
} = {}) {
  if (!isPackaged) return disabled('development builds do not self-update');
  const channel = String(env.BLANC_UPDATE_CHANNEL || '').trim();
  if (!channel) return production();
  if (channel === FLATPAK_CHANNEL && platform === 'linux' && isFlatpak()) {
    return { ...disabled('updates for this copy of Blanc come from Flatpak'), mode: FLATPAK_CHANNEL };
  }
  if (channel !== STAGING_CHANNEL) return disabled(`unsupported BLANC_UPDATE_CHANNEL: ${channel}`);

  const rawUrl = String(env.BLANC_UPDATE_STAGING_URL || '').trim();
  if (!rawUrl) return disabled('BLANC_UPDATE_STAGING_URL is required for staging');
  let url;
  try { url = parseStagingUrl(rawUrl, env.BLANC_UPDATE_STAGING_ALLOW_HTTP === '1'); }
  catch (error) { return disabled(error.message); }

  const autoInstall = env.BLANC_UPDATE_STAGING_AUTO_INSTALL === '1';
  const statusFile = String(env.BLANC_UPDATE_STAGING_STATUS_FILE || '').trim();
  if (statusFile && !autoInstall) return disabled('the staging status file requires auto-install smoke mode');
  if (statusFile && !path.isAbsolute(statusFile)) {
    return disabled('BLANC_UPDATE_STAGING_STATUS_FILE must be an absolute path');
  }

  return {
    enabled: true,
    mode: STAGING_CHANNEL,
    reason: null,
    feed: {
      provider: 'generic',
      url,
      channel: STAGING_CHANNEL,
      useMultipleRangeRequest: false,
    },
    allowPrerelease: true,
    autoInstall,
    statusFile: statusFile || null,
  };
}

module.exports = { STAGING_CHANNEL, FLATPAK_CHANNEL, resolveUpdaterPolicy };
