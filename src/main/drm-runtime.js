'use strict';

// Explicitly invoked by the diagnostic harness; never installs components at startup.
// ECS API: https://github.com/castlabs/electron-releases/blob/master/docs/api/components.md
function createDrmRuntime({ app, components, platform = process.platform, timeoutMs = 30_000 } = {}) {
  if (!app || typeof app.whenReady !== 'function') throw new TypeError('Electron app required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Positive timeout required');
  let state = 'idle';
  let pending = null;
  let exhausted = false;
  let registrationStatus = null;
  let completionStatus = null;
  const supported = Boolean(components && typeof components.status === 'function' &&
    typeof components.whenReady === 'function' && typeof components.WIDEVINE_CDM_ID === 'string' &&
    components.WIDEVINE_CDM_ID.length);
  const snapshot = () => ({ state: supported ? state : 'unsupported', supported,
    // Component readiness is not proof of a production VMP signature or playback.
    playbackVerified: false });

  async function inspect() {
    if (!supported) return snapshot();
    await app.whenReady();
    try {
      const status = components.status()?.[components.WIDEVINE_CDM_ID];
      return { ...snapshot(), updatesEnabled: components.updatesEnabled === true,
        registrationStatus, completionStatus,
        componentStatus: typeof status?.status === 'string' ? status.status.slice(0, 80) : null,
        version: typeof status?.version === 'string' ? status.version.slice(0, 80) : null };
    } catch {
      return { ...snapshot(), error: 'status-unavailable' };
    }
  }

  function prepare() {
    if (pending) return pending;
    if (!supported || exhausted || state === 'ready' || state === 'restart-required') {
      return Promise.resolve(snapshot());
    }
    // One explicit attempt per adapter. A timed-out native install cannot be
    // cancelled through ECS; never start overlapping retries or trust late success.
    exhausted = true;
    pending = (async () => {
      state = 'preparing';
      let timer;
      try {
        await Promise.race([
          (async () => {
            await app.whenReady();
            if (!components.updatesEnabled) return 'updates-disabled';
            const before = components.status()?.[components.WIDEVINE_CDM_ID];
            registrationStatus = typeof before?.status === 'string' ? before.status.slice(0, 80) : null;
            const results = await components.whenReady([components.WIDEVINE_CDM_ID]);
            const result = Array.isArray(results) ? results.find(item => item?.id === components.WIDEVINE_CDM_ID) : null;
            completionStatus = typeof result?.status === 'string' ? result.status.slice(0, 80) : null;
            // ECS registers existing components asynchronously. Its `new`
            // result means newly registered in this process, not downloaded.
            // On the pinned Linux runtime this is available before sandbox
            // startup, unlike `updated` (first install/update needs restart).
            const registeredInstalled = result?.status === 'new'
              && typeof result.version === 'string' && /^\d+(?:\.\d+){1,3}$/.test(result.version);
            return platform === 'linux' && !before?.version && !registeredInstalled ? 'restart-required' : 'ready';
          })(),
          new Promise(resolve => { timer = setTimeout(() => resolve('timed-out'), timeoutMs); }),
        ]).then(value => { state = value; });
      } catch {
        // Vendor errors may contain URLs, filesystem paths or license details.
        state = 'installation-failed';
      } finally {
        clearTimeout(timer);
      }
      return snapshot();
    })();
    return pending;
  }

  return { inspect, prepare };
}

module.exports = { createDrmRuntime };
