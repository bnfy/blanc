'use strict';

// Explicitly invoked by the diagnostic harness; never installs components at startup.
// ECS API: https://github.com/castlabs/electron-releases/blob/master/docs/api/components.md
function createDrmRuntime({ app, components, platform = process.platform, timeoutMs = 30_000, linuxPreloadedVersion } = {}) {
  if (!app || typeof app.whenReady !== 'function') throw new TypeError('Electron app required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Positive timeout required');
  let state = 'idle';
  let pending = null;
  let exhausted = false;
  let registrationStatus = null;
  let completionStatus = null;
  let preparedVersion = null;
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
      if (platform === 'linux' && state === 'ready' && preparedVersion
        && typeof status?.version === 'string' && /^\d+(?:\.\d+){1,3}$/.test(status.version)
        && status.version !== preparedVersion) {
        state = 'restart-required';
      }
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
        const outcome = await Promise.race([
          (async () => {
            await app.whenReady();
            if (!components.updatesEnabled) return { state: 'updates-disabled' };
            const before = components.status()?.[components.WIDEVINE_CDM_ID];
            const registered = typeof before?.status === 'string' ? before.status.slice(0, 80) : null;
            const results = await components.whenReady([components.WIDEVINE_CDM_ID]);
            const result = Array.isArray(results) ? results.find(item => item?.id === components.WIDEVINE_CDM_ID) : null;
            const completed = typeof result?.status === 'string' ? result.status.slice(0, 80) : null;
            const prepared = linuxPreloadedVersion !== undefined ? linuxPreloadedVersion
              : typeof result?.version === 'string' ? result.version
                : typeof before?.version === 'string' ? before.version : null;
            // ECS registers existing components asynchronously. Its `new`
            // result means newly registered in this process, not downloaded.
            // On the pinned Linux runtime this identifies a pre-existing
            // component; `updated` denotes installation and needs a restart.
            const registeredInstalled = result?.status === 'new'
              && typeof result.version === 'string' && /^\d+(?:\.\d+){1,3}$/.test(result.version);
            const nextState = platform === 'linux' && (result?.status === 'updated'
              || (linuxPreloadedVersion !== undefined && result?.version !== linuxPreloadedVersion)
              || (!before?.version && !registeredInstalled))
              ? 'restart-required' : 'ready';
            return { state: nextState, registered, completed, prepared };
          })(),
          new Promise(resolve => { timer = setTimeout(() => resolve({ state: 'timed-out' }), timeoutMs); }),
        ]);
        // Only the race winner may publish state or component metadata.
        state = outcome.state;
        registrationStatus = outcome.registered ?? null;
        completionStatus = outcome.completed ?? null;
        preparedVersion = outcome.prepared ?? null;
      } catch {
        // Vendor errors may contain URLs, filesystem paths or license details.
        state = 'installation-failed';
      } finally {
        clearTimeout(timer);
        pending = null;
      }
      return snapshot();
    })();
    return pending;
  }

  return { inspect, prepare };
}

module.exports = { createDrmRuntime };
