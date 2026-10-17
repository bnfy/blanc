'use strict';
// Copied into an extracted disposable app. Observe the existing coordinator's
// provider, never replace native listeners, rules, decisions or browser APIs.
const fs = require('node:fs');
const { app, webContents } = require('electron');
if (process.env.BLANC_TEST === '1') throw new Error('Capture requires the real blocker');
const expected = process.env.BLANC_F12_PROFILE;
if (!expected || fs.realpathSync(app.getPath('userData')) !== fs.realpathSync(expected)) {
  throw new Error('Unexpected capture profile: ' + app.getPath('userData'));
}
const log = process.env.BLANC_F12_LOG;
if (!log) throw new Error('Capture log required');
const modulePath = './src/main/blocking-coordinator.js';
const coordinatorModule = require(modulePath);
const create = coordinatorModule.createBlockingCoordinator;
const providers = [];
const activeGates = new Set();
const safe = fn => { try { return fn() ?? null; } catch { return null; } };
coordinatorModule.createBlockingCoordinator = function(...args) {
  const coordinator = create(...args);
  const setGate = coordinator.setGate;
  coordinator.setGate = function(session, listener) {
    if (listener) activeGates.add(session); else activeGates.delete(session);
    return setGate(session, listener);
  };
  const set = coordinator.setProvider;
  const wrapped = new WeakMap();
  coordinator.setProvider = function(session, provider) {
    if (!provider) return set(session, provider);
    if (!wrapped.has(provider)) {
      const observer = Object.create(provider);
      const profileKind = session.isPersistent() ? 'regular' : 'private';
      observer.decide = async function(event, details) {
        if (event !== 'onBeforeRequest') {
          return provider.decide(event, details);
        }
        const wc = safe(() => webContents.fromId(details.webContentsId));
        // These are raw values at the real hook, not expected fixture context.
        const observed = {
          requestId: String(details.id), url: details.url, method: details.method,
          resourceType: details.resourceType, referrer: details.referrer ?? null,
          initiatorOrigin: details.initiatorOrigin ?? null,
          initiatorOriginPresent: Object.hasOwn(details, 'initiatorOrigin'), webContentsId: details.webContentsId ?? null,
          frame: safe(() => ({ url: details.frame.url, origin: details.frame.origin,
            routingId: details.frame.routingId, processId: details.frame.processId,
            topUrl: details.frame.top.url, topOrigin: details.frame.top.origin })),
          tabUrl: safe(() => wc.getURL()), profileKind,
          sessionPersistent: session.isPersistent(), provider: provider.id,
          status: provider.status(), timestamp: new Date().toISOString(),
        };
        try {
          const result = await provider.decide(event, details);
          fs.appendFileSync(log, JSON.stringify({ ...observed, result: result ?? {} }) + '\n');
          return result;
        } catch (error) {
          fs.appendFileSync(log, JSON.stringify({ ...observed, error: String(error) }) + '\n');
          throw error;
        }
      };
      wrapped.set(provider, observer);
      providers.push({ session, provider });
    }
    return set(session, wrapped.get(provider));
  };
  return coordinator;
};
globalThis.__blancF12Capture = {
  state: () => ({ userData: app.getPath('userData'), versions: process.versions, activeGates: activeGates.size,
    providers: providers.map(({session, provider}) => ({persistent: session.isPersistent(),
      status: provider.status()})) }),
};
require('./src/main/main.js');
