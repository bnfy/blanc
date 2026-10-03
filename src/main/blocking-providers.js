'use strict';
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const builtin = require('./adblock');
const matrix = require('./ublock-platforms.json');
const { isBrowserResource } = require('./blocking-resources');
const { createUblockProvider } = require('./ublock-provider');

function createBlockingProviders({ settings, hooks, onStateChange, onBlocked }) {
  const active = settings.getSettings().adblockProvider;
  let lastEnabled = settings.getSettings().adblockEnabled;
  let lastSelected = active;
  const diagnostics = [];
  const profiles = new Map();
  const sessions = new Map();
  const metadata = app.isPackaged ? require('../../package.json') : {};
  const bundled = !app.isPackaged || metadata.blancUblockBundled === true;
  const internalCandidate = app.isPackaged && metadata.blancUblockInternalValidation === true;
  const test = !app.isPackaged && process.env.BLANC_UBLOCK_TEST === '1';
  const platform = matrix.platforms[`${process.platform}-${process.arch}`];
  const supported = !!(test || bundled && ((internalCandidate && platform && matrix.electron === process.versions.electron) || (platform?.enabled === true && matrix.electron === process.versions.electron)));
  function status(profileId) {
    const provider = profiles.get(profileId)?.provider;
    const selected = settings.getSettings().adblockProvider;
    const startup = hooks.startupStatus?.();
    const startupFailed = startup?.phase === 'failed';
    const builtinPhase = ['ready', 'failed', 'initializing'].includes(startup?.phase) ? startup.phase
      : ['disabled', 'continued', 'skipped'].includes(startup?.phase) ? 'disabled' : 'initializing';
    return {
      selected, active, restartPending: selected !== active,
      exposed: !app.isPackaged || internalCandidate || bundled && Object.values(matrix.platforms).some(value => value.enabled) || selected === 'ublock-origin' || active === 'ublock-origin',
      internalCandidate, supported, reason: supported ? null : platform?.reason || 'Runtime/platform acceptance pending',
      enabled: settings.getSettings().adblockEnabled,
      ...provider?.status(),
      phase: active === 'ublock-origin' ? provider?.status().phase ?? (supported ? (startupFailed ? 'failed' : 'initializing') : 'unsupported') : builtinPhase,
      error: provider?.status().error ?? (startupFailed ? 'blanc-initialization-failed' : null),
      electron: process.versions.electron, ublock: matrix.ublock, diagnostics: diagnostics.slice(-16),
    };
  }
  function forTab(tab) { return tab && !tab.private ? profiles.get(tab.profileId)?.provider ?? null : null; }
  function effectiveForTab(tab) {
    if (!tab) return null;
    const owned = sessions.get(tab.profileId);
    return tab.private || active === 'blanc' ? (owned ? builtin.providerForSession(tab.private ? owned.private : owned.normal) : null) : forTab(tab);
  }
  function refresh() { for (const entry of profiles.values()) entry.provider?.refresh(); }
  function prepare(profileId, owned) {
    sessions.set(profileId, owned);
    builtin.attachAdBlockerToSession(owned.private, { enabled: settings.getSettings().adblockEnabled });
    if (active !== 'ublock-origin') {
      builtin.attachAdBlockerToSession(owned.normal, { enabled: settings.getSettings().adblockEnabled });
      return;
    }
    builtin.detachAdBlockerFromSession(owned.normal);
    if (!profiles.has(profileId)) {
      builtin.coordinator.setProvider(owned.normal, { decide: (_event, details) => !settings.getSettings().adblockEnabled || isBrowserResource(details.url, app.getAppPath()) ? {} : { cancel: true } });
    }
  }
  async function attach(profileId, owned) {
    prepare(profileId, owned);
    if (active !== 'ublock-origin') return;
    if (!supported) {
      onStateChange?.(status(profileId)); throw new Error('ubo-platform-unverified');
    }
    if (!profiles.has(profileId)) {
      const provider = createUblockProvider({
        session: owned.normal, profileId, hooks,
        onStateChange: state => {
          if (state.error) { diagnostics.push({ provider: state.id, version: state.version, error: state.error }); if (diagnostics.length > 32) diagnostics.shift(); }
          onStateChange?.(status(profileId));
        }, onBlocked,
      });
      profiles.set(profileId, { provider, session: owned.normal });
      builtin.coordinator.setProvider(owned.normal, provider);
      provider.setEnabled(settings.getSettings().adblockEnabled);
      await provider.initialize();
    } else if (profiles.get(profileId).provider.status().phase === 'initializing') {
      await profiles.get(profileId).provider.initialize();
    } else if (profiles.get(profileId).provider.status().phase === 'failed') {
      await profiles.get(profileId).provider.retry();
    }
  }
  async function attachAll(profileIds, sessionsFor) {
    const ids = [...profileIds];
    // Attach every private blocker and normal-session failure gate before
    // yielding. One failed background must never leave another profile raw.
    for (const id of ids) prepare(id, sessionsFor(id));
    const failures = [];
    for (const id of ids) {
      try { await attach(id, sessionsFor(id)); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'blocking-profile-initialization-failed');
  }
  function setEnabled(value) {
    const selected = settings.getSettings().adblockProvider;
    const changed = value !== lastEnabled;
    const selectionChanged = selected !== lastSelected;
    lastEnabled = value; lastSelected = selected;
    if (changed) {
      builtin.setAdBlockEnabled(value);
      for (const entry of profiles.values()) entry.provider.setEnabled(value);
    }
    if (changed || selectionChanged) onStateChange?.();
  }
  async function retry() {
    for (const entry of profiles.values()) {
      if (entry.provider.status().phase !== 'failed') continue;
      await entry.provider.retry();
    }
    return true;
  }
  async function dispose(profileId, providedSessions) {
    const owned = sessions.get(profileId) || providedSessions;
    const destination = path.join(app.getPath('userData'), 'managed-ublock', profileId);
    let provider = profiles.get(profileId)?.provider;
    // Provider selection may have changed since this profile used uBO. Load
    // the verified principal only to erase its native store; no website views
    // remain, and filtering selection is unchanged. Failure retains the
    // existing crash-resumable deletion marker rather than claiming success.
    if (!provider && bundled && fs.existsSync(destination)) {
      if (!owned) throw new Error('ubo-deletion-session-unavailable');
      builtin.detachAdBlockerFromSession(owned.normal);
      provider = createUblockProvider({ session: owned.normal, profileId, hooks });
      provider.setEnabled(false);
      profiles.set(profileId, { provider, session: owned.normal });
      sessions.set(profileId, owned);
      builtin.coordinator.setProvider(owned.normal, provider);
    }
    // An ordinary build may omit uBO altogether. Profile deletion still clears
    // both entire native sessions in main; no absent extension is loaded just
    // to erase data, and the durable deletion marker covers that storage step.
    if (provider) { await provider.eraseStorage(); provider.dispose(); }
    profiles.delete(profileId);
    if (owned) for (const value of [owned.normal, owned.private]) {
      builtin.detachAdBlockerFromSession(value);
      builtin.coordinator.setProvider(value, null);
    }
    sessions.delete(profileId);
    fs.rmSync(destination, { recursive: true, force: true });
  }
  function stop() { for (const entry of profiles.values()) entry.provider.dispose(); profiles.clear(); sessions.clear(); }
  return { active, status, attach, attachAll, forTab, effectiveForTab, refresh, setEnabled, retry, dispose, stop, notify: () => onStateChange?.() };
}
module.exports = { createBlockingProviders };
