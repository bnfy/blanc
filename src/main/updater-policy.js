'use strict';

const path = require('node:path');

const STAGING_CHANNEL = 'staging';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function disabled(reason) {
  return {
    enabled: false,
    mode: 'disabled',
    reason,
    feed: null,
    allowPrerelease: false,
    autoInstall: false,
    statusFile: null,
  };
}

function production() {
  return {
    enabled: true,
    mode: 'production',
    reason: null,
    feed: null,
    allowPrerelease: false,
    autoInstall: false,
    statusFile: null,
  };
}

function parseStagingUrl(raw, allowHttp) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('BLANC_UPDATE_STAGING_URL must be an absolute URL');
  }

  const loopbackHttp =
    url.protocol === 'http:' &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    allowHttp;
  if (url.protocol !== 'https:' && !loopbackHttp) {
    throw new Error(
      'the staging update feed must use HTTPS (HTTP is allowed only for an explicitly enabled loopback smoke)'
    );
  }
  if (url.username || url.password) {
    throw new Error('the staging update feed URL must not contain credentials');
  }
  if (url.search || url.hash) {
    throw new Error('the staging update feed URL must not contain a query or fragment');
  }

  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.toString();
}

/**
 * Resolve the updater's one allowed runtime override. Ordinary packaged builds
 * keep using the signed app-update.yml GitHub configuration. A staging feed is
 * selected only by the exact channel opt-in plus a separately supplied URL;
 * malformed opt-ins disable updating instead of falling back to Stable.
 */
function resolveUpdaterPolicy({ isPackaged, env = process.env } = {}) {
  if (!isPackaged) return disabled('development builds do not self-update');

  const requestedChannel = String(env.BLANC_UPDATE_CHANNEL || '').trim();
  if (!requestedChannel) return production();
  if (requestedChannel !== STAGING_CHANNEL) {
    return disabled(`unsupported BLANC_UPDATE_CHANNEL: ${requestedChannel}`);
  }

  const rawUrl = String(env.BLANC_UPDATE_STAGING_URL || '').trim();
  if (!rawUrl) return disabled('BLANC_UPDATE_STAGING_URL is required for the staging channel');

  let url;
  try {
    url = parseStagingUrl(
      rawUrl,
      env.BLANC_UPDATE_STAGING_ALLOW_HTTP === '1'
    );
  } catch (err) {
    return disabled(err.message);
  }

  const autoInstall = env.BLANC_UPDATE_STAGING_AUTO_INSTALL === '1';
  const rawStatusFile = String(env.BLANC_UPDATE_STAGING_STATUS_FILE || '').trim();
  if (rawStatusFile && !autoInstall) {
    return disabled('the staging status file is available only during the auto-install smoke');
  }
  if (rawStatusFile && !path.isAbsolute(rawStatusFile)) {
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
      // The smoke server deliberately implements ordinary single ranges. The
      // update still exercises metadata, integrity, signature, replacement,
      // and relaunch without depending on multipart-range server behaviour.
      useMultipleRangeRequest: false,
    },
    allowPrerelease: true,
    autoInstall,
    statusFile: rawStatusFile || null,
  };
}

module.exports = { STAGING_CHANNEL, resolveUpdaterPolicy };
