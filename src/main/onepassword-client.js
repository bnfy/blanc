'use strict';

const path = require('node:path');

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const IDLE_EXIT_MS = 10 * 60 * 1000;

class OnePasswordError extends Error {
  constructor(code) {
    super(code);
    this.name = 'OnePasswordError';
    this.code = code;
  }
}

function brokerEnvironment(source = process.env) {
  const allowed = [
    'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'PATH',
    'TMPDIR', 'TMP', 'TEMP',
    'XDG_RUNTIME_DIR', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME',
    'DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS',
  ];
  return Object.fromEntries(allowed
    .filter((name) => typeof source[name] === 'string')
    .map((name) => [name, source[name]]));
}

function createOnePasswordClient({
  utilityProcess,
  modulePath = path.join(__dirname, 'onepassword-broker.js'),
  platform = process.platform,
  env = brokerEnvironment(),
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
  idleExitMs = IDLE_EXIT_MS,
} = {}) {
  if (!utilityProcess?.fork) throw new TypeError('utilityProcess.fork is required');
  let child = null;
  let sequence = 0;
  let idleTimer = null;
  const pending = new Map();

  const clearIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  const rejectPending = (code) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new OnePasswordError(code));
    }
    pending.clear();
  };

  const stop = () => {
    clearIdle();
    const active = child;
    child = null;
    if (active) active.kill();
    rejectPending('broker-stopped');
  };

  const scheduleIdleExit = () => {
    clearIdle();
    if (pending.size || !child) return;
    idleTimer = setTimeout(stop, idleExitMs);
    idleTimer.unref?.();
  };

  const ensureChild = () => {
    if (child) return child;
    const spawned = utilityProcess.fork(modulePath, [], {
      env,
      execArgv: [],
      stdio: 'ignore',
      serviceName: 'Blanc Credential Broker',
      ...(platform === 'darwin' ? { allowLoadingUnsignedLibraries: true } : {}),
    });
    child = spawned;
    spawned.on('message', (message) => {
      const request = pending.get(message?.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.ok === true) request.resolve(message.value);
      else request.reject(new OnePasswordError(
        typeof message.error === 'string' ? message.error : 'sdk-error'
      ));
      scheduleIdleExit();
    });
    spawned.once('exit', () => {
      if (child !== spawned) return;
      child = null;
      clearIdle();
      rejectPending('broker-unavailable');
    });
    spawned.once('error', () => {
      if (child !== spawned) return;
      child = null;
      clearIdle();
      rejectPending('broker-unavailable');
    });
    return spawned;
  };

  const request = (method, payload) => new Promise((resolve, reject) => {
    clearIdle();
    const active = ensureChild();
    const id = ++sequence;
    const timer = setTimeout(() => {
      if (!pending.delete(id)) return;
      reject(new OnePasswordError('timed-out'));
      // A native authorization call cannot be cancelled selectively. End the
      // broker so a late secret reply can never arrive into a newer flow.
      stop();
    }, requestTimeoutMs);
    timer.unref?.();
    pending.set(id, { resolve, reject, timer });
    try {
      active.postMessage({ id, method, payload });
    } catch {
      pending.delete(id);
      clearTimeout(timer);
      reject(new OnePasswordError('broker-unavailable'));
      if (child === active) child = null;
      active.kill();
    }
  });

  return {
    findLogins: (account, pageUrl) => request('find-logins', { account, pageUrl }),
    revealCredential: (account, ref, fields) => request('reveal-credential', {
      account,
      vaultId: ref?.vaultId,
      itemId: ref?.itemId,
      expectedItemVersion: ref?.itemVersion ?? null,
      includeUsername: fields?.username === true,
      includePassword: fields?.password === true,
    }),
    probePackage: () => request('probe-package', {}),
    stop,
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  IDLE_EXIT_MS,
  OnePasswordError,
  brokerEnvironment,
  createOnePasswordClient,
};
